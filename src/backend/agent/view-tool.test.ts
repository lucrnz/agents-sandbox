import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { createViewTool } from "./view-tool";
import {
  virtualPathToActual,
  createSubAgentWorkspace,
  cleanupSubAgentWorkspace,
  type SubAgentWorkspace,
} from "./sub-agent";
import { writeFile, mkdir } from "fs/promises";
import { join } from "path";

describe("View Tool", () => {
  let workspace: SubAgentWorkspace | null = null;

  beforeEach(async () => {
    workspace = await createSubAgentWorkspace();
  });

  afterEach(async () => {
    if (workspace) {
      await cleanupSubAgentWorkspace(workspace);
    }
  });

  const getWorkspace = () => workspace;

  test("should read an existing file", async () => {
    if (!workspace) throw new Error("Workspace not created");

    const filePath = join(workspace.actualPath, "test.txt");
    const content = "Hello, world!";
    await writeFile(filePath, content);

    const viewTool = createViewTool(getWorkspace, { virtualPathToActual });
    const result = await viewTool.execute({ path: "test.txt" }, { toolCallId: "1", messages: [] });

    expect(result).toBe(content);
  });

  test("should read an existing file with absolute virtual path", async () => {
    if (!workspace) throw new Error("Workspace not created");

    const filePath = join(workspace.actualPath, "test.txt");
    const content = "Hello, world!";
    await writeFile(filePath, content);

    const viewTool = createViewTool(getWorkspace, { virtualPathToActual });
    const result = await viewTool.execute(
      { path: "/home/agent/test.txt" },
      { toolCallId: "1", messages: [] },
    );

    expect(result).toBe(content);
  });

  test("should throw error for non-existent file", async () => {
    const viewTool = createViewTool(getWorkspace, { virtualPathToActual });

    await expect(
      viewTool.execute({ path: "non-existent.txt" }, { toolCallId: "1", messages: [] }),
    ).rejects.toThrow(/Failed to read file/);
  });

  test("should throw security error for path traversal", async () => {
    const viewTool = createViewTool(getWorkspace, { virtualPathToActual });

    await expect(
      viewTool.execute({ path: "../outside.txt" }, { toolCallId: "1", messages: [] }),
    ).rejects.toThrow(/Forbidden request|Path traversal detected/);
  });

  test("should throw error when workspace is not available", async () => {
    const viewTool = createViewTool(() => null, { virtualPathToActual });

    await expect(
      viewTool.execute({ path: "test.txt" }, { toolCallId: "1", messages: [] }),
    ).rejects.toThrow("Workspace not available");
  });
});
