import { z } from "zod";
import { tool } from "ai";
import { SubAgent } from "./sub-agent";
import { bigModel } from "./model-config";
import { createWebSearchTool } from "./web-search";
import { createWebFetchTool } from "./web-fetch";
import { createViewTool } from "./view-tool";
import { createGrepTool } from "./grep-tool";
import { virtualPathToActual } from "./sub-agent";
import { MAX_SUB_AGENT_STEPS } from "./config";

export const AgenticFetchParamsSchema = z.object({
  url: z
    .url()
    .optional()
    .describe(
      "The URL to fetch content from (optional - if not provided, agent will search the web)",
    ),
  prompt: z.string().describe("The prompt describing what information to find or extract"),
});

export type AgenticFetchParams = z.infer<typeof AgenticFetchParamsSchema>;

/**
 * Sub-agent system prompt for web research and content analysis
 */
const SUB_AGENT_SYSTEM = `You are a web research assistant with tools to search, fetch, and analyze web content.

## Your Capabilities

1. **Web Search**: Use web_search to find information on any topic
2. **Web Fetch**: Use web_fetch to get content from specific URLs
3. **File View**: Use view to read saved files (especially for large pages)
4. **Content Search**: Use grep to search within saved files for specific information

## When to Use Each Tool

- **web_search**: When you need to find current information, discover sources, or search for topics
- **web_fetch**: When you have a specific URL and need to analyze its content
- **view**: When web_fetch saved a large page to a file and you need to read it
- **grep**: When you need to find specific information within a large saved file

## Research Strategy

1. **Understand the Request**: Carefully read what information is needed
2. **Search or Fetch**: Use web_search for open queries, web_fetch for specific URLs
3. **Analyze Content**: Read and analyze the fetched content
4. **Follow Up**: If initial results aren't sufficient, perform additional searches or fetch more pages
5. **Synthesize**: Combine information from multiple sources to provide a comprehensive answer

## Response Format

When answering, structure your response as:

**Answer**: [Provide a clear, direct answer to the user's question]

**Key Points**: [List the main findings]

**Sources**: [List all URLs you referenced]
- Source 1: [URL] - [Brief description]
- Source 2: [URL] - [Brief description]

**Notes**: [Any additional context, caveats, or relevant information]

## Tips for Better Results

- For broad topics, start with a general search, then narrow down with more specific searches
- When analyzing a specific URL, use web_fetch first
- For large pages, use grep to find relevant sections efficiently
- Always cite your sources with URLs
- If you can't find definitive information, be honest and explain what you found
- For comparisons or multi-part questions, fetch multiple sources to get complete information

Be thorough but concise. Focus on providing actionable information that directly answers the user's question.`;

export function createAgenticFetchTool() {
  return tool({
    description: `Autonomous web research assistant that searches, fetches, and analyzes web content.

Use this tool when you need:
- Current information from the web (omit url parameter)
- Specific information from a webpage (provide url)
- Research topics by searching and analyzing results
- Compare information from multiple sources
- Extract key information from web content

Input:
- prompt: What information to find or extract (required)
- url: Specific URL to analyze (optional)

Returns: Comprehensive analysis with structured answer, key points, and sources.

The sub-agent autonomously:
- Performs multiple searches as needed
- Fetches relevant pages from search results
- Analyzes large pages efficiently (saves to file, uses grep)
- Synthesizes information from multiple sources
- Provides structured response with sources`,
    inputSchema: AgenticFetchParamsSchema,
    execute: async ({ prompt, url }: AgenticFetchParams) => {
      console.log("[AGENTIC_FETCH] *** SUB-AGENT START ***");
      console.log("[AGENTIC_FETCH] Input:", { prompt, url });

      // Determine execution mode for logging
      const mode = url ? "URL Analysis" : "Web Search";
      console.log("[AGENTIC_FETCH] MODE:", mode);

      // Create tools that can access the workspace
      let currentWorkspace: any = null;

      const getWorkspace = () => currentWorkspace;

      // Create tools
      const webSearchTool = createWebSearchTool();
      const webFetchTool = createWebFetchTool(getWorkspace);
      const viewTool = createViewTool(getWorkspace, { virtualPathToActual });
      const grepTool = createGrepTool(getWorkspace, { virtualPathToActual });

      // Create sub-agent
      const subAgent = new SubAgent({
        model: bigModel,
        system: SUB_AGENT_SYSTEM,
        tools: {
          web_search: webSearchTool,
          web_fetch: webFetchTool,
          view: viewTool,
          grep: grepTool,
        },
        maxSteps: MAX_SUB_AGENT_STEPS,
        onToolCall: (toolName: string, args: any) => {
          console.log(`[AGENTIC_FETCH] Sub-agent tool call: ${toolName}`, args);
        },
        onToolResult: (toolName: string, result: any, error?: Error) => {
          if (error) {
            console.error(`[AGENTIC_FETCH] Sub-agent tool error: ${toolName}`, error);
          } else {
            console.log(`[AGENTIC_FETCH] Sub-agent tool result: ${toolName}`);
          }
        },
        onWorkspaceCreated: (workspace) => {
          currentWorkspace = workspace;
        },
      });

      // Build sub-agent prompt based on mode
      let subAgentPrompt: string;
      if (url) {
        subAgentPrompt = `Analyze the webpage at: ${url}

Request: ${prompt}

Use web_fetch to get the content, then analyze it to answer the request. If the page is large and saved to a file, use view and grep tools to efficiently find relevant information.`;
      } else {
        subAgentPrompt = `Research: ${prompt}

Use web_search to find relevant information, then use web_fetch to get content from the most relevant sources. Synthesize the information to provide a comprehensive answer with sources.`;
      }

      try {
        // Execute sub-agent
        console.log("[AGENTIC_FETCH] Executing sub-agent");
        const result = await subAgent.execute(subAgentPrompt);

        console.log("[AGENTIC_FETCH] Sub-agent completed");
        console.log("[AGENTIC_FETCH] Result length:", result.length);

        return result;
      } catch (error) {
        console.error("[AGENTIC_FETCH] Sub-agent failed:", error);

        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        return `Web research failed: ${errorMessage}. Please try rephrasing your request or try again later.`;
      } finally {
        console.log("[AGENTIC_FETCH] *** SUB-AGENT END ***");
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
    return `Researching: "${prompt.substring(0, 50)}${prompt.length > 50 ? "..." : ""}"`;
  }
}
