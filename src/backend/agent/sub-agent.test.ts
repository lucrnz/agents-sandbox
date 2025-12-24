import { test, expect, describe, beforeAll, afterAll, mock } from "bun:test";
import {
  virtualPathToActual,
  actualPathToVirtual,
  createSubAgentWorkspace,
  cleanupSubAgentWorkspace,
  type SubAgentWorkspace,
  SubAgent,
} from "./sub-agent.ts";
import { join } from "path";
import { existsSync } from "fs";

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
    const exploitPath = "/home/agent//etc/passwd";
    expect(() => virtualPathToActual(exploitPath, workspace)).toThrow(
      /Forbidden request|Path traversal detected/,
    );
  });
});

describe("SubAgent Workspace Management", () => {
  test("createSubAgentWorkspace should create a valid directory", async () => {
    const workspace = await createSubAgentWorkspace();
    expect(workspace.virtualPath).toBe("/home/agent");
    expect(workspace.actualPath).toContain("agents-sandbox-");
    expect(existsSync(workspace.actualPath)).toBe(true);
    await cleanupSubAgentWorkspace(workspace);
  });

  test("cleanupSubAgentWorkspace should remove the directory", async () => {
    const workspace = await createSubAgentWorkspace();
    const path = workspace.actualPath;
    expect(existsSync(path)).toBe(true);
    await cleanupSubAgentWorkspace(workspace);
    expect(existsSync(path)).toBe(false);
  });

  test("actualPathToVirtual should convert actual paths back to virtual", async () => {
    const workspace = await createSubAgentWorkspace();
    const actual = join(workspace.actualPath, "test/file.md");
    const virtual = actualPathToVirtual(actual, workspace);
    expect(virtual).toBe("/home/agent/test/file.md");
    await cleanupSubAgentWorkspace(workspace);
  });
});

describe("SubAgent Class", () => {
  test("buildSystemPrompt should include current date and virtual path", () => {
    const subAgent = new SubAgent({
      model: {} as any,
      system: "Test system prompt",
      tools: {},
    });

    // @ts-ignore - accessing private method for testing
    const prompt = subAgent.buildSystemPrompt();
    const today = new Date().toDateString();

    expect(prompt).toContain("Test system prompt");
    expect(prompt).toContain(`Current Date: ${today}`);
    expect(prompt).toContain("Your working directory is: /home/agent");
    expect(prompt).toContain("IMPORTANT: You can only read and write files within /home/agent.");
  });
});
