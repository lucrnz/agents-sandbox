import { z } from "zod";
import { tool } from "ai";
import { searchDuckDuckGo, formatSearchResults } from "./web-tools.js";
import { DEFAULT_SEARCH_RESULTS_COUNT } from "./config";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:web-search");

/**
 * Web search tool - performs DuckDuckGo web search
 */
export function createWebSearchTool() {
  return tool({
    description: `Perform a web search using DuckDuckGo.

Use this tool when you need to:
- Find current information on the web
- Search for topics, articles, or websites
- Find multiple sources on a topic
- Discover relevant URLs for further analysis

Input:
- query: The search query string

Returns: Formatted search results with titles, URLs, and snippets.`,
    inputSchema: z.object({
      query: z.string().min(1).describe("The search query"),
    }),
    execute: async ({ query }: { query: string }) => {
      logger.info({ query }, "Searching for query");

      try {
        const results = await searchDuckDuckGo(query, DEFAULT_SEARCH_RESULTS_COUNT);
        logger.info({ count: results.length }, "Search results returned");

        if (results.length === 0) {
          return "No results found for your search query. This could mean the search tool is not working right now or there are no results for your query. Please try rephrasing your search or try again in a few minutes.";
        }

        return formatSearchResults(results);
      } catch (error) {
        logger.error({ error }, "Search failed");
        throw error;
      }
    },
  });
}
