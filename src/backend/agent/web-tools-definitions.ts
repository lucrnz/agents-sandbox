import { z } from "zod";
import { tool } from "ai";

export const WebSearchParamsSchema = z.object({
  query: z.string().describe("The search query to find information on the web"),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .default(10)
    .describe("Maximum number of results to return (default: 10, max: 20)"),
});

export type WebSearchParams = z.infer<typeof WebSearchParamsSchema>;

export const WebFetchParamsSchema = z.object({
  url: z.string().url().describe("The URL to fetch content from"),
});

export type WebFetchParams = z.infer<typeof WebFetchParamsSchema>;

export function createWebSearchTool() {
  return tool({
    description: `Search web using DuckDuckGo to find information.

Use this tool when you need to search for current information on the web.

Parameters:
- query: The search query to find information
- maxResults: Maximum number of results to return (default: 10, max: 20)

Returns search results with titles, URLs, and snippets. After getting search results, use web_fetch to get full content from relevant URLs.`,
    inputSchema: WebSearchParamsSchema,
  });
}

export function createWebFetchTool(workingDir: string) {
  return tool({
    description: `Fetch content from a URL and convert it to markdown.

Use this tool to fetch web pages and get their content. Large pages will be saved to a file that you can analyze with grep and view tools.

Parameters:
- url: The URL to fetch content from

Returns the page content as markdown, or a file path if the content is large.`,
    inputSchema: WebFetchParamsSchema,
  });
}
