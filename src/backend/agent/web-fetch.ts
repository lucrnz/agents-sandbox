import { z } from "zod";
import { tool } from "ai";
import { fetchUrlAndConvert } from "./web-tools";
import { writeFile } from "fs/promises";
import { join } from "path";
import type { SubAgentWorkspace } from "./sub-agent";
import { LARGE_PAGE_THRESHOLD } from "./config";

/**
 * Web fetch tool - fetches URLs and converts to markdown
 * Saves large pages to virtual workspace
 */
export function createWebFetchTool(getWorkspace: () => SubAgentWorkspace | null) {
  const thresholdKb = Math.round(LARGE_PAGE_THRESHOLD / 1024);

  return tool({
    description: `Fetch a webpage and convert it to markdown format.

Use this tool when you need to:
- Get content from a specific URL
- Analyze a webpage's content
- Extract information from a website

Input:
- url: The URL to fetch (required)

Returns: Markdown content of the webpage. For large pages (>${thresholdKb}KB), saves to file and returns virtual path (/home/agent/filename.md). Use view tool to read the file.`,
    inputSchema: z.object({
      url: z.string().url().describe("The URL to fetch"),
    }),
    execute: async ({ url }: { url: string }) => {
      console.log("[WEB_FETCH] Fetching:", url);

      try {
        const content = await fetchUrlAndConvert(url);
        console.log("[WEB_FETCH] Content length:", content.length);

        // If content is large, save to file
        if (content.length > LARGE_PAGE_THRESHOLD) {
          console.log("[WEB_FETCH] Large page detected, saving to file");

          const workspace = getWorkspace();
          if (!workspace) {
            throw new Error("Workspace not available - cannot save file");
          }

          // Generate filename from URL
          const urlObj = new URL(url);
          const hostname = urlObj.hostname.replace(/[^a-z0-9]/gi, "_");
          const path = urlObj.pathname.replace(/[^a-z0-9]/gi, "_").slice(0, 50) || "index";
          const filename = `${hostname}${path}.md`;

          // Save to actual workspace path
          const actualPath = join(workspace.actualPath, filename);
          await writeFile(actualPath, content, "utf-8");

          // Convert to virtual path
          const virtualPath = join(workspace.virtualPath, filename);
          console.log("[WEB_FETCH] Saved to:", virtualPath);

          return `Large page content (${content.length} bytes) saved to: ${virtualPath}

Use the view tool to read the file:
- view ${virtualPath} (read entire file)
- grep "${virtualPath}" "search term" (search for specific text)`;
        }

        // For small pages, return content directly
        console.log("[WEB_FETCH] Small page, returning content directly");
        return content;
      } catch (error) {
        console.error("[WEB_FETCH] Fetch failed:", error);
        throw error;
      }
    },
  });
}
