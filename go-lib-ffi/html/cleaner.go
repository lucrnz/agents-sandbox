package html

import (
	"strings"

	"golang.org/x/net/html"
)

// CleanHTML removes noisy elements from HTML content
// It removes: script, style, nav, header, footer, aside, noscript, iframe, svg
// Returns the cleaned HTML as a string
func CleanHTML(htmlStr string) string {
	if strings.TrimSpace(htmlStr) == "" {
		return ""
	}

	// Parse the HTML
	doc, err := html.Parse(strings.NewReader(htmlStr))
	if err != nil {
		// Return original HTML if parsing fails
		return htmlStr
	}

	// Elements to remove
	noisyElements := map[string]bool{
		"script":   true,
		"style":    true,
		"nav":      true,
		"header":   true,
		"footer":   true,
		"aside":    true,
		"noscript": true,
		"iframe":   true,
		"svg":      true,
	}

	// Walk the tree and remove noisy elements
	var removeElements func(*html.Node, *html.Node)
	removeElements = func(node, parent *html.Node) {
		if node.Type == html.ElementNode && noisyElements[node.Data] {
			// Remove this node
			if parent != nil {
				parent.RemoveChild(node)
			}
			return
		}

		// Process children
		for child := node.FirstChild; child != nil; {
			next := child.NextSibling
			removeElements(child, node)
			child = next
		}
	}

	// Remove noisy elements from the entire document
	removeElements(doc, nil)

	// Render the cleaned HTML back to string
	var sb strings.Builder
	err = html.Render(&sb, doc)
	if err != nil {
		// Return original HTML if rendering fails
		return htmlStr
	}

	return sb.String()
}
