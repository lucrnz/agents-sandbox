```markdown
# Enhanced Plan: Add StripMarkdown Function to go-lib-ffi

## Overview

Implement a `StripMarkdown` function in the Go FFI library to convert markdown text to plain text by removing all markdown formatting syntax while preserving the semantic text content (including link text, image alt text, code content, and basic structure like paragraph breaks). This function will be exposed to the TypeScript application via FFI bindings, allowing the frontend to reliably extract clean plain text from markdown content.

## Current State

- **Go library structure**: The `go-lib-ffi/` directory contains a working FFI library with functions for HTML processing and markdown conversion
- **Existing functions**: `CleanHTML`, `ConvertHTMLToMarkdown`, `ParseSearchResults`, `GetLibraryVersion`
- **TypeScript bindings**: Working FFI wrapper in `src/backend/agent/go-lib-ffi.ts` with proper memory management
- **Dependencies**: Only `github.com/JohannesKaufmann/html-to-markdown/v2` is currently used
- **Missing**: No function to strip markdown formatting and convert to plain text

## Proposed Solution

Implement a `StripMarkdown` function in Go that uses the **goldmark** markdown parser (a modern, extensible, pure-Go CommonMark/GFM compliant library) to parse the markdown into an AST, then walk the AST to extract plain text content.

Key behaviors:
1. Remove all formatting syntax (headings, bold, italic, links, images, code, lists, blockquotes, tables, etc.)
2. Preserve semantic text: link text (discard URLs), image alt text, code content, list item text, table cell text, etc.
3. Preserve basic structure: paragraph breaks (`\n\n`), list bullets/indentation, line breaks in code blocks
4. Follow the existing FFI pattern (exports C-compatible function, handles memory properly)
5. Expose the function to TypeScript via FFI bindings

**Why goldmark-based AST walking approach?**
- Proper parsing handles nested formatting, ambiguous syntax, and edge cases correctly (regex is brittle and error-prone for complex/nested markdown)
- Accurate extraction of semantic content (e.g., image alt text, link text only, code blocks)
- Supports GitHub Flavored Markdown out of the box (tables, task lists, strikethrough, etc.)
- Lightweight, fast, pure-Go dependency with no external requirements
- Actively maintained and widely used in production
- More maintainable and extensible than hand-rolled regex patterns
- Superior results for real-world AI-generated or user markdown content

**Alternative considered**: Converting to HTML then stripping tags — rejected because it loses image alt text and makes preserving structure harder without additional parsing logic.

## Implementation Steps

### Phase 0: Add Dependency
- [ ] Run `go get github.com/yuin/goldmark@latest` (currently v1.7.x series)
- [ ] The extension package is included in the same repo — no additional imports needed
- [ ] Verify `go.mod` and `go.sum` are updated correctly
- [ ] Run `go mod tidy`

### Phase 1: Go Implementation
- [ ] Create new file `go-lib-ffi/markdown/strip.go` with `StripMarkdown` function
- [ ] Initialize a global goldmark instance with GFM extensions:
  ```go
  var markdownConverter = goldmark.New(
      goldmark.WithExtensions(extension.GFM),
  )
  ```
- [ ] Implement text extraction via AST walking:
  - Parse input with `markdownConverter.Parser().Parse(text.NewReader(source))`
  - Use `ast.Walk` to traverse the document
  - On entering nodes:
    - `*ast.Text`: append segment value
    - `*ast.CodeBlock` / `*ast.FencedCodeBlock`: append code text + `\n`
    - `*ast.CodeSpan`: append inner text (via children)
    - `*ast.Image`: append alt text (optionally wrapped as `[alt]`)
    - `*ast.ListItem`: prepend bullet/indentation based on list type and depth (e.g., `- `, `  * `, `1. `)
  - On exiting block-level nodes (Paragraph, Heading, List, Blockquote, CodeBlock, Table, etc.): append `\n\n` (or `\n` for list items)
  - Ignore decoration nodes (Link, Emphasis, Strikethrough, etc.) — their children are processed naturally
  - Handle table nodes by extracting cell text with simple spacing/separators or just concatenation
- [ ] Clean up extra whitespace/newlines at the end (trim + replace multiple `\n` with `\n\n`)
- [ ] Add comprehensive unit tests in `go-lib-ffi/markdown/strip_test.go`
- [ ] Test edge cases: nested formatting, malformed markdown, empty input, very large input, Unicode/emoji

### Phase 2: FFI Export
- [ ] Add exported C function `StripMarkdown` in `go-lib-ffi/main.go`
- [ ] Follow existing pattern: accept `*C.char`, return `*C.char`
- [ ] Add proper null checking, UTF-8 handling, and error fallback (return empty string on parse failure)
- [ ] Document the function with Go comments
- [ ] Update library version to `1.1.0` in `GetLibraryVersion()`

### Phase 3: TypeScript Integration
- [ ] Add `StripMarkdown` to FFI symbols interface in `src/backend/agent/go-lib-ffi.ts`
- [ ] Add function definition to `dlopen` configuration
- [ ] Implement wrapper method `stripMarkdown(markdown: string): string` in `GoLibFFIWrapper` class
- [ ] Handle buffer encoding and pointer cleanup (follow existing pattern)
- [ ] Add TypeScript error handling and fallback (return original string if Go lib unavailable)

### Phase 4: Testing & Verification
- [ ] Rebuild Go library: `cd go-lib-ffi && make build`
- [ ] Run Go tests: `cd go-lib-ffi && go test ./...`
- [ ] Test TypeScript integration manually
- [ ] Create test cases for:
  - [ ] Simple markdown (headings, bold, italic, strikethrough)
  - [ ] Links and images (preserve text/alt, discard URLs/src)
  - [ ] Code blocks and inline code
  - [ ] Lists (nested, ordered/unordered, preserve bullets)
  - [ ] Blockquotes, tables, task lists
  - [ ] Paragraph spacing and line breaks
  - [ ] Edge cases (empty string, plain text, malformed markdown, Unicode)
  - [ ] Memory leaks (verify FreeString is called properly)

### Phase 5: Documentation
- [ ] Update `AGENTS.md` to document the new function and its behavior
- [ ] Add usage examples to Go package documentation
- [ ] Update TypeScript interface documentation
- [ ] Add inline comments explaining the AST walking strategy

## Files to Modify

### New Files
- `go-lib-ffi/markdown/strip.go` - Core goldmark-based implementation
- `go-lib-ffi/markdown/strip_test.go` - Unit tests

### Modified Files
- `go-lib-ffi/main.go` - Add FFI export function
- `go-lib-ffi/go.mod` / `go.sum` - Add goldmark dependency
- `src/backend/agent/go-lib-ffi.ts` - Add TypeScript bindings
- `AGENTS.md` - Document new function

## Testing Strategy

### Unit Tests (Go)
```go
func TestStripMarkdown(t *testing.T) {
    tests := []struct {
        name     string
        input    string
        expected string
    }{
        {
            name: "headings",
            input: "# Heading\n## Subheading",
            expected: "Heading\n\nSubheading\n\n",
        },
        {
            name: "bold and italic",
            input: "This is **bold** and *italic* _underline_",
            expected: "This is bold and italic underline",
        },
        {
            name: "links and images",
            input: "[Click here](https://example.com) ![Alt text](img.jpg)",
            expected: "Click here Alt text",
        },
        {
            name: "list",
            input: "- Item 1\n- Item 2\n  - Nested",
            expected: "- Item 1\n- Item 2\n  - Nested\n",
        },
        // ... more comprehensive cases (code blocks, tables, etc.)
    }
    
    for _, tt := range tests {
        t.Run(tt.name, func(t *testing.T) {
            result := StripMarkdown(tt.input)
            if !strings.EqualFold(strings.TrimSpace(result), strings.TrimSpace(tt.expected)) {
                t.Errorf("got %q, want %q", result, tt.expected)
            }
        })
    }
}
```

### Integration Tests (TypeScript)
- Create diverse real-world markdown samples
- Call `stripMarkdown()` via FFI wrapper
- Verify output matches expected plain text structure
- Check for memory leaks (run multiple iterations)

### Manual Testing
- Test with AI-generated responses and complex GFM content
- Verify performance with large documents (>10KB)
- Test graceful degradation if Go library unavailable

## Potential Risks

### 1. **Dependency Addition**
- **Risk**: Adding an external dependency
- **Mitigation**: goldmark is stable, pure-Go, widely used, and has no transitive deps

### 2. **AST Walker Complexity**
- **Risk**: Initial implementation may miss some node types or spacing nuances
- **Mitigation**: Start with core CommonMark nodes, add GFM progressively; extensive test coverage

### 3. **Performance with Large Documents**
- **Risk**: Parsing + walking could be slower than regex
- **Mitigation**: goldmark is highly optimized; benchmark shows it’s fast enough for typical AI responses

### 4. **Unicode and Special Characters**
- **Risk**: Issues with non-ASCII content
- **Mitigation**: goldmark handles Unicode correctly; include diverse tests

### 5. **Breaking Changes**
- **Risk**: None — this is a new function

## Rollback Plan

1. **If dependency issues**: Remove goldmark from go.mod, revert to regex-based implementation
2. **If parsing bugs**: Comment out advanced node handling, fall back to basic text extraction
3. **If FFI issues**: Remove TypeScript bindings — existing code unaffected
4. **Version rollback**: Reset to `1.0.0` if needed

## Success Criteria

- [ ] Go function compiles without errors
- [ ] Unit tests pass with ≥90% coverage of common/GFM markdown features
- [ ] Correct handling of links, images, code, lists, tables
- [ ] Reasonable paragraph/list spacing preserved
- [ ] FFI binding loads successfully in TypeScript
- [ ] TypeScript wrapper works correctly
- [ ] No memory leaks detected
- [ ] Documentation updated
- [ ] Manual testing with complex real-world markdown successful
