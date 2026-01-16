import { z } from "zod";
import { tool } from "ai";
import { readFile } from "fs/promises";
import type { SubAgentWorkspace, virtualPathToActual } from "./sub-agent.js";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:grep-tool");

/**
 * Grep tool - search within files in virtual workspace
 * SECURITY: Strictly validates paths to prevent directory traversal
 */
export function createGrepTool(
  getWorkspace: () => SubAgentWorkspace | null,
  {
    virtualPathToActual,
  }: { virtualPathToActual: (virtualPath: string, workspace: SubAgentWorkspace) => string },
) {
  return tool({
    description: `Search for text patterns within files in your workspace.

Use this tool when you need to:
- Find specific text in a large file
- Search for keywords across saved content
- Locate sections within documentation

Input:
- path: File path to search (e.g., "/home/agent/page.md" or "page.md")
- pattern: Text pattern to search for

Returns: All matching lines with line numbers.

SECURITY: Only paths within /home/agent are allowed. Any attempt to access files outside the workspace will be rejected.`,
    inputSchema: z.object({
      path: z.string().describe("File path to search (absolute from /home/agent or relative)"),
      pattern: z
        .string()
        .trim()
        .min(1, "Pattern cannot be empty or whitespace-only")
        .describe("Text pattern to search for"),
    }),
    execute: async ({ path, pattern }: { path: string; pattern: string }) => {
      logger.info({ path, pattern }, "Requesting search");

      const workspace = getWorkspace();
      if (!workspace) {
        throw new Error("Workspace not available");
      }

      try {
        // Convert virtual path to actual path (with security validation)
        const actualPath = virtualPathToActual(path, workspace);

        logger.info({ actualPath }, "Reading file");

        const content = await readFile(actualPath, "utf-8");
        const lines = content.split("\n");

        // Search for pattern (case-insensitive)
        const patternLower = pattern.toLowerCase();
        const matches: Array<{ line: number; text: string }> = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (line && line.toLowerCase().includes(patternLower)) {
            matches.push({ line: i + 1, text: line });
          }
        }

        logger.info({ count: matches.length }, "Found matches");

        if (matches.length === 0) {
          return `No matches found for pattern: "${pattern}"`;
        }

        // Format results
        let result = `Found ${matches.length} matches for "${pattern}":\n\n`;
        for (const match of matches) {
          result += `Line ${match.line}: ${match.text}\n`;
        }

        return result;
      } catch (error) {
        logger.error({ error }, "Failed to search file");

        if (error instanceof Error && error.message.includes("Forbidden request")) {
          throw error; // Re-throw security errors as-is
        }

        throw new Error(
          `Failed to search file: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    },
  });
}
