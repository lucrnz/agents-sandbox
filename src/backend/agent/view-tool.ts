import { z } from "zod";
import { tool } from "ai";
import { readFile } from "fs/promises";
import type { SubAgentWorkspace, virtualPathToActual } from "./sub-agent.js";

/**
 * View tool - read file contents from virtual workspace
 * SECURITY: Strictly validates paths to prevent directory traversal
 */
export function createViewTool(
  getWorkspace: () => SubAgentWorkspace | null,
  {
    virtualPathToActual,
  }: { virtualPathToActual: (virtualPath: string, workspace: SubAgentWorkspace) => string },
) {
  return tool({
    description: `Read the contents of a file in your workspace.

Use this tool when you need to:
- Read a file that was saved by web_fetch
- View saved content for analysis
- Read any file in /home/agent

Input:
- path: File path (e.g., "/home/agent/page.md" or "page.md")

Returns: Complete file contents as text.

SECURITY: Only paths within /home/agent are allowed. Any attempt to access files outside the workspace will be rejected.`,
    inputSchema: z.object({
      path: z.string().describe("File path to read (absolute from /home/agent or relative)"),
    }),
    execute: async ({ path }: { path: string }) => {
      console.log("[VIEW] Requesting path:", path);

      const workspace = getWorkspace();
      if (!workspace) {
        throw new Error("Workspace not available");
      }

      try {
        // Convert virtual path to actual path (with security validation)
        const actualPath = virtualPathToActual(path, workspace);

        console.log("[VIEW] Reading file:", actualPath);

        const content = await readFile(actualPath, "utf-8");
        console.log("[VIEW] File length:", content.length);

        return content;
      } catch (error) {
        console.error("[VIEW] Failed to read file:", error);

        if (error instanceof Error && error.message.includes("Forbidden request")) {
          throw error; // Re-throw security errors as-is
        }

        throw new Error(
          `Failed to read file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
