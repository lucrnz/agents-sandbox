import { z } from "zod";
import { tool } from "ai";
import { fetchUrlAndConvert, searchDuckDuckGo, formatSearchResults } from "./web-tools.js";
import {
  extractSearchKeywords,
  inferPageTitle,
  generateShortFilenameDescription,
} from "./title-generation.js";
import { writeFile } from "fs/promises";
import { mkdir, access } from "fs/promises";
import { join } from "path";

export const AgenticFetchParamsSchema = z.object({
  url: z
    .string()
    .url()
    .optional()
    .describe(
      "The URL to fetch content from (optional - if not provided, agent will search the web)",
    ),
  prompt: z.string().describe("The prompt describing what information to find or extract"),
});

export type AgenticFetchParams = z.infer<typeof AgenticFetchParamsSchema>;

export function createAgenticFetchTool() {
  return tool({
    description: `Searches for web information or fetches and analyzes content from URLs.

Use this tool when you need:
- Current information from the web (omit url parameter)
- Specific information from a webpage (provide url)
- Research topics by searching and analyzing results
- Answer questions about online content

Input:
- prompt: What information to find or extract (required)
- url: Specific URL to analyze (optional)

Returns: Search results, page analysis, or error messages with clear next steps.`,
    inputSchema: AgenticFetchParamsSchema,
    execute: async ({ prompt, url }: AgenticFetchParams) => {
      console.log("[AGENTIC_FETCH] *** TOOL EXECUTION START ***");
      console.log("[AGENTIC_FETCH] Input:", { prompt, url });

      // Store debug data if DEBUG is enabled
      const debugEnabled = process.env.DEBUG === "true";
      let debugData: {
        mode: string;
        input: { prompt: string; url?: string };
        timestamp: string;
        result?: any;
        error?: string;
        details?: any;
      } = {
        mode: url ? "URL Analysis" : "Web Search",
        input: { prompt, url },
        timestamp: new Date().toISOString(),
      };

      try {
        if (url) {
          console.log("[AGENTIC_FETCH] MODE: URL Analysis");
          console.log("[AGENTIC_FETCH] Fetching:", url);

          const content = await fetchUrlAndConvert(url);
          const pageTitle = await inferPageTitle(url);
          console.log("[AGENTIC_FETCH] Content length:", content.length);

          if (debugEnabled) {
            debugData.details = {
              pageTitle,
              contentLength: content.length,
              content: content.substring(0, 10000), // Limit content size in debug
            };
            debugData.result = `Successfully analyzed ${pageTitle}. Content length: ${content.length} characters.`;
          }

          // Return actual tool result for LLM
          return `Successfully analyzed ${pageTitle}. Content length: ${content.length} characters. Ready to provide insights.`;
        } else {
          console.log("[AGENTIC_FETCH] MODE: Web Search");
          console.log("[AGENTIC_FETCH] Searching for:", prompt);

          const keywords = extractSearchKeywords(prompt);
          const keywordStr = keywords.length > 0 ? keywords.join(", ") : prompt.substring(0, 30);
          const searchResults = await searchDuckDuckGo(prompt, 10);
          const formattedResults = formatSearchResults(searchResults);
          console.log("[AGENTIC_FETCH] Raw search results count:", searchResults.length);

          if (debugEnabled) {
            debugData.details = {
              keywords: keywordStr,
              searchResults,
              formattedResults,
            };
            debugData.result = `Found ${searchResults.length} search results for "${keywordStr}".`;
          }

          if (searchResults.length === 0) {
            console.log("[AGENTIC_FETCH] *** NO RESULTS FOUND ***");
            if (debugEnabled) {
              debugData.error = "No results found";
            }
            return `No results found for "${keywordStr}". The search may be too specific or DuckDuckGo is rate limiting.`;
          }

          // Return actual tool result for LLM
          return formattedResults;
        }
      } catch (error) {
        console.error("[AGENTIC_FETCH] *** ERROR IN EXECUTION ***");
        console.error("[AGENTIC_FETCH] Error:", error);

        if (debugEnabled) {
          debugData.error = error instanceof Error ? error.message : String(error);
        }

        // Return error message for LLM
        return `Search failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }. Please try rephrasing your query.`;
      } finally {
        // Save debug data if DEBUG is enabled
        if (debugEnabled) {
          try {
            await saveDebugFile(debugData);
          } catch (debugError) {
            console.error("[AGENTIC_FETCH] Failed to save debug file:", debugError);
          }
        }
      }
    },
  });
}

// Helper function to generate status messages for UI
export function generateStatusMessage(params: AgenticFetchParams | null): string {
  if (!params) {
    return "Preparing search...";
  }

  const { prompt, url } = params;
  if (url) {
    return `Browsing ${url}`;
  } else {
    const keywords = extractSearchKeywords(prompt);
    const keywordStr = keywords.length > 0 ? keywords.join(", ") : prompt.substring(0, 30);
    return `Searching for "${keywordStr}"`;
  }
}

/**
 * Save debug data to a markdown file in the .debug directory
 */
async function saveDebugFile(debugData: any): Promise<void> {
  const debugDir = ".debug";

  try {
    // Ensure debug directory exists
    try {
      await access(debugDir);
    } catch {
      await mkdir(debugDir, { recursive: true });
    }

    // Generate timestamp in YYYYMMDD_HHMMSS format
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, "").replace("T", "_").substring(0, 15);

    // Generate short description for filename using small model
    const descriptionText = await generateShortFilenameDescription(debugData.input.prompt);

    // Format filename: replace spaces with dashes, remove special chars, convert to uppercase
    const formattedDescription = descriptionText
      .toUpperCase()
      .replace(/[^A-Z0-9\s]/g, "") // Remove special characters
      .replace(/\s+/g, "-") // Replace spaces with dashes
      .replace(/-+/g, "-") // Collapse multiple dashes
      .replace(/^-+|-+$/g, ""); // Remove leading/trailing dashes

    const filename = `AGENTIC_FETCH_${timestamp}_${formattedDescription}.md`;
    const filepath = join(debugDir, filename);

    // Create markdown content
    let markdownContent = `# Agentic Fetch Debug Data\n\n`;
    markdownContent += `**Timestamp:** ${debugData.timestamp}\n`;
    markdownContent += `**Mode:** ${debugData.mode}\n\n`;

    markdownContent += `## Input\n\n`;
    markdownContent += `**Prompt:** ${debugData.input.prompt}\n`;
    if (debugData.input.url) {
      markdownContent += `**URL:** ${debugData.input.url}\n`;
    }
    markdownContent += `\n`;

    if (debugData.error) {
      markdownContent += `## Error\n\n`;
      markdownContent += `\`\`\`\n${debugData.error}\n\`\`\`\n\n`;
    } else {
      markdownContent += `## Result\n\n`;
      markdownContent += `${debugData.result}\n\n`;
    }

    if (debugData.details) {
      if (debugData.mode === "Web Search") {
        markdownContent += `## Search Details\n\n`;
        markdownContent += `**Keywords:** ${debugData.details.keywords}\n\n`;

        if (debugData.details.searchResults && debugData.details.searchResults.length > 0) {
          markdownContent += `### Raw Search Results (${debugData.details.searchResults.length} results)\n\n`;
          debugData.details.searchResults.forEach((result: any, index: number) => {
            markdownContent += `#### ${index + 1}. ${result.title}\n`;
            markdownContent += `- **URL:** ${result.link}\n`;
            markdownContent += `- **Snippet:** ${result.snippet}\n`;
            markdownContent += `- **Position:** ${result.position}\n\n`;
          });
        }

        markdownContent += `### Formatted Results\n\n`;
        markdownContent += `\`\`\`\n${debugData.details.formattedResults}\n\`\`\`\n`;
      } else if (debugData.mode === "URL Analysis") {
        markdownContent += `## URL Analysis Details\n\n`;
        markdownContent += `**Page Title:** ${debugData.details.pageTitle}\n`;
        markdownContent += `**Content Length:** ${debugData.details.contentLength} characters\n\n`;

        if (debugData.details.content) {
          markdownContent += `### Content (truncated)\n\n`;
          markdownContent += `\`\`\`markdown\n${debugData.details.content}\n\`\`\`\n`;
        }
      }
    }

    // Write file
    await writeFile(filepath, markdownContent, "utf-8");
    console.log(`[AGENTIC_FETCH] Debug file saved: ${filename}`);
  } catch (error) {
    console.error("[AGENTIC_FETCH] Failed to save debug file:", error);
  }
}
