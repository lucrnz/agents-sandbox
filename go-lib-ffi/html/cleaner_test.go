package html

import (
	"strings"
	"testing"
)

func TestCleanHTML(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string // We'll use strings.Contains or similar if exact match is hard due to rendering
	}{
		{
			name:     "empty string",
			input:    "",
			expected: "",
		},
		{
			name:     "plain text",
			input:    "<html><body>Hello World</body></html>",
			expected: "<html><head></head><body>Hello World</body></html>",
		},
		{
			name:     "remove script",
			input:    "<html><body><p>Hello</p><script>alert('hi')</script></body></html>",
			expected: "<html><head></head><body><p>Hello</p></body></html>",
		},
		{
			name:     "remove style",
			input:    "<html><head><style>body { color: red; }</style></head><body><p>Hello</p></body></html>",
			expected: "<html><head></head><body><p>Hello</p></body></html>",
		},
		{
			name:     "remove nav and footer",
			input:    "<html><body><nav>Menu</nav><main>Content</main><footer>Bye</footer></body></html>",
			expected: "<html><head></head><body><main>Content</main></body></html>",
		},
		{
			name:     "remove header and aside",
			input:    "<html><body><header>Title</header><aside>Sidebar</aside><p>Text</p></body></html>",
			expected: "<html><head></head><body><p>Text</p></body></html>",
		},
		{
			name:     "remove noscript, iframe, svg",
			input:    "<html><body><noscript>JS disabled</noscript><iframe src=''></iframe><svg><circle/></svg><p>Text</p></body></html>",
			expected: "<html><head></head><body><p>Text</p></body></html>",
		},
		{
			name:     "nested noisy elements",
			input:    "<html><body><div><nav><ul><li><script>console.log(1)</script></li></ul></nav></div><p>Keep</p></body></html>",
			expected: "<html><head></head><body><div></div><p>Keep</p></body></html>",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			result := CleanHTML(tt.input)
			// Normalize for comparison (remove whitespace)
			normalizedResult := normalizeHTML(result)
			normalizedExpected := normalizeHTML(tt.expected)

			if normalizedResult != normalizedExpected {
				t.Errorf("CleanHTML() failed\nInput:    %s\nExpected: %s\nGot:      %s", tt.input, tt.expected, result)
			}
		})
	}
}

// normalizeHTML removes whitespace between tags for easier comparison
func normalizeHTML(h string) string {
	h = strings.ReplaceAll(h, "\n", "")
	h = strings.ReplaceAll(h, "\t", "")
	h = strings.ReplaceAll(h, "  ", " ")
	// This is a very basic normalization
	return strings.TrimSpace(h)
}
