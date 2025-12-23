/// <reference lib="dom" />

import { test, expect, describe } from "bun:test";
import { render } from "@testing-library/react";
import { MarkdownRenderer } from "./markdown-renderer";

describe("MarkdownRenderer component", () => {
  test("renders simple markdown correctly", () => {
    const content = "# Hello World\nThis is a **bold** text.";
    const { getByText, getByRole } = render(<MarkdownRenderer content={content} />);

    expect(getByRole("heading", { level: 1 })).toHaveTextContent("Hello World");
    // MarkdownRenderer might wrap bold text in strong or just style it
    expect(getByText("bold")).toBeInTheDocument();
  });

  test("renders links with correct attributes", () => {
    const content = "[My Link](https://example.com)";
    const { getByRole } = render(<MarkdownRenderer content={content} />);

    const link = getByRole("link");
    expect(link).toHaveAttribute("href", "https://example.com");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    expect(link).toHaveTextContent("My Link");
  });

  test("renders code blocks", () => {
    const content = "```javascript\nconst x = 1;\n```";
    const { container } = render(<MarkdownRenderer content={content} />);

    const code = container.querySelector("code");
    expect(code).toBeInTheDocument();
    expect(code).toHaveTextContent("const x = 1;");
  });

  test("applies custom className to wrapper", () => {
    const { container } = render(<MarkdownRenderer content="test" className="custom-md" />);
    expect(container.firstChild).toHaveClass("custom-md");
  });
});
