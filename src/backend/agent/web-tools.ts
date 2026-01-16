import { getGoLibFFI, type SearchResult } from "@/backend/go-lib-ffi";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:web-tools");
import {
  BROWSER_USER_AGENT,
  DEFAULT_SEARCH_RESULTS_COUNT,
  FETCH_TIMEOUT_MS,
  MAX_FETCH_BYTES,
} from "./config";

export type { SearchResult };

export async function fetchUrlAndConvert(url: string): Promise<string> {
  logger.info({ url }, "Fetching URL");

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: controller.signal,
    });

    logger.info(
      { status: response.status, statusText: response.statusText },
      "Fetch response status",
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get("content-type") || "";
    logger.info({ contentType }, "Fetch content type");

    const contentLengthHeader = response.headers.get("content-length");
    const declaredLength = contentLengthHeader ? Number(contentLengthHeader) : NaN;
    if (Number.isFinite(declaredLength) && declaredLength > MAX_FETCH_BYTES) {
      throw new Error(
        `Response too large (${declaredLength} bytes). Max allowed is ${MAX_FETCH_BYTES} bytes.`,
      );
    }

    let content = await response.text();
    if (content.length > MAX_FETCH_BYTES) {
      throw new Error(
        `Response too large (${content.length} bytes). Max allowed is ${MAX_FETCH_BYTES} bytes.`,
      );
    }

    logger.info({ length: content.length }, "Fetched content length");

    // Convert HTML to Markdown
    if (contentType.includes("text/html")) {
      logger.info("Processing HTML content");
      const cleanedHtml = removeNoisyElements(content);
      content = convertHtmlToMarkdown(cleanedHtml);
      logger.info({ length: content.length }, "Processed markdown length");
    }
    // Format JSON
    else if (contentType.includes("application/json") || contentType.includes("text/json")) {
      logger.info("Processing JSON content");
      try {
        const parsed = JSON.parse(content);
        content = JSON.stringify(parsed, null, 2);
        logger.info({ length: content.length }, "Formatted JSON length");
      } catch (error) {
        logger.warn({ error }, "JSON parsing failed, keeping original");
        // Keep original if parsing fails
      }
    }

    return content;
  } finally {
    clearTimeout(timeoutId);
  }
}

function removeNoisyElements(html: string): string {
  const goLib = getGoLibFFI();
  if (!goLib) {
    throw new Error("Go library not available for HTML cleaning");
  }

  try {
    logger.info("Using Go library for HTML cleaning");
    const cleaned = goLib.cleanHTML(html);
    logger.info({ length: cleaned.length }, "Go library cleaned HTML length");
    return cleaned;
  } catch (error) {
    logger.error({ error }, "Go library failed during HTML cleaning");
    throw error;
  }
}

function convertHtmlToMarkdown(html: string): string {
  const goLib = getGoLibFFI();
  if (!goLib) {
    throw new Error("Go library not available for HTML-to-markdown conversion");
  }

  try {
    logger.info("Using Go library for HTML-to-markdown conversion");
    const markdown = goLib.convertToMarkdown(html);
    logger.info({ length: markdown.length }, "Go library converted markdown length");
    return markdown;
  } catch (error) {
    logger.error({ error }, "Go library failed during markdown conversion");
    throw error;
  }
}

// DuckDuckGo search functionality
export async function searchDuckDuckGo(
  query: string,
  maxResults: number = DEFAULT_SEARCH_RESULTS_COUNT,
): Promise<SearchResult[]> {
  logger.info({ query, maxResults }, "Searching DuckDuckGo");
  const formData = new URLSearchParams({
    q: query,
    b: "",
    kl: "",
  });

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
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
      signal: controller.signal,
    });

    logger.info({ status: response.status }, "Search response status");

    if (!response.ok && response.status !== 202) {
      throw new Error(
        `Search failed with status: ${response.status} (DuckDuckGo may be rate limiting)`,
      );
    }

    const html = await response.text();
    logger.info({ length: html.length }, "Raw search HTML length");
    const results = parseSearchResults(html, maxResults);
    logger.info({ count: results.length }, "Parsed search results");
    return results;
  } finally {
    clearTimeout(timeoutId);
  }
}

function parseSearchResults(html: string, maxResults: number): SearchResult[] {
  logger.info({ maxResults }, "Parsing search results");

  const goLib = getGoLibFFI();
  if (!goLib) {
    throw new Error("Go library not available for search result parsing");
  }

  try {
    logger.info("Using Go library for search result parsing");
    const results = goLib.parseSearchResults(html, maxResults);
    logger.info({ count: results.length }, "Go library parsed results");

    // Debug: Log when parsing might have failed
    if (results.length === 0 && html.length > 1000) {
      logger.warn(
        { sample: html.substring(0, 500) },
        "Parsing returned 0 results despite large HTML response",
      );
    }

    return results;
  } catch (error) {
    logger.error({ error }, "Go library failed during search result parsing");
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
