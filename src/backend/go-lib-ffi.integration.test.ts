/**
 * Integration tests for go-lib-ffi
 *
 * These tests load the ACTUAL .dylib library (not mocks) to verify
 * real FFI behavior. They are automatically skipped when the library
 * is not built.
 *
 * To run:
 *   1. Build the Go library: cd go-lib-ffi && make build
 *   2. Run tests: bun test go-lib-ffi.integration.test.ts
 */

import { test, expect, describe, beforeAll } from "bun:test";
import { GoLibFFIWrapper, getGoLibFFI } from "./go-lib-ffi";
import fs from "fs";
import path from "path";
import { suffix } from "bun:ffi";

// Check if library exists before running tests
const DYLIB_PATH = path.join(process.cwd(), "go-lib-ffi", `libgo-lib-ffi.${suffix}`);
const libExists = fs.existsSync(DYLIB_PATH);

describe.skipIf(!libExists)("GoLibFFI Integration", () => {
  let wrapper: GoLibFFIWrapper;

  beforeAll(() => {
    wrapper = new GoLibFFIWrapper();
    // Verify library loaded successfully
    if (!wrapper.isAvailable()) {
      throw new Error(
        `Library exists at ${DYLIB_PATH} but failed to load. ` +
          `Check architecture compatibility.`,
      );
    }
  });

  describe("Library Loading", () => {
    test("library loads successfully and is available", () => {
      expect(wrapper.isAvailable()).toBe(true);
    });

    test("getGoLibFFI singleton returns same instance", () => {
      const inst1 = getGoLibFFI();
      const inst2 = getGoLibFFI();
      expect(inst1).toBe(inst2);
      expect(inst1).not.toBeNull();
      expect(inst1?.isAvailable()).toBe(true);
    });
  });

  describe("getVersion", () => {
    test("returns a valid version string", () => {
      const version = wrapper.getVersion();
      expect(version).toBeDefined();
      expect(typeof version).toBe("string");
      expect(version).not.toBe("not loaded");
      expect(version).not.toBe("unknown");
      // Version should match semver-like pattern
      expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    });
  });

  describe("cleanHTML", () => {
    test("removes script tags from HTML", () => {
      const input =
        "<html><head><script>alert('xss')</script></head><body><p>Hello</p></body></html>";
      const result = wrapper.cleanHTML(input);

      expect(result).not.toContain("<script>");
      expect(result).not.toContain("alert");
      expect(result).toContain("Hello");
    });

    test("removes style tags from HTML", () => {
      const input =
        "<html><head><style>body{color:red}</style></head><body><p>World</p></body></html>";
      const result = wrapper.cleanHTML(input);

      expect(result).not.toContain("<style>");
      expect(result).not.toContain("color:red");
      expect(result).toContain("World");
    });

    test("preserves main content elements", () => {
      const input = "<html><body><main><h1>Title</h1><p>Content here</p></main></body></html>";
      const result = wrapper.cleanHTML(input);

      expect(result).toContain("Title");
      expect(result).toContain("Content here");
    });

    test("handles empty input", () => {
      const result = wrapper.cleanHTML("");
      expect(typeof result).toBe("string");
    });
  });

  describe("convertToMarkdown", () => {
    test("converts heading to markdown", () => {
      const input = "<h1>My Title</h1>";
      const result = wrapper.convertToMarkdown(input);

      expect(result).toContain("# My Title");
    });

    test("converts paragraph to markdown", () => {
      const input = "<p>This is a paragraph.</p>";
      const result = wrapper.convertToMarkdown(input);

      expect(result).toContain("This is a paragraph.");
    });

    test("converts links to markdown format", () => {
      const input = '<a href="https://example.com">Example Link</a>';
      const result = wrapper.convertToMarkdown(input);

      expect(result).toContain("[Example Link]");
      expect(result).toContain("https://example.com");
    });

    test("converts lists to markdown", () => {
      const input = "<ul><li>Item 1</li><li>Item 2</li></ul>";
      const result = wrapper.convertToMarkdown(input);

      expect(result).toContain("Item 1");
      expect(result).toContain("Item 2");
    });

    test("handles complex nested HTML", () => {
      const input = `
        <div>
          <h2>Section</h2>
          <p>Some <strong>bold</strong> and <em>italic</em> text.</p>
          <code>const x = 1;</code>
        </div>
      `;
      const result = wrapper.convertToMarkdown(input);

      expect(result).toContain("Section");
      expect(result).toContain("bold");
      expect(result).toContain("italic");
      expect(result).toContain("const x = 1");
    });

    test("handles empty input", () => {
      const result = wrapper.convertToMarkdown("");
      expect(typeof result).toBe("string");
    });
  });

  describe("parseSearchResults", () => {
    // Minimal mock of DuckDuckGo-style search result HTML
    const mockSearchHTML = `
      <html>
        <body>
          <div class="result results_links_deep">
            <a class="result__a" href="https://example.com/page1">Example Page 1</a>
            <a class="result__snippet">This is the first result snippet.</a>
          </div>
          <div class="result results_links_deep">
            <a class="result__a" href="https://example.com/page2">Example Page 2</a>
            <a class="result__snippet">This is the second result snippet.</a>
          </div>
        </body>
      </html>
    `;

    test("returns an array", () => {
      const results = wrapper.parseSearchResults(mockSearchHTML, 10);
      expect(Array.isArray(results)).toBe(true);
    });

    test("returns SearchResult objects with correct shape", () => {
      const results = wrapper.parseSearchResults(mockSearchHTML, 10);

      if (results.length > 0) {
        const result = results[0];
        expect(result).toHaveProperty("title");
        expect(result).toHaveProperty("link");
        expect(result).toHaveProperty("snippet");
        expect(result).toHaveProperty("position");
        expect(typeof result.title).toBe("string");
        expect(typeof result.link).toBe("string");
        expect(typeof result.snippet).toBe("string");
        expect(typeof result.position).toBe("number");
      }
    });

    test("respects maxResults parameter", () => {
      const results = wrapper.parseSearchResults(mockSearchHTML, 1);
      expect(results.length).toBeLessThanOrEqual(1);
    });

    test("handles empty HTML gracefully", () => {
      const results = wrapper.parseSearchResults("", 10);
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });

    test("handles non-search HTML gracefully", () => {
      const results = wrapper.parseSearchResults(
        "<html><body><p>Not search results</p></body></html>",
        10,
      );
      expect(Array.isArray(results)).toBe(true);
    });
  });

  describe("stripMarkdown", () => {
    test("removes heading markers", () => {
      const input = "# Hello World";
      const result = wrapper.stripMarkdown(input);

      expect(result).not.toContain("#");
      expect(result).toContain("Hello World");
    });

    test("removes bold markers", () => {
      const input = "This is **bold** text";
      const result = wrapper.stripMarkdown(input);

      expect(result).not.toContain("**");
      expect(result).toContain("bold");
      expect(result).toContain("text");
    });

    test("removes italic markers", () => {
      const input = "This is *italic* text";
      const result = wrapper.stripMarkdown(input);

      expect(result).not.toContain("*");
      expect(result).toContain("italic");
    });

    test("extracts link text from markdown links", () => {
      const input = "[Click here](https://example.com)";
      const result = wrapper.stripMarkdown(input);

      expect(result).toContain("Click here");
      // URL may or may not be included depending on implementation
    });

    test("preserves code content", () => {
      const input = "Use `console.log()` to debug";
      const result = wrapper.stripMarkdown(input);

      expect(result).toContain("console.log");
    });

    test("handles complex markdown", () => {
      const input = `
# Title

Some **bold** and *italic* text.

- List item 1
- List item 2

\`\`\`javascript
const x = 1;
\`\`\`
      `;
      const result = wrapper.stripMarkdown(input);

      expect(result).toContain("Title");
      expect(result).toContain("bold");
      expect(result).toContain("italic");
      expect(result).toContain("List item");
    });

    test("handles empty input", () => {
      const result = wrapper.stripMarkdown("");
      expect(typeof result).toBe("string");
    });
  });
});
