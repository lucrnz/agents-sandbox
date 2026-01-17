import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import type { LanguageModel } from "ai";
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

  // Comprehensive security edge case tests (HIGH-2)
  describe("Advanced Path Traversal Attack Prevention", () => {
    test("Windows-style path separators should be blocked or normalized", () => {
      const windowsPaths = ["..\\..\\etc\\passwd", "subdir\\..\\..\\secret.txt"];

      for (const path of windowsPaths) {
        // Should either throw or resolve to a safe path within workspace
        try {
          const resolved = virtualPathToActual(path, workspace);
          // If it doesn't throw, the resolved path must be within workspace
          expect(resolved.startsWith(workspace.actualPath + "/")).toBe(true);
        } catch (error) {
          expect((error as Error).message).toMatch(/Forbidden request|Path traversal detected/);
        }
      }
    });

    test("multi-level path traversal with deep nesting should be blocked", () => {
      const deepTraversals = [
        "../../../../../../../../../../../etc/passwd",
        "/home/agent/../../../../../../../../../../../etc/passwd",
        "a/b/c/d/e/../../../../../../../../../etc/passwd",
      ];

      for (const path of deepTraversals) {
        expect(() => virtualPathToActual(path, workspace)).toThrow(/Forbidden request/);
      }
    });

    test("mixed absolute and traversal patterns should be blocked", () => {
      const mixedPaths = [
        "/home/agent/foo/../../../etc/passwd",
        "/home/agent/./../../secret",
        "/home/agent/subdir/./../../outside",
      ];

      for (const path of mixedPaths) {
        expect(() => virtualPathToActual(path, workspace)).toThrow(/Forbidden request/);
      }
    });

    test("dot-dot-slash variations should be blocked", () => {
      const dotDotPaths = [
        "./../outside",
        "./subdir/../../outside",
        "subdir/./../../../etc/passwd",
      ];

      for (const path of dotDotPaths) {
        expect(() => virtualPathToActual(path, workspace)).toThrow(
          /Forbidden request|Path traversal detected/,
        );
      }
    });

    test("prefix collision attacks should be blocked", () => {
      // The workspace path is like /tmp/agents-sandbox-<uuid>
      // An attacker might try to access /tmp/agents-sandbox-<uuid>-malicious
      // by crafting a path that resolves outside the workspace
      const prefixCollisionPaths = [
        // These test that the trailing slash check works
        "../" + workspace.actualPath.split("/").pop() + "-malicious/secret.txt",
      ];

      for (const path of prefixCollisionPaths) {
        expect(() => virtualPathToActual(path, workspace)).toThrow(
          /Forbidden request|Path traversal detected/,
        );
      }
    });

    test("empty and special paths should be handled safely", () => {
      // Empty path should resolve to workspace root
      const emptyResolved = virtualPathToActual("", workspace);
      expect(emptyResolved).toBe(workspace.actualPath);

      // Single dot should resolve to workspace root
      const dotResolved = virtualPathToActual(".", workspace);
      expect(dotResolved).toBe(workspace.actualPath);
    });

    test("paths with special characters should be handled", () => {
      // These paths contain special characters but are valid
      const validSpecialPaths = [
        "file with spaces.txt",
        "file-with-dashes.md",
        "file_with_underscores.txt",
      ];

      for (const path of validSpecialPaths) {
        const resolved = virtualPathToActual(path, workspace);
        expect(resolved).toBe(join(workspace.actualPath, path));
        expect(resolved.startsWith(workspace.actualPath + "/")).toBe(true);
      }
    });
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
  class TestSubAgent extends SubAgent {
    public testBuildSystemPrompt() {
      return this.buildSystemPrompt();
    }
  }

  test("buildSystemPrompt should include current date and virtual path", () => {
    const model: LanguageModel = "test-model";
    const subAgent = new TestSubAgent({
      model,
      system: "Test system prompt",
      tools: {},
    });

    const prompt = subAgent.testBuildSystemPrompt();
    const today = new Date().toDateString();

    expect(prompt).toContain("Test system prompt");
    expect(prompt).toContain(`Current Date: ${today}`);
    expect(prompt).toContain("Your working directory is: /home/agent");
    expect(prompt).toContain("IMPORTANT: You can only read and write files within /home/agent.");
  });
});
