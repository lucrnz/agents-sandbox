package html

import (
	"strings"
	"testing"
)

func TestConvertHTMLToMarkdown(t *testing.T) {
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
			name:     "simple paragraph",
			input:    "<p>Hello World</p>",
			expected: "Hello World",
		},
		{
			name:     "bold and italic",
			input:    "<p><strong>Bold</strong> and <em>Italic</em></p>",
			expected: "**Bold** and *Italic*",
		},
		{
			name:     "heading",
			input:    "<h1>Title</h1>",
			expected: "# Title",
		},
		{
			name:     "list",
			input:    "<ul><li>Item 1</li><li>Item 2</li></ul>",
			expected: "- Item 1\n- Item 2",
		},
		{
			name:     "link",
			input:    "<a href=\"https://example.com\">Link</a>",
			expected: "[Link](https://example.com)",
		},
		{
			name:     "multiple blank lines",
			input:    "<p>First</p><br><br><br><p>Second</p>",
			expected: "First\n\nSecond",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := ConvertHTMLToMarkdown(tt.input)
			if strings.TrimSpace(result) != strings.TrimSpace(tt.expected) {
				t.Errorf("ConvertHTMLToMarkdown() failed\nInput:    %s\nExpected: %s\nGot:      %s", tt.input, tt.expected, result)
			}
		})
	}
}

func TestCleanupMarkdown(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "collapse 3+ newlines",
			input:    "Line 1\n\n\n\nLine 2",
			expected: "Line 1\n\nLine 2",
		},
		{
			name:     "remove trailing whitespace",
			input:    "Line 1   \nLine 2\t",
			expected: "Line 1\nLine 2",
		},
		{
			name:     "trim leading/trailing whitespace",
			input:    "  \nLine 1\n  ",
			expected: "Line 1",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := cleanupMarkdown(tt.input)
			if result != tt.expected {
				t.Errorf("cleanupMarkdown() failed\nInput:    %q\nExpected: %q\nGot:      %q", tt.input, tt.expected, result)
			}
		})
	}
}
