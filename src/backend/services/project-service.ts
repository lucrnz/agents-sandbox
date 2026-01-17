import { randomUUID } from "crypto";
import { PassThrough } from "stream";
import archiver from "archiver";
import { Buffer } from "buffer";
import {
  createProject,
  deleteProject,
  deleteProjectFile,
  deleteProjectPathPrefix,
  ensureDefaultProject,
  getProject,
  getProjectFile,
  listProjectFiles,
  listProjects,
  upsertProjectFile,
} from "@/backend/db";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:project-service");

export type ProjectPermissionMode = "ask" | "yolo";
export type ProjectExportFormat = "zip" | "tar.gz";

export const IGNORED_PATH_PREFIXES = [
  "node_modules/",
  ".venv/",
  "venv/",
  "__pycache__/",
  ".git/",
  "dist/",
  "build/",
  "bin/",
  ".cache/",
  "coverage/",
  ".next/",
];

function normalizeProjectPath(inputPath: string): string {
  // Normalize slashes
  let p = inputPath.replaceAll("\\", "/");

  // Trim whitespace
  p = p.trim();

  // Disallow absolute paths
  if (p.startsWith("/")) {
    throw new Error("Project paths must be relative (no leading '/').");
  }

  // Collapse repeated slashes
  p = p.replaceAll(/\/+/g, "/");

  // Remove leading "./"
  while (p.startsWith("./")) p = p.slice(2);

  // Disallow traversal
  if (p === ".." || p.startsWith("../") || p.includes("/../") || p.endsWith("/..")) {
    throw new Error("Project paths cannot contain '..' segments.");
  }

  // Disallow empty
  if (!p) throw new Error("Project path cannot be empty.");

  return p;
}

function isIgnoredPath(projectPath: string): boolean {
  const p = projectPath.replaceAll("\\", "/");
  return IGNORED_PATH_PREFIXES.some((prefix) => p === prefix.slice(0, -1) || p.startsWith(prefix));
}

function guessMimeType(path: string): string | undefined {
  const lower = path.toLowerCase();
  if (lower.endsWith(".ts")) return "text/typescript";
  if (lower.endsWith(".tsx")) return "text/tsx";
  if (lower.endsWith(".js")) return "text/javascript";
  if (lower.endsWith(".jsx")) return "text/jsx";
  if (lower.endsWith(".json")) return "application/json";
  if (lower.endsWith(".md")) return "text/markdown";
  if (lower.endsWith(".html")) return "text/html";
  if (lower.endsWith(".css")) return "text/css";
  if (lower.endsWith(".txt")) return "text/plain";
  return undefined;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", (err) => reject(err));
  });
}

export class ProjectService {
  async listProjects() {
    await ensureDefaultProject();
    return await listProjects();
  }

  async createProject(input: { name: string; description?: string }) {
    if (!input.name.trim()) throw new Error("Project name cannot be empty.");
    return await createProject({
      name: input.name.trim(),
      description: input.description?.trim() || undefined,
    });
  }

  async deleteProject(projectId: string) {
    return await deleteProject(projectId);
  }

  async getProject(projectId: string) {
    return await getProject(projectId);
  }

  async listFiles(projectId: string) {
    return await listProjectFiles(projectId);
  }

  async readFileAsText(
    projectId: string,
    path: string,
  ): Promise<{ path: string; content: string; mimeType?: string }> {
    const normalized = normalizeProjectPath(path);
    const row = await getProjectFile(projectId, normalized);
    if (!row) throw new Error(`File not found: ${normalized}`);

    const bytes = row.content as unknown as Buffer;
    const content = bytes.toString("utf8");
    return { path: normalized, content, mimeType: row.mimeType || undefined };
  }

  async writeFileFromText(projectId: string, path: string, content: string) {
    const normalized = normalizeProjectPath(path);
    if (isIgnoredPath(normalized)) {
      throw new Error(`Refusing to store ignored path: ${normalized}`);
    }

    const bytes = Buffer.from(content, "utf8");
    return await upsertProjectFile({
      projectId,
      path: normalized,
      content: bytes,
      mimeType: guessMimeType(normalized),
    });
  }

  async writeFileFromBuffer(projectId: string, path: string, content: Buffer) {
    const normalized = normalizeProjectPath(path);
    if (isIgnoredPath(normalized)) {
      throw new Error(`Refusing to store ignored path: ${normalized}`);
    }

    return await upsertProjectFile({
      projectId,
      path: normalized,
      content,
      mimeType: guessMimeType(normalized),
    });
  }

  async deleteFile(projectId: string, path: string) {
    const normalized = normalizeProjectPath(path);
    if (isIgnoredPath(normalized)) return;
    await deleteProjectFile(projectId, normalized);
  }

  async deletePath(projectId: string, path: string, kind: "file" | "dir") {
    const normalized = normalizeProjectPath(path);
    if (isIgnoredPath(normalized)) return 0;

    if (kind === "dir") {
      return await deleteProjectPathPrefix(projectId, normalized);
    }

    await deleteProjectFile(projectId, normalized);
    return 1;
  }

  async exportProject(
    projectId: string,
    format: ProjectExportFormat,
  ): Promise<{
    filename: string;
    mimeType: string;
    bytes: Uint8Array;
  }> {
    const project = await getProject(projectId);
    if (!project) throw new Error("Project not found");

    const files = await listProjectFiles(projectId);

    const archiveNameSafe =
      (project.name || "project").replaceAll(/[^\w\-]+/g, "_").slice(0, 80) || "project";
    const timestamp = new Date().toISOString().replaceAll(/[:.]/g, "-");

    const pass = new PassThrough();
    const archive =
      format === "zip"
        ? archiver("zip", { zlib: { level: 9 } })
        : archiver("tar", { gzip: true, gzipOptions: { level: 9 } });

    archive.on("warning", (err) => {
      logger.warn({ error: err }, "Project export warning");
    });
    archive.on("error", (err) => {
      throw err;
    });

    archive.pipe(pass);

    for (const file of files) {
      const p = file.path;
      if (!p || isIgnoredPath(p)) continue;

      const bytes = file.content as unknown as Buffer;
      archive.append(bytes, { name: p });
    }

    await archive.finalize();
    const buffer = await streamToBuffer(pass);

    const filename = `${archiveNameSafe}_${timestamp}.${format === "zip" ? "zip" : "tar.gz"}`;
    const mimeType = format === "zip" ? "application/zip" : "application/gzip";

    return { filename, mimeType, bytes: buffer };
  }

  /**
   * Convenience helper to create a new empty project and return its id.
   * Useful when the agent wants to propose a new project name.
   */
  async createEmptyProjectWithSuggestedName(input: { suggestedName: string }) {
    const name = input.suggestedName.trim() || `Project ${randomUUID().slice(0, 8)}`;
    const created = await this.createProject({ name });
    return created;
  }
}
