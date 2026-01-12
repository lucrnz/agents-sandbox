import { describe, test, expect, mock, beforeEach } from "bun:test";
import { ProjectService } from "./project-service";
import { Buffer } from "buffer";

// Mock DB module
const mockDb = {
  createProject: mock(async (input: any) => ({
    id: "test-id",
    name: input.name,
    description: input.description,
    createdAt: new Date(),
    updatedAt: new Date(),
  })),
  deleteProject: mock(async () => {}),
  getProject: mock(async (id: string) => ({ id, name: "test-project" })),
  listProjectFiles: mock(async () => []),
  upsertProjectFile: mock(async () => ({ id: 1 })),
  getProjectFile: mock(async (projectId: string, path: string): Promise<any> => null),
  deleteProjectFile: mock(async () => {}),
  ensureDefaultProject: mock(async () => ({ id: "default" })),
  listProjects: mock(async () => []),
};

mock.module("@/backend/db", () => mockDb);

describe("ProjectService", () => {
  let service: ProjectService;

  beforeEach(() => {
    service = new ProjectService();
    // Reset mocks
    Object.values(mockDb).forEach((m) => m.mockClear());
  });

  test("createProject should validate name", async () => {
    await expect(service.createProject({ name: "" })).rejects.toThrow(
      "Project name cannot be empty",
    );
    await expect(service.createProject({ name: "  " })).rejects.toThrow(
      "Project name cannot be empty",
    );

    const p = await service.createProject({ name: "valid" });
    expect(p.name).toBe("valid");
  });

  test("createProject trims inputs", async () => {
    await service.createProject({ name: "  foo  ", description: "  desc  " });
    expect(mockDb.createProject).toHaveBeenCalledWith({ name: "foo", description: "desc" });
  });

  // Path normalization tests
  test("writeFileFromText should normalize paths", async () => {
    await service.writeFileFromText("p1", "./foo/bar.txt", "content");
    expect(mockDb.upsertProjectFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "foo/bar.txt",
      }),
    );

    await service.writeFileFromText("p1", "foo//bar.txt", "content");
    expect(mockDb.upsertProjectFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "foo/bar.txt",
      }),
    );

    await service.writeFileFromText("p1", "windows\\path\\file.txt", "content");
    expect(mockDb.upsertProjectFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "windows/path/file.txt",
      }),
    );
  });

  test("writeFileFromText should reject unsafe paths", async () => {
    await expect(service.writeFileFromText("p1", "/abs/path", "")).rejects.toThrow(
      "Project paths must be relative",
    );
    await expect(service.writeFileFromText("p1", "../parent", "")).rejects.toThrow(
      "Project paths cannot contain '..' segments",
    );
    await expect(service.writeFileFromText("p1", "foo/../../bar", "")).rejects.toThrow(
      "Project paths cannot contain '..' segments",
    );
  });

  test("writeFileFromText should reject ignored paths", async () => {
    await expect(service.writeFileFromText("p1", "node_modules/foo", "")).rejects.toThrow(
      "Refusing to store ignored path",
    );
    await expect(service.writeFileFromText("p1", ".git/config", "")).rejects.toThrow(
      "Refusing to store ignored path",
    );
    await expect(service.writeFileFromText("p1", ".venv/bin/python", "")).rejects.toThrow(
      "Refusing to store ignored path",
    );
    await expect(service.writeFileFromText("p1", "dist/output.js", "")).rejects.toThrow(
      "Refusing to store ignored path",
    );
  });

  test("writeFileFromText should accept allowed paths", async () => {
    await service.writeFileFromText("p1", "src/main.ts", "");
    expect(mockDb.upsertProjectFile).toHaveBeenCalled();
  });

  test("writeFileFromBuffer should work similarly", async () => {
    const buf = Buffer.from("hello");
    await service.writeFileFromBuffer("p1", "data/image.png", buf);
    expect(mockDb.upsertProjectFile).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "data/image.png",
        content: buf,
      }),
    );
  });

  test("readFileAsText should throw if not found", async () => {
    mockDb.getProjectFile.mockResolvedValueOnce(null);
    await expect(service.readFileAsText("p1", "missing.txt")).rejects.toThrow("File not found");
  });

  test("readFileAsText should return content", async () => {
    mockDb.getProjectFile.mockResolvedValueOnce({
      content: Buffer.from("hello world"),
      mimeType: "text/plain",
    });

    const result = await service.readFileAsText("p1", "hello.txt");
    expect(result.content).toBe("hello world");
    expect(result.path).toBe("hello.txt");
  });
});
