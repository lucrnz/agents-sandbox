import { getGoLibFFI, type SearchResult } from "../go-lib-ffi";
import { BROWSER_USER_AGENT, DEFAULT_SEARCH_RESULTS_COUNT } from "./config";

export type { SearchResult };

export async function fetchUrlAndConvert(url: string): Promise<string> {
  console.log("[WEB_TOOLS] Fetching URL:", url);
  const response = await fetch(url, {
    headers: {
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  console.log("[WEB_TOOLS] Response status:", response.status, response.statusText);

  if (!response.ok) {
    throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  console.log("[WEB_TOOLS] Content type:", contentType);
  let content = await response.text();

  console.log("[WEB_TOOLS] Raw content length:", content.length);

  // Convert HTML to Markdown
  if (contentType.includes("text/html")) {
    console.log("[WEB_TOOLS] Processing HTML content");
    const cleanedHtml = removeNoisyElements(content);
    content = convertHtmlToMarkdown(cleanedHtml);
    content = cleanupMarkdown(content);
    console.log("[WEB_TOOLS] Processed markdown length:", content.length);
  }
  // Format JSON
  else if (contentType.includes("application/json") || contentType.includes("text/json")) {
    console.log("[WEB_TOOLS] Processing JSON content");
    try {
      const parsed = JSON.parse(content);
      content = JSON.stringify(parsed, null, 2);
      console.log("[WEB_TOOLS] Formatted JSON length:", content.length);
    } catch {
      console.log("[WEB_TOOLS] JSON parsing failed, keeping original");
      // Keep original if parsing fails
    }
  }

  return content;
}

function removeNoisyElements(html: string): string {
  const goLib = getGoLibFFI();
  if (!goLib) {
    throw new Error("Go library not available for HTML cleaning");
  }

  try {
    console.log("[WEB_TOOLS] Using Go library for HTML cleaning");
    const cleaned = goLib.cleanHTML(html);
    console.log("[WEB_TOOLS] Go library cleaned HTML length:", cleaned.length);
    return cleaned;
  } catch (error) {
    console.error("[WEB_TOOLS] Go library failed:", error);
    throw error;
  }
}

function convertHtmlToMarkdown(html: string): string {
  const goLib = getGoLibFFI();
  if (!goLib) {
    throw new Error("Go library not available for HTML-to-markdown conversion");
  }

  try {
    console.log("[WEB_TOOLS] Using Go library for HTML-to-markdown conversion");
    const markdown = goLib.convertToMarkdown(html);
    console.log("[WEB_TOOLS] Go library converted markdown length:", markdown.length);
    return markdown;
  } catch (error) {
    console.error("[WEB_TOOLS] Go library failed:", error);
    throw error;
  }
}

function cleanupMarkdown(content: string): string {
  // Collapse multiple blank lines
  content = content.replace(/\n{3,}/g, "\n\n");

  // Remove trailing whitespace from each line
  content = content
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");

  // Trim leading/trailing whitespace
  return content.trim();
}

// DuckDuckGo search functionality
export async function searchDuckDuckGo(
  query: string,
  maxResults: number = DEFAULT_SEARCH_RESULTS_COUNT,
): Promise<SearchResult[]> {
  console.log("[WEB_TOOLS] Searching DuckDuckGo for:", query, "max results:", maxResults);
  const formData = new URLSearchParams({
    q: query,
    b: "",
    kl: "",
  });

  const response = await fetch("https://html.duckduckgo.com/html", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": BROWSER_USER_AGENT,
      Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
      "Accept-Encoding": "gzip, deflate",
      Referer: "https://duckduckgo.com/",
    },
    body: formData.toString(),
  });

  console.log("[WEB_TOOLS] Search response status:", response.status);

  if (!response.ok && response.status !== 202) {
    throw new Error(
      `Search failed with status: ${response.status} (DuckDuckGo may be rate limiting)`,
    );
  }

  const html = await response.text();
  console.log("[WEB_TOOLS] Raw search HTML length:", html.length);
  const results = parseSearchResults(html, maxResults);
  console.log("[WEB_TOOLS] Parsed", results.length, "search results");
  return results;
}

function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  console.log("[WEB_TOOLS] Parsing search results, max:", maxResults);

  const goLib = getGoLibFFI();
  if (!goLib) {
    throw new Error("Go library not available for search result parsing");
  }

  try {
    console.log("[WEB_TOOLS] Using Go library for search result parsing");
    const results = goLib.parseSearchResults(html, maxResults);
    console.log("[WEB_TOOLS] Go library parsed", results.length, "results");

    // Debug: Log when parsing might have failed
    if (results.length === 0 && html.length > 1000) {
      console.warn("[WEB_TOOLS] Parsing returned 0 results despite large HTML response");
      console.warn("[WEB_TOOLS] First 500 chars of HTML:", html.substring(0, 500));
      console.warn("[WEB_TOOLS] This likely indicates a parsing issue, not rate limiting");
    }

    return results;
  } catch (error) {
    console.error("[WEB_TOOLS] Go library failed:", error);
    throw error;
  }
}

export function formatSearchResults(results: SearchResult[]): string {
  if (results.length === 0) {
    return "No results were found for your search query. This could be due to DuckDuckGo's bot detection or the query returned no matches. Please try rephrasing your search or try again in a few minutes.";
  }

  let output = `Found ${results.length} search results:\n\n`;

  for (const result of results) {
    output += `${result.position}. ${result.title}\n`;
    output += `   URL: ${result.link}\n`;
    output += `   Summary: ${result.snippet}\n\n`;
  }

  return output;
}
