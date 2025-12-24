package search

import (
	"strings"
	"testing"

	"golang.org/x/net/html"
)

func TestParseSearchResults(t *testing.T) {
	htmlInput := `
	<div class="result">
		<a class="result__a" href="https://duckduckgo.com/l/?uddg=https://example.com/page1">Result 1</a>
		<a class="result__snippet">This is the first snippet.</a>
	</div>
	<div class="result">
		<a class="result__a" href="https://example.com/page2">Result 2</a>
		<a class="result__snippet">This is the second snippet.</a>
	</div>
	<div class="result">
		<a class="result__a" href="#">Invalid Result</a>
	</div>
	`

	tests := []struct {
		name          string
		input         string
		maxResults    int
		expectedCount int
	}{
		{
			name:          "parse valid results",
			input:         htmlInput,
			maxResults:    2,
			expectedCount: 2,
		},
		{
			name:          "limit results",
			input:         htmlInput,
			maxResults:    1,
			expectedCount: 1,
		},
		{
			name:          "empty input",
			input:         "",
			maxResults:    5,
			expectedCount: 0,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			results := ParseSearchResults(tt.input, tt.maxResults)
			if len(results) != tt.expectedCount {
				t.Errorf("ParseSearchResults() expected %d results, got %d", tt.expectedCount, len(results))
			}

			if tt.expectedCount > 0 {
				if results[0].Title == "" || results[0].Link == "" {
					t.Errorf("ParseSearchResults() returned empty fields for first result: %+v", results[0])
				}
				// Verify URL cleaning
				if results[0].Link == "https://duckduckgo.com/l/?uddg=https://example.com/page1" {
					t.Errorf("ParseSearchResults() failed to clean URL: %s", results[0].Link)
				}
				if results[0].Link != "https://example.com/page1" {
					t.Errorf("ParseSearchResults() cleaned URL mismatch. Got: %s", results[0].Link)
				}
			}
		})
	}
}

func TestCleanDuckDuckGoURL(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "regular URL",
			input:    "https://example.com",
			expected: "https://example.com",
		},
		{
			name:     "DDG redirect URL",
			input:    "https://duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath%3Fq%3D123",
			expected: "https://example.com/path?q=123",
		},
		{
			name:     "empty URL",
			input:    "",
			expected: "",
		},
		{
			name:     "hash URL",
			input:    "#",
			expected: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := cleanDuckDuckGoURL(tt.input)
			if result != tt.expected {
				t.Errorf("cleanDuckDuckGoURL() failed\nInput:    %s\nExpected: %s\nGot:      %s", tt.input, tt.expected, result)
			}
		})
	}
}

func TestExtractTextContent(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name:     "simple text",
			input:    "<div>Hello</div>",
			expected: "Hello",
		},
		{
			name:     "nested text",
			input:    "<div><span>Hello</span> <b>World</b></div>",
			expected: "Hello World",
		},
		{
			name:     "text with whitespace",
			input:    "<div>  Hello  <span> World </span>  </div>",
			expected: "Hello World",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc, _ := html.Parse(strings.NewReader(tt.input))
			// html.Parse returns a document node, we want the body content
			// or just the first child of the body
			body := doc.FirstChild.LastChild // html -> head, body
			result := extractTextContent(body)
			if result != tt.expected {
				t.Errorf("extractTextContent() failed\nInput:    %s\nExpected: %s\nGot:      %s", tt.input, tt.expected, result)
			}
		})
	}
}
