package markdown

import (
	"bytes"
	"regexp"
	"strings"

	"github.com/yuin/goldmark"
	"github.com/yuin/goldmark/ast"
	"github.com/yuin/goldmark/extension"
	extast "github.com/yuin/goldmark/extension/ast"
	"github.com/yuin/goldmark/text"
)

// Global goldmark instance with GitHub Flavored Markdown extensions
var markdownConverter = goldmark.New(
	goldmark.WithExtensions(extension.GFM),
)

// StripMarkdown converts markdown text to plain text by removing all formatting
// while preserving semantic content (link text, image alt text, code, etc.)
// and basic structure (paragraph breaks, list bullets).
func StripMarkdown(source string) string {
	if source == "" {
		return ""
	}

	// Parse the markdown into an AST
	reader := text.NewReader([]byte(source))
	doc := markdownConverter.Parser().Parse(reader)

	var buf bytes.Buffer
	var listDepth int
	var inListItem bool

	// Walk the AST and extract plain text
	err := ast.Walk(doc, func(n ast.Node, entering bool) (ast.WalkStatus, error) {
		switch node := n.(type) {
		case *ast.Text:
			if entering {
				buf.Write(node.Segment.Value([]byte(source)))
				// Handle soft line breaks (convert to space)
				if node.SoftLineBreak() {
					buf.WriteString(" ")
				}
				// Hard line breaks are preserved in the text
				if node.HardLineBreak() {
					buf.WriteString("\n")
				}
			}

		case *ast.String:
			if entering {
				buf.Write(node.Value)
			}

		case *ast.CodeBlock, *ast.FencedCodeBlock:
			if entering {
				// Extract code block content
				lines := node.Lines()
				for i := 0; i < lines.Len(); i++ {
					line := lines.At(i)
					buf.Write(line.Value([]byte(source)))
				}
				buf.WriteString("\n")
			}

		case *ast.CodeSpan:
			// Text content will be handled by child Text nodes
			// Just pass through

		case *ast.Image:
			if entering {
				// Extract alt text from image
				// The alt text is in the child text nodes
				// We'll let the text nodes handle it naturally
			}

		case *ast.Link:
			// Extract link text (child nodes will be processed)
			// Ignore the URL

		case *ast.List:
			if entering {
				listDepth++
			} else {
				listDepth--
				if listDepth == 0 {
					buf.WriteString("\n")
				}
			}

		case *ast.ListItem:
			if entering {
				inListItem = true
				// Add bullet/number based on parent list type
				parent := node.Parent()
				if list, ok := parent.(*ast.List); ok {
					indent := strings.Repeat("  ", listDepth-1)
					if list.IsOrdered() {
						buf.WriteString(indent)
						buf.WriteString("1. ")
					} else {
						buf.WriteString(indent)
						buf.WriteString("- ")
					}
				}
			} else {
				inListItem = false
				buf.WriteString("\n")
			}

		case *ast.Paragraph:
			if !entering && !inListItem {
				buf.WriteString("\n\n")
			}

		case *ast.Heading:
			if !entering {
				buf.WriteString("\n\n")
			}

		case *ast.Blockquote:
			// Don't add extra newlines within blockquotes
			// Just let the content flow naturally
			if !entering {
				buf.WriteString("\n\n")
			}

		case *ast.ThematicBreak:
			if entering {
				buf.WriteString("\n\n")
			}

		case *ast.HTMLBlock:
			// Skip HTML blocks entirely
			return ast.WalkSkipChildren, nil

		case *ast.RawHTML:
			// Skip inline HTML
			return ast.WalkSkipChildren, nil

		case *extast.Table:
			if !entering {
				buf.WriteString("\n\n")
			}

		case *extast.TableRow:
			if !entering {
				buf.WriteString("\n")
			}

		case *extast.TableCell:
			if !entering {
				buf.WriteString(" ")
			}

		case *extast.Strikethrough:
			// Pass through - children will be processed

		case *ast.AutoLink:
			if entering {
				// Extract URL as text for autolinks
				buf.Write(node.URL([]byte(source)))
			}
		}

		return ast.WalkContinue, nil
	})

	if err != nil {
		// Fallback: return original text if parsing fails
		return source
	}

	// Clean up excessive whitespace
	result := buf.String()
	result = strings.TrimSpace(result)

	// Replace more than 2 consecutive newlines with exactly 2
	re := regexp.MustCompile(`\n{3,}`)
	result = re.ReplaceAllString(result, "\n\n")

	return result
}
