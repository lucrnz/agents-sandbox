package html

import (
	"strings"

	htmltomarkdown "github.com/JohannesKaufmann/html-to-markdown/v2"
)

// ConvertHTMLToMarkdown converts HTML to markdown with consistent formatting
// Uses default configuration which includes common markdown features
func ConvertHTMLToMarkdown(htmlStr string) string {
	if strings.TrimSpace(htmlStr) == "" {
		return ""
	}

	// Convert HTML to markdown
	markdown, err := htmltomarkdown.ConvertString(htmlStr)
	if err != nil {
		// Return empty string if conversion fails
		return ""
	}

	return cleanupMarkdown(markdown)
}

// cleanupMarkdown performs similar cleanup to the TypeScript version
func cleanupMarkdown(content string) string {
	// Collapse multiple blank lines
	content = strings.ReplaceAll(content, "\r\n", "\n")
	content = strings.ReplaceAll(content, "\r", "\n")

	// Collapse 3+ newlines to double newlines
	for strings.Contains(content, "\n\n\n") {
		content = strings.ReplaceAll(content, "\n\n\n", "\n\n")
	}

	// Remove trailing whitespace from each line
	lines := strings.Split(content, "\n")
	for i, line := range lines {
		lines[i] = strings.TrimRight(line, " \t")
	}
	content = strings.Join(lines, "\n")

	// Trim leading/trailing whitespace
	return strings.TrimSpace(content)
}
