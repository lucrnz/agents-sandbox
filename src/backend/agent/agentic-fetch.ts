import { z } from 'zod';
import { tool } from 'ai';
import { fetchUrlAndConvert, searchDuckDuckGo, formatSearchResults } from './web-tools.js';
import { extractSearchKeywords, inferPageTitle } from './title-generation.js';

export const AgenticFetchParamsSchema = z.object({
  url: z.string().url().optional().describe(
    'The URL to fetch content from (optional - if not provided, agent will search the web)'
  ),
  prompt: z.string().describe(
    'The prompt describing what information to find or extract'
  ),
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
      console.log('[AGENTIC_FETCH] *** TOOL EXECUTION START ***');
      console.log('[AGENTIC_FETCH] Input:', { prompt, url });
      
      try {
        if (url) {
          console.log('[AGENTIC_FETCH] MODE: URL Analysis');
          console.log('[AGENTIC_FETCH] Fetching:', url);
          
          const content = await fetchUrlAndConvert(url);
          const pageTitle = await inferPageTitle(url);
          console.log('[AGENTIC_FETCH] Content length:', content.length);
          
          // Return actual tool result for LLM
          return `Successfully analyzed ${pageTitle}. Content length: ${content.length} characters. Ready to provide insights.`;
          
        } else {
          console.log('[AGENTIC_FETCH] MODE: Web Search');
          console.log('[AGENTIC_FETCH] Searching for:', prompt);
          
          const keywords = extractSearchKeywords(prompt);
          const keywordStr = keywords.length > 0 ? keywords.join(', ') : prompt.substring(0, 30);
          const searchResults = await searchDuckDuckGo(prompt, 10);
          console.log('[AGENTIC_FETCH] Raw search results count:', searchResults.length);
          
          if (searchResults.length === 0) {
            console.log('[AGENTIC_FETCH] *** NO RESULTS FOUND ***');
            return `No results found for "${keywordStr}". The search may be too specific or DuckDuckGo is rate limiting.`;
          }
          
          // Return actual tool result for LLM
          return `Found ${searchResults.length} search results for "${keywordStr}". Ready to analyze specific pages.`;
        }
        
      } catch (error) {
        console.error('[AGENTIC_FETCH] *** ERROR IN EXECUTION ***');
        console.error('[AGENTIC_FETCH] Error:', error);
        
        // Return error message for LLM
        return `Search failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please try rephrasing your query.`;
      }
    },
  });
}

// Helper function to generate status messages for UI
export function generateStatusMessage({ prompt, url }: AgenticFetchParams): string {
  if (url) {
    return `📄 Browsing ${url}`;
  } else {
    const keywords = extractSearchKeywords(prompt);
    const keywordStr = keywords.length > 0 ? keywords.join(', ') : prompt.substring(0, 30);
    return `🔍 Searching for "${keywordStr}"`;
  }
}