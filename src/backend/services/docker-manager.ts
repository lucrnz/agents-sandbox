import Dockerode from "dockerode";
import type { Container } from "dockerode";
import archiver from "archiver";
import { PassThrough } from "stream";
import * as tarStream from "tar-stream";
import { ProjectService } from "@/backend/services/project-service";

type ConversationId = string;

type ManagedContainer = {
  container: Container;
  containerId: string;
  createdAt: number;
  lastUsedAt: number;
};

const INACTIVITY_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

const IGNORED_PATH_PREFIXES = [
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

function isIgnoredPath(relPath: string): boolean {
  const p = relPath.replaceAll("\\", "/");
  return IGNORED_PATH_PREFIXES.some((prefix) => p === prefix.slice(0, -1) || p.startsWith(prefix));
}

function normalizeRelPath(inputPath: string): string {
  let p = inputPath.replaceAll("\\", "/").trim();
  if (p.startsWith("/")) p = p.slice(1);
  p = p.replaceAll(/\/+/g, "/");
  while (p.startsWith("./")) p = p.slice(2);
  if (!p) throw new Error("Empty path");
  if (p === ".." || p.startsWith("../") || p.includes("/../") || p.endsWith("/..")) {
    throw new Error("Invalid path traversal");
  }
  return p;
}

async function streamToString(stream: NodeJS.ReadableStream): Promise<string> {
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    stream.on("error", reject);
  });
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    stream.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}

export class DockerManager {
  private docker: Dockerode;
  private containers = new Map<ConversationId, ManagedContainer>();
  private projectService = new ProjectService();

  constructor() {
    // Default dockerode config uses env vars (DOCKER_HOST, etc.) or local socket.
    this.docker = new Dockerode();
  }

  public async cleanupExpired() {
    const now = Date.now();
    for (const [conversationId, managed] of this.containers.entries()) {
      if (now - managed.lastUsedAt > INACTIVITY_TIMEOUT_MS) {
        await this.destroyContainer(conversationId).catch(() => {});
      }
    }
  }

  private touch(conversationId: string) {
    const managed = this.containers.get(conversationId);
    if (managed) managed.lastUsedAt = Date.now();
  }

  async getOrCreateContainer(conversationId: string): Promise<ManagedContainer> {
    await this.cleanupExpired();

    const existing = this.containers.get(conversationId);
    if (existing) {
      this.touch(conversationId);
      return existing;
    }

    const container = await this.docker.createContainer({
      Image: "ubuntu:latest",
      Cmd: ["bash", "-lc", "mkdir -p /workspace && sleep infinity"],
      WorkingDir: "/workspace",
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
      HostConfig: {
        AutoRemove: true,
      },
    });

    await container.start();

    const managed: ManagedContainer = {
      container,
      containerId: container.id,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
    };

    this.containers.set(conversationId, managed);
    return managed;
  }

  async destroyContainer(conversationId: string) {
    const managed = this.containers.get(conversationId);
    if (!managed) return;

    this.containers.delete(conversationId);
    try {
      await managed.container.stop({ t: 2 }).catch(() => {});
    } finally {
      await managed.container.remove({ force: true }).catch(() => {});
    }
  }

  async execCommand(input: {
    conversationId: string;
    command: string;
    workdir?: string;
    timeoutMs?: number;
  }): Promise<{ stdout: string; stderr: string; exitCode: number | null }> {
    const managed = await this.getOrCreateContainer(input.conversationId);
    this.touch(input.conversationId);

    const workingDir = input.workdir || "/workspace";

    const exec = await managed.container.exec({
      Cmd: ["bash", "-lc", input.command],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: workingDir,
    });

    const stream = await exec.start({ hijack: true, stdin: false });

    const stdoutStream = new PassThrough();
    const stderrStream = new PassThrough();
    const modem = (managed.container as any).modem;
    if (modem && typeof modem.demuxStream === "function") {
      modem.demuxStream(stream, stdoutStream, stderrStream);
    } else {
      // Fallback or error if demuxStream isn't available (shouldn't happen with standard dockerode)
      // For now, just piping stream to stdout as a fallback
      stream.pipe(stdoutStream);
    }

    const timeoutMs = input.timeoutMs ?? 2 * 60 * 1000;
    const timeout = setTimeout(() => {
      try {
        stream.destroy(new Error("Command timed out"));
      } catch {
        // ignore
      }
    }, timeoutMs);

    const [stdout, stderr] = await Promise.all([
      streamToString(stdoutStream),
      streamToString(stderrStream),
    ]).finally(() => clearTimeout(timeout));

    let exitCode: number | null = null;
    try {
      const inspect = await exec.inspect();
      exitCode = typeof inspect.ExitCode === "number" ? inspect.ExitCode : null;
    } catch {
      exitCode = null;
    }

    return { stdout, stderr, exitCode };
  }

  /**
   * Sync all files for a project into the container's `/workspace`.
   * This overwrites files in the container (but is filtered by ignored paths).
   */
  async syncFilesToContainer(input: { conversationId: string; projectId: string }) {
    const managed = await this.getOrCreateContainer(input.conversationId);
    this.touch(input.conversationId);

    // Create tar stream (uncompressed) to putArchive into /workspace
    const pass = new PassThrough();
    const archive = archiver("tar");
    archive.pipe(pass);

    const files = await this.projectService.listFiles(input.projectId);
    for (const file of files) {
      const relPath = normalizeRelPath(file.path);
      if (isIgnoredPath(relPath)) continue;

      const bytes = file.content as unknown as Buffer;
      archive.append(bytes, { name: relPath });
    }

    await archive.finalize();
    await managed.container.putArchive(pass, { path: "/workspace" });
  }

  /**
   * Fetch `/workspace` from the container and persist it back to the project.
   * Filters out ignored paths (node_modules, venvs, etc).
   */
  async syncFilesFromContainer(input: { conversationId: string; projectId: string }) {
    const managed = await this.getOrCreateContainer(input.conversationId);
    this.touch(input.conversationId);

    const tar = await managed.container.getArchive({ path: "/workspace" });
    const extractor = tarStream.extract();

    const writeOps: Promise<unknown>[] = [];

    extractor.on("entry", (header, stream, next) => {
      const rawName = header.name || "";

      // Strip leading "workspace/" if present (standard docker getArchive behavior for directories)
      // We want paths relative to project root, not workspace/
      let cleanPath = rawName;
      if (cleanPath.startsWith("workspace/")) {
        cleanPath = cleanPath.slice("workspace/".length);
      }

      const relPath = normalizeRelPath(cleanPath);

      // Only store regular files.
      if (header.type !== "file") {
        stream.resume();
        stream.on("end", () => next());
        return;
      }

      if (isIgnoredPath(relPath)) {
        stream.resume();
        stream.on("end", () => next());
        return;
      }

      streamToBuffer(stream)
        .then((buf) => {
          writeOps.push(this.projectService.writeFileFromBuffer(input.projectId, relPath, buf));
        })
        .catch(() => {})
        .finally(() => {
          next();
        });
    });

    await new Promise<void>((resolve, reject) => {
      extractor.on("finish", () => resolve());
      extractor.on("error", (err) => reject(err));
      tar.pipe(extractor);
    });

    await Promise.all(writeOps);
  }
}
