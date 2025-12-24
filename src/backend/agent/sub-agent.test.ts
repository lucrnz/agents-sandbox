import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import {
  virtualPathToActual,
  createSubAgentWorkspace,
  cleanupSubAgentWorkspace,
  type SubAgentWorkspace,
} from "./sub-agent.ts";
import { join, resolve } from "path";

describe("SubAgent Path Traversal Security", () => {
  let workspace: SubAgentWorkspace;

  beforeAll(async () => {
    workspace = await createSubAgentWorkspace();
  });

  afterAll(async () => {
    await cleanupSubAgentWorkspace(workspace);
  });

  test("valid paths should resolve correctly", () => {
    const validRelative = "test.txt";
    const resolvedRelative = virtualPathToActual(validRelative, workspace);
    expect(resolvedRelative).toBe(join(workspace.actualPath, validRelative));

    const validAbsolute = "/home/agent/docs/info.md";
    const resolvedAbsolute = virtualPathToActual(validAbsolute, workspace);
    expect(resolvedAbsolute).toBe(join(workspace.actualPath, "docs/info.md"));
  });

  test("relative path traversal should be blocked", () => {
    const maliciousPaths = ["../outside.txt", "../../etc/passwd", "subdir/../../secret.txt"];

    for (const path of maliciousPaths) {
      expect(() => virtualPathToActual(path, workspace)).toThrow(
        /Forbidden request|Path traversal detected/,
      );
    }
  });

  test("absolute path traversal should be blocked", () => {
    const maliciousPaths = [
      "/home/agent/../outside.txt",
      "/home/agent/../../etc/passwd",
      "/etc/passwd", // Not starting with /home/agent
    ];

    for (const path of maliciousPaths) {
      expect(() => virtualPathToActual(path, workspace)).toThrow(/Forbidden request/);
    }
  });

  test("absolute path root escape via leading slash after prefix should be blocked", () => {
    // This is the specific exploit mentioned in the issue:
    // virtualPathToActual("/home/agent//etc/passwd", workspace)
    // relativePath becomes "/etc/passwd"
    // resolve(basePathActual, "/etc/passwd") returns "/etc/passwd"
    const exploitPath = "/home/agent//etc/passwd";
    expect(() => virtualPathToActual(exploitPath, workspace)).toThrow(
      /Forbidden request|Path traversal detected/,
    );
  });
});
