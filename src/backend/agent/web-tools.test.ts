import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import { fetchUrlAndConvert, searchDuckDuckGo, formatSearchResults } from "./web-tools";

// Mock Go FFI
const mockGoLib = {
  cleanHTML: mock((html: string) => `cleaned-${html}`),
  convertToMarkdown: mock((html: string) => `markdown-${html}`),
  parseSearchResults: mock((html: string, max: number) => [
    { title: "Result 1", link: "http://example.com/1", snippet: "Snippet 1", position: 1 },
  ]),
};

mock.module("@/backend/go-lib-ffi", () => ({
  getGoLibFFI: mock(() => mockGoLib),
}));

describe("Web Tools", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    mockGoLib.cleanHTML.mockClear();
    mockGoLib.convertToMarkdown.mockClear();
    mockGoLib.parseSearchResults.mockClear();
  });

  describe("fetchUrlAndConvert", () => {
    test("should fetch and convert HTML to markdown", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("<html><body>Test</body></html>", {
            headers: { "content-type": "text/html" },
            status: 200,
          }),
        ),
      ) as unknown as typeof fetch;

      const result = await fetchUrlAndConvert("http://example.com");

      expect(result).toBe("markdown-cleaned-<html><body>Test</body></html>");
      expect(mockGoLib.cleanHTML).toHaveBeenCalled();
      expect(mockGoLib.convertToMarkdown).toHaveBeenCalled();
    });

    test("should fetch and format JSON", async () => {
      const jsonData = { key: "value" };
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(JSON.stringify(jsonData), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        ),
      ) as unknown as typeof fetch;

      const result = await fetchUrlAndConvert("http://example.com/api.json");

      expect(JSON.parse(result)).toEqual(jsonData);
      expect(result).toContain('  "key": "value"'); // Formatted with 2 spaces
    });

    test("should return plain text as-is", async () => {
      const textData = "Plain text content";
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response(textData, {
            headers: { "content-type": "text/plain" },
            status: 200,
          }),
        ),
      ) as unknown as typeof fetch;

      const result = await fetchUrlAndConvert("http://example.com/test.txt");

      expect(result).toBe(textData);
    });

    test("should throw error for non-ok response", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Not Found", {
            status: 404,
            statusText: "Not Found",
          }),
        ),
      ) as unknown as typeof fetch;

      await expect(fetchUrlAndConvert("http://example.com/404")).rejects.toThrow(
        "Failed to fetch URL: 404 Not Found",
      );
    });
  });

  describe("searchDuckDuckGo", () => {
    test("should perform search and return results", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("<html>Search Results</html>", {
            status: 200,
          }),
        ),
      ) as unknown as typeof fetch;

      const results = await searchDuckDuckGo("test query");

      expect(results).toHaveLength(1);
      expect(results[0]!.title).toBe("Result 1");
      expect(mockGoLib.parseSearchResults).toHaveBeenCalled();
    });

    test("should handle 202 status (rate limiting)", async () => {
      globalThis.fetch = mock(() =>
        Promise.resolve(
          new Response("Rate limited", {
            status: 202,
          }),
        ),
      ) as unknown as typeof fetch;

      const results = await searchDuckDuckGo("test query");
      expect(results).toHaveLength(1); // Still calls parseSearchResults on 202
    });
  });

  describe("formatSearchResults", () => {
    test("should format results correctly", () => {
      const results = [
        { title: "T1", link: "L1", snippet: "S1", position: 1 },
        { title: "T2", link: "L2", snippet: "S2", position: 2 },
      ];

      const formatted = formatSearchResults(results);

      expect(formatted).toContain("Found 2 search results:");
      expect(formatted).toContain("1. T1");
      expect(formatted).toContain("URL: L1");
      expect(formatted).toContain("Summary: S1");
      expect(formatted).toContain("2. T2");
    });

    test("should handle empty results", () => {
      const formatted = formatSearchResults([]);
      expect(formatted).toContain("No results were found");
    });
  });
});
