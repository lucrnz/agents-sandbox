package markdown

import (
	"strings"
	"testing"
)

func TestStripMarkdown(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "plain text",
			input:    "This is plain text",
			expected: "This is plain text",
		},
		{
			name:     "headings",
			input:    "# Heading 1\n## Heading 2\n### Heading 3",
			expected: "Heading 1\n\nHeading 2\n\nHeading 3",
		},
		{
			name:     "bold and italic",
			input:    "This is **bold** and *italic* and _underline_",
			expected: "This is bold and italic and underline",
		},
		{
			name:     "strikethrough",
			input:    "This is ~~strikethrough~~ text",
			expected: "This is strikethrough text",
		},
		{
			name:     "links",
			input:    "Click [here](https://example.com) for more info",
			expected: "Click here for more info",
		},
		{
			name:     "images",
			input:    "Here's an image: ![Alt text](image.jpg)",
			expected: "Here's an image: Alt text",
		},
		{
			name:     "inline code",
			input:    "Use `console.log()` to print",
			expected: "Use console.log() to print",
		},
		{
			name:     "code block",
			input:    "```javascript\nfunction hello() {\n  console.log('Hi');\n}\n```",
			expected: "function hello() {\n  console.log('Hi');\n}",
		},
		{
			name:     "unordered list",
			input:    "- Item 1\n- Item 2\n- Item 3",
			expected: "- Item 1\n- Item 2\n- Item 3",
		},
		{
			name:     "ordered list",
			input:    "1. First\n2. Second\n3. Third",
			expected: "1. First\n1. Second\n1. Third",
		},
		{
			name:     "nested list",
			input:    "- Item 1\n  - Nested 1\n  - Nested 2\n- Item 2",
			expected: "- Item 1  - Nested 1\n  - Nested 2\n\n- Item 2",
		},
		{
			name:     "blockquote",
			input:    "> This is a quote\n> Multiple lines",
			expected: "This is a quote Multiple lines",
		},
		{
			name:     "table",
			input:    "| Header 1 | Header 2 |\n|----------|----------|\n| Cell 1   | Cell 2   |",
			expected: "Header 1 Header 2 Cell 1 Cell 2",
		},
		{
			name:     "horizontal rule",
			input:    "Before\n\n---\n\nAfter",
			expected: "Before\n\nAfter",
		},
		{
			name:     "mixed formatting",
			input:    "# Title\n\nThis is **bold** and *italic* text with a [link](https://example.com).\n\n- List item 1\n- List item 2",
			expected: "Title\n\nThis is bold and italic text with a link.\n\n- List item 1\n- List item 2",
		},
		{
			name:     "autolink",
			input:    "Visit https://example.com for more",
			expected: "Visit https://example.com for more",
		},
		{
			name:     "task list (GFM)",
			input:    "- [ ] Todo item\n- [x] Done item",
			expected: "- Todo item\n- Done item",
		},
		{
			name:     "unicode and emoji",
			input:    "Hello 👋 **世界** 🌍",
			expected: "Hello 👋 世界 🌍",
		},
		{
			name:     "multiple paragraphs",
			input:    "Paragraph 1\n\nParagraph 2\n\nParagraph 3",
			expected: "Paragraph 1\n\nParagraph 2\n\nParagraph 3",
		},
		{
			name:     "nested formatting",
			input:    "**Bold with *italic* inside**",
			expected: "Bold with italic inside",
		},
		{
			name:     "link with formatting",
			input:    "[**Bold link**](https://example.com)",
			expected: "Bold link",
		},
		{
			name:     "image with special chars in alt",
			input:    "![Image: *special* chars](img.jpg)",
			expected: "Image: special chars",
		},
		{
			name:     "code with backticks",
			input:    "Use `` `backtick` `` in code",
			expected: "Use `backtick` in code",
		},
		{
			name:     "large document simulation",
			input:    strings.Repeat("# Section\n\nParagraph with **bold** text.\n\n", 100),
			expected: strings.TrimSpace(strings.Repeat("Section\n\nParagraph with bold text.\n\n", 100)),
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := StripMarkdown(tt.input)
			result = strings.TrimSpace(result)
			expected := strings.TrimSpace(tt.expected)

			if result != expected {
				t.Errorf("StripMarkdown() failed\nInput:    %q\nExpected: %q\nGot:      %q", tt.input, expected, result)
			}
		})
	}
}

func TestStripMarkdownEdgeCases(t *testing.T) {
	tests := []struct {
		name  string
		input string
	}{
		{
			name:  "only whitespace",
			input: "   \n\n   \t\t  ",
		},
		{
			name:  "malformed markdown",
			input: "**unclosed bold\n*unclosed italic\n[broken link",
		},
		{
			name:  "excessive newlines",
			input: "Text\n\n\n\n\n\nMore text",
		},
		{
			name:  "special characters",
			input: "< > & \" ' \\ / @ # $ %",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Should not panic
			result := StripMarkdown(tt.input)

			// Should return some result (even if empty after trimming)
			if result == "" && tt.input != "" {
				// This is OK for whitespace-only input
				if strings.TrimSpace(tt.input) != "" {
					t.Logf("Warning: returned empty string for non-empty input: %q", tt.input)
				}
			}
		})
	}
}

func BenchmarkStripMarkdown(b *testing.B) {
	input := `# Benchmark Test

This is a **benchmark** test with *various* markdown features.

## Lists

- Item 1
- Item 2
  - Nested item
- Item 3

## Code

` + "```go" + `
func main() {
    fmt.Println("Hello")
}
` + "```" + `

## Links and Images

Visit [this link](https://example.com) or see ![this image](img.jpg).

> This is a blockquote with **bold** text.
`

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		_ = StripMarkdown(input)
	}
}
