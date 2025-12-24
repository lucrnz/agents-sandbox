package search

import (
	"net/url"
	"slices"
	"strings"

	"golang.org/x/net/html"
)

// SearchResult represents a parsed search result
type SearchResult struct {
	Title    string
	Link     string
	Snippet  string
	Position int
}

// ParseSearchResults parses DuckDuckGo search results HTML
// Extracts title, URL, and snippet for each result
// Handles up to maxResults (default 20) results
// Returns array of SearchResult
func ParseSearchResults(htmlStr string, maxResults int) []SearchResult {
	if strings.TrimSpace(htmlStr) == "" {
		return []SearchResult{}
	}

	if maxResults <= 0 {
		maxResults = 20
	}

	// Parse the HTML
	doc, err := html.Parse(strings.NewReader(htmlStr))
	if err != nil {
		return []SearchResult{}
	}

	var results []SearchResult
	position := 1

	// Find all div.result elements
	var findResultDivs func(*html.Node)
	findResultDivs = func(node *html.Node) {
		if len(results) >= maxResults {
			return
		}

		if node.Type == html.ElementNode && node.Data == "div" && hasClass(node, "result") {
			// Parse this result
			result := parseResultDiv(node)
			if result.Title != "" && result.Link != "" && result.Link != "#" && !strings.Contains(result.Link, "y.js") {
				result.Position = position
				results = append(results, result)
				position++
			}
		}

		// Continue searching children
		for child := node.FirstChild; child != nil && len(results) < maxResults; child = child.NextSibling {
			findResultDivs(child)
		}
	}

	findResultDivs(doc)

	// Limit results to maxResults
	if len(results) > maxResults {
		results = results[:maxResults]
	}

	return results
}

// parseResultDiv extracts data from a single result div
func parseResultDiv(div *html.Node) SearchResult {
	var result SearchResult

	// Find title link (a.result__a)
	var findTitleLink func(*html.Node)
	findTitleLink = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "a" && hasClass(node, "result__a") {
			// Extract title
			result.Title = extractTextContent(node)
			// Extract and clean URL
			for _, attr := range node.Attr {
				if attr.Key == "href" {
					result.Link = cleanDuckDuckGoURL(attr.Val)
					break
				}
			}
			return
		}

		for child := node.FirstChild; child != nil; child = child.NextSibling {
			findTitleLink(child)
		}
	}

	// Find snippet link (a.result__snippet)
	var findSnippetLink func(*html.Node)
	findSnippetLink = func(node *html.Node) {
		if node.Type == html.ElementNode && node.Data == "a" && hasClass(node, "result__snippet") {
			result.Snippet = extractTextContent(node)
			return
		}

		for child := node.FirstChild; child != nil; child = child.NextSibling {
			findSnippetLink(child)
		}
	}

	findTitleLink(div)
	findSnippetLink(div)

	return result
}

// extractTextContent extracts text content from HTML nodes
func extractTextContent(node *html.Node) string {
	var text strings.Builder
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.TextNode {
			text.WriteString(n.Data)
		}
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
	}
	walk(node)

	// Collapse whitespace and trim
	fields := strings.Fields(text.String())
	return strings.Join(fields, " ")
}

// cleanDuckDuckGoURL cleans DuckDuckGo redirect URLs
func cleanDuckDuckGoURL(rawURL string) string {
	if rawURL == "" || rawURL == "#" {
		return ""
	}

	// Check if it's a DuckDuckGo redirect URL
	if strings.Contains(rawURL, "duckduckgo.com/l/?uddg=") {
		parsed, err := url.Parse(rawURL)
		if err != nil {
			return rawURL
		}

		// Extract uddg parameter
		uddg := parsed.Query().Get("uddg")
		if uddg != "" {
			// URL decode the actual URL
			decoded, err := url.QueryUnescape(uddg)
			if err == nil {
				return decoded
			}
		}
	}

	return rawURL
}

// hasClass checks if an HTML node has a specific CSS class.
// Handles elements with multiple classes by splitting on whitespace.
func hasClass(n *html.Node, class string) bool {
	for _, attr := range n.Attr {
		if attr.Key == "class" {
			return slices.Contains(strings.Fields(attr.Val), class)
		}
	}
	return false
}
