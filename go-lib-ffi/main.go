package main

/*
#include <stdlib.h>
*/
import "C"

import (
	"encoding/json"
	"unsafe"

	"go-lib-ffi/html"
	"go-lib-ffi/markdown"
	"go-lib-ffi/search"
)

// CleanHTML removes noisy elements from HTML and returns cleaned HTML string.
// The returned string must be freed by calling FreeString.
// Returns empty string on error.
//
//export CleanHTML
func CleanHTML(htmlStr *C.char) *C.char {
	if htmlStr == nil {
		return C.CString("")
	}

	goHTML := C.GoString(htmlStr)
	cleaned := html.CleanHTML(goHTML)
	return C.CString(cleaned)
}

// ConvertHTMLToMarkdown converts HTML to markdown format.
// The returned string must be freed by calling FreeString.
// Returns empty string on error or if conversion fails.
//
//export ConvertHTMLToMarkdown
func ConvertHTMLToMarkdown(htmlStr *C.char) *C.char {
	if htmlStr == nil {
		return C.CString("")
	}

	goHTML := C.GoString(htmlStr)
	markdown := html.ConvertHTMLToMarkdown(goHTML)
	return C.CString(markdown)
}

// ParseSearchResults parses DuckDuckGo search results HTML.
// Returns JSON array of search results. The returned string must be freed by calling FreeString.
// Returns empty JSON array on error.
//
//export ParseSearchResults
func ParseSearchResults(htmlStr *C.char, maxResults C.int) *C.char {
	if htmlStr == nil {
		return C.CString("[]")
	}

	goHTML := C.GoString(htmlStr)
	max := int(maxResults)
	if max <= 0 {
		max = 20
	}

	results := search.ParseSearchResults(goHTML, max)

	// Marshal results to JSON
	jsonBytes, err := json.Marshal(results)
	if err != nil {
		return C.CString("[]")
	}

	return C.CString(string(jsonBytes))
}

// StripMarkdown converts markdown text to plain text by removing all formatting.
// Preserves semantic content (link text, image alt text, code) and basic structure.
// The returned string must be freed by calling FreeString.
// Returns empty string on error.
//
//export StripMarkdown
func StripMarkdown(markdownStr *C.char) *C.char {
	if markdownStr == nil {
		return C.CString("")
	}

	goMarkdown := C.GoString(markdownStr)
	plainText := markdown.StripMarkdown(goMarkdown)
	return C.CString(plainText)
}

// FreeString frees memory allocated by functions returning *C.char.
// Must be called on all returned strings to prevent memory leaks.
//
//export FreeString
func FreeString(str *C.char) {
	if str != nil {
		C.free(unsafe.Pointer(str))
	}
}

// GetLibraryVersion returns the current version of the library.
// The returned string must be freed by calling FreeString.
//
//export GetLibraryVersion
func GetLibraryVersion() *C.char {
	return C.CString("1.1.0")
}

func main() {
	// This is a C shared library, so main() is not used
	// But Go requires it to build as a library
}
