import { test, expect, describe, beforeEach, afterEach, mock } from "bun:test";
import {
  generateConversationTitle,
  inferPageTitle,
  extractSearchKeywords,
  generateShortFilenameDescription,
} from "./title-generation";

// Mock Go FFI
const mockGoLib = {
  stripMarkdown: mock((text: string) => text.replace(/[#*_]/g, "")),
};

mock.module("@/backend/go-lib-ffi", () => ({
  getGoLibFFI: mock(() => mockGoLib),
}));

// Mock AI SDK
const mockGenerateText = mock(async () => ({
  text: "Mocked Title",
  output: { title: "Mocked Title" },
}));
mock.module("ai", () => ({
  generateText: mockGenerateText,
  Output: {
    object: mock(() => ({})),
  },
}));

describe("Title Generation", () => {
  beforeEach(() => {
    mockGenerateText.mockClear();
    mockGoLib.stripMarkdown.mockClear();
  });

  describe("generateConversationTitle", () => {
    test("should generate a title successfully", async () => {
      mockGenerateText.mockImplementationOnce(
        async () =>
          ({
            output: { title: "A Great Conversation" },
          }) as any,
      );

      const title = await generateConversationTitle("User: Hello\nAssistant: Hi there!");

      expect(title).toBe("A Great Conversation");
      expect(mockGenerateText).toHaveBeenCalled();
    });

    test("should fallback when generation fails", async () => {
      mockGenerateText.mockImplementationOnce(async () => {
        throw new Error("AI failure");
      });

      const content = "Short content";
      const title = await generateConversationTitle(content);

      expect(title).toBe(content);
    });
  });

  describe("inferPageTitle", () => {
    test("should infer title from URL via AI", async () => {
      mockGenerateText.mockImplementationOnce(
        async () =>
          ({
            text: "Example Page",
          }) as any,
      );

      const title = await inferPageTitle("http://example.com/page");

      expect(title).toBe("Example Page");
    });

    test("should fallback to URL parsing when AI fails", async () => {
      mockGenerateText.mockImplementationOnce(async () => {
        throw new Error("AI failure");
      });

      const title = await inferPageTitle("http://example.com/some/path");

      expect(title).toBe("example.com: path");
    });
  });

  describe("extractSearchKeywords", () => {
    test("should extract keywords correctly via AI", async () => {
      mockGenerateText.mockImplementationOnce(
        async () =>
          ({
            text: "benefits bun typescript development",
          }) as any,
      );

      const query = "What are the benefits of using Bun for TypeScript development?";
      const keywords = await extractSearchKeywords(query);

      expect(keywords).toContain("benefits");
      expect(keywords).toContain("bun");
      expect(keywords).toContain("typescript");
      expect(keywords).toContain("development");
      expect(mockGenerateText).toHaveBeenCalled();
    });

    test("should fallback when AI fails", async () => {
      mockGenerateText.mockImplementationOnce(async () => {
        throw new Error("AI failure");
      });

      const query = "Bun vs. Node.js!!!";
      const keywords = await extractSearchKeywords(query);

      expect(keywords).toContain("bun");
      expect(keywords).toContain("node");
    });
  });

  describe("generateShortFilenameDescription", () => {
    test("should generate filename-safe description", async () => {
      mockGenerateText.mockImplementationOnce(
        async () =>
          ({
            text: "Cool Project Ideas",
          }) as any,
      );

      const desc = await generateShortFilenameDescription("Some project content");

      expect(desc).toBe("Cool Project Ideas");
    });

    test("should fallback to keywords when AI fails", async () => {
      mockGenerateText.mockImplementationOnce(async () => {
        throw new Error("AI failure 1");
      });
      mockGenerateText.mockImplementationOnce(async () => {
        throw new Error("AI failure 2");
      });

      const desc = await generateShortFilenameDescription("TypeScript development with Bun");
      // keywords: typescript, development, bun
      expect(desc).toBe("typescript development bun");
    });
  });
});
