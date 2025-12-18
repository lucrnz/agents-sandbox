# Plan: Fix Go Library Search Parser

## Overview

Fix the Go library's DuckDuckGo search result parser (`go-lib-ffi/search/parser.go`) to correctly handle HTML elements with multiple CSS classes. The parser is currently returning 0 results for all searches despite DuckDuckGo returning valid HTML responses (202 status, 14KB+ content). 

**Root Cause:** Our parser uses exact string matching for CSS class attributes (`attr.Val == "result"`), which fails when DuckDuckGo returns HTML elements with multiple classes like `<div class="result links_main">`. Crush's working implementation uses a `hasClass()` helper that properly splits the class attribute by whitespace and checks if the target class exists in the list.

This plan backports the working parsing logic from Crush's implementation at `/Users/luc/Development/Personal/crush/internal/agent/tools/search.go`.

## Current State

### What's Broken

- **Go library returns 0 results** for all DuckDuckGo searches
- **Frontend receives empty array** and incorrectly reports "rate limiting" error
- **AI agent repeatedly retries** with different search variations, all failing identically
- **User experience**: AI appears broken, claims rate limiting issues that don't exist

### Evidence from Logs

```
[WEB_TOOLS] Search response status: 202
[WEB_TOOLS] Raw search HTML length: 14484
[GO_LIB_FFI] Library loaded successfully
[GO_LIB_FFI] Library version: 1.0.0
[WEB_TOOLS] Using Go library for search result parsing
[WEB_TOOLS] Go library parsed 0 results        ← PROBLEM
[GO_LIB_FFI] ParseSearchResults did not return an array  ← ERROR (actually returns empty array)
```

### Technical Analysis

**Our Implementation Problem:**

File: `go-lib-ffi/search/parser.go`

```go
// Line 46: Exact string match - FAILS for multiple classes
if attr.Key == "class" && attr.Val == "result" {
    // This only matches: <div class="result">
    // This FAILS for: <div class="result links_main">
}

// Line 85: Exact string match for title link
if attr.Key == "class" && attr.Val == "result__a" {
    // Same problem
}

// Line 111: Exact string match for snippet
if attr.Key == "class" && attr.Val == "result__snippet" {
    // Same problem
}
```

**Crush's Working Implementation:**

File: `/Users/luc/Development/Personal/crush/internal/agent/tools/search.go`

```go
// Line 77: Uses hasClass() helper
if n.Type == html.ElementNode && n.Data == "div" && hasClass(n, "result") {
    // Correctly handles multiple classes
}

// Lines 96-104: hasClass() implementation
func hasClass(n *html.Node, class string) bool {
    for _, attr := range n.Attr {
        if attr.Key == "class" {
            // Split by whitespace, check if class is in list
            return slices.Contains(strings.Fields(attr.Val), class)
        }
    }
    return false
}
```

**Key Difference:** `strings.Fields(attr.Val)` splits `"result links_main"` into `["result", "links_main"]`, then `slices.Contains()` checks if `"result"` is present. This correctly handles HTML elements with multiple CSS classes.

### Architecture Context

**Data Flow:**
1. TypeScript (`web-tools.ts`) makes HTTP POST to DuckDuckGo
2. Receives HTML response (14KB+, status 202 is valid)
3. Calls Go library via FFI: `goLib.parseSearchResults(html, maxResults)`
4. Go FFI wrapper (`main.go`) calls `search.ParseSearchResults(goHTML, max)`
5. Parser returns `[]SearchResult` (currently empty due to bug)
6. JSON marshaled and returned to TypeScript
7. TypeScript transforms to camelCase and returns to AI agent

**The bug is at step 4-5:** Parser fails to extract results from valid HTML.

## Proposed Solution

Backport Crush's working `hasClass()` helper function and update all CSS class checking logic to use this helper instead of exact string matching. This will correctly handle DuckDuckGo's HTML structure where elements have multiple CSS classes.

### Changes Required

1. **Add `hasClass()` helper function** - Takes node and class name, returns true if class exists in node's class list
2. **Replace exact matching** - Update all three class checks (result, result__a, result__snippet) to use `hasClass()`
3. **Add tracking URL filter** - Filter out URLs containing "y.js" (analytics/tracking URLs)
4. **Add early termination** - Stop traversal once maxResults reached (performance optimization)
5. **Improve debugging** - Add TypeScript-side logging to distinguish parsing failures from genuine empty results

## Implementation Steps

### Step 1: Add hasClass Helper Function
**File:** `go-lib-ffi/search/parser.go`

- [ ] Add `slices` to imports at top of file
- [ ] Add `hasClass()` function after `cleanDuckDuckGoURL()` (around line 168)
- [ ] Implementation:
  ```go
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
  ```

### Step 2: Update ParseSearchResults Function
**File:** `go-lib-ffi/search/parser.go` (lines 40-63)

- [ ] Refactor the result div detection to use `hasClass()`
- [ ] Current code (lines 43-56):
  ```go
  if node.Type == html.ElementNode && node.Data == "div" {
      // Check if this div has class="result"
      for _, attr := range node.Attr {
          if attr.Key == "class" && attr.Val == "result" {
              // Parse this result
              ...
          }
      }
  }
  ```
- [ ] Replace with:
  ```go
  if node.Type == html.ElementNode && node.Data == "div" && hasClass(node, "result") {
      // Parse this result
      result := parseResultDiv(node)
      if result.Title != "" && result.Link != "" && result.Link != "#" && !strings.Contains(result.Link, "y.js") {
          result.Position = position
          results = append(results, result)
          position++
      }
  }
  ```
- [ ] Note: Removed the `for _, attr` loop since `hasClass()` handles it
- [ ] Added tracking URL filter: `!strings.Contains(result.Link, "y.js")`

### Step 3: Add Early Termination Optimization
**File:** `go-lib-ffi/search/parser.go` (line 60-62)

- [ ] Update the traversal loop to check maxResults
- [ ] Current code:
  ```go
  for child := node.FirstChild; child != nil; child = child.NextSibling {
      findResultDivs(child)
  }
  ```
- [ ] Replace with:
  ```go
  for child := node.FirstChild; child != nil && len(results) < maxResults; child = child.NextSibling {
      findResultDivs(child)
  }
  ```
- [ ] Add early return in the div check (after line 52):
  ```go
  if len(results) >= maxResults {
      return
  }
  ```

### Step 4: Update parseResultDiv for Title Links
**File:** `go-lib-ffi/search/parser.go` (lines 80-103)

- [ ] Refactor `findTitleLink` closure to use `hasClass()`
- [ ] Current code (lines 82-97):
  ```go
  if node.Type == html.ElementNode && node.Data == "a" {
      // Check if this link has class="result__a"
      for _, attr := range node.Attr {
          if attr.Key == "class" && attr.Val == "result__a" {
              // Extract title
              result.Title = extractTextContent(node)
              // Extract and clean URL
              for _, a := range node.Attr {
                  if a.Key == "href" {
                      result.Link = cleanDuckDuckGoURL(a.Val)
                      break
                  }
              }
              return
          }
      }
  }
  ```
- [ ] Replace with:
  ```go
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
  ```

### Step 5: Update parseResultDiv for Snippets
**File:** `go-lib-ffi/search/parser.go` (lines 106-121)

- [ ] Refactor `findSnippetLink` closure to use `hasClass()`
- [ ] Current code (lines 108-115):
  ```go
  if node.Type == html.ElementNode && node.Data == "a" {
      // Check if this link has class="result__snippet"
      for _, attr := range node.Attr {
          if attr.Key == "class" && attr.Val == "result__snippet" {
              result.Snippet = extractTextContent(node)
              return
          }
      }
  }
  ```
- [ ] Replace with:
  ```go
  if node.Type == html.ElementNode && node.Data == "a" && hasClass(node, "result__snippet") {
      result.Snippet = extractTextContent(node)
      return
  }
  ```

### Step 6: Enhance TypeScript Logging
**File:** `src/backend/agent/web-tools.ts` (around line 142-159)

- [ ] Add debug logging when results are empty but HTML is not
- [ ] After line 153 (`const results = goLib.parseSearchResults(html, maxResults);`):
  ```typescript
  console.log("[WEB_TOOLS] Go library parsed", results.length, "results");
  
  // Debug: Log when parsing might have failed
  if (results.length === 0 && html.length > 1000) {
      console.warn("[WEB_TOOLS] Parsing returned 0 results despite large HTML response");
      console.warn("[WEB_TOOLS] First 500 chars of HTML:", html.substring(0, 500));
      console.warn("[WEB_TOOLS] This likely indicates a parsing issue, not rate limiting");
  }
  
  return results;
  ```

### Step 7: Rebuild Go Library
**Location:** `go-lib-ffi/`

- [ ] Clean previous build: `cd go-lib-ffi && make clean`
- [ ] Build library: `make build`
- [ ] Verify binary created in correct location
- [ ] Check binary file size (should be ~2-5MB)
- [ ] Verify for current platform:
  - macOS ARM64: `libgo-lib-ffi.dylib`
  - macOS x86: `libgo-lib-ffi.dylib`
  - Linux: `libgo-lib-ffi.so`
  - Windows: `libgo-lib-ffi.dll`

### Step 8: Integration Testing
**Location:** Dev server

- [ ] Start dev server: `bun --hot src/backend/index.ts`
- [ ] Open chat interface in browser
- [ ] Test search query: "TypeScript programming tutorial"
- [ ] Verify in logs:
  - `[WEB_TOOLS] Search response status: 202` or `200`
  - `[WEB_TOOLS] Raw search HTML length: ####` (should be >1000)
  - `[WEB_TOOLS] Go library parsed N results` where N > 0
  - `[CHAT_AGENT]` AI processes results and responds
- [ ] Test another query: "Go language best practices"
- [ ] Verify results appear and AI can use them

### Step 9: Edge Case Testing

- [ ] **Test with short query:** `"test"`
  - Verify results returned or proper "no results" message
  
- [ ] **Test with special characters:** `"C++ programming"`
  - Verify URL encoding handled correctly
  
- [ ] **Test with long query:** `"how to implement a recursive descent parser for a programming language"`
  - Verify maxResults limit works (default 10)
  
- [ ] **Test with query that returns few results:** `"xyzabc123notarealquery"`
  - Verify graceful handling of genuinely empty results
  
- [ ] **Verify tracking URLs filtered:** Check logs for any URLs containing "y.js"
  - Should not appear in final results

### Step 10: Verify Error Messages Fixed

- [ ] Confirm no more false "rate limiting" errors
- [ ] Verify AI can complete search-based queries
- [ ] Check that empty results are properly distinguished from parsing failures
- [ ] Confirm logs are helpful for debugging future issues

## Files to Modify

### Primary Changes (Go Library)

1. **`go-lib-ffi/search/parser.go`**
   - Add `slices` import
   - Add `hasClass()` helper function (new)
   - Update `ParseSearchResults()` - refactor div.result detection
   - Update `ParseSearchResults()` - add early termination
   - Update `parseResultDiv()` - refactor findTitleLink to use hasClass
   - Update `parseResultDiv()` - refactor findSnippetLink to use hasClass
   - Lines affected: 3-8 (imports), 40-63 (ParseSearchResults), 80-121 (parseResultDiv), 168+ (new hasClass)

### Secondary Changes (TypeScript Logging)

2. **`src/backend/agent/web-tools.ts`**
   - Add debug logging for empty results with large HTML
   - Distinguish parsing failures from genuine empty results
   - Lines affected: 142-159 (parseSearchResults function)

### Files NOT Modified (Reference Only)

3. **`/Users/luc/Development/Personal/crush/internal/agent/tools/search.go`**
   - Reference implementation (DO NOT modify)
   - Used as source for backporting logic

## Testing Strategy

### Unit Testing (Manual Verification)

Since we don't have automated tests, we'll use manual verification:

1. **Create test HTML file** (optional, for debugging):
   - Save actual DuckDuckGo response to `go-lib-ffi/testdata/ddg_sample.html`
   - Create simple Go test program to parse it directly
   - Verify parser extracts results correctly

2. **Compare with Crush** (if debugging needed):
   - Use same HTML with both parsers
   - Verify same number of results extracted
   - Compare title, link, snippet values

### Integration Testing (Primary Verification)

1. **Positive Test Cases:**
   - Common queries: "Go programming", "TypeScript tutorial", "React hooks"
   - Technical queries: "implement binary search tree", "REST API design"
   - Questions: "What is machine learning?", "How does DNS work?"
   - Verify: Results > 0, proper titles/links/snippets, AI can use results

2. **Edge Cases:**
   - Very short query: "a", "go", "c"
   - Special characters: "C++", "F#", "node.js"
   - Unicode: "日本語", "Русский", "العربية"
   - Long query: 100+ characters
   - Verify: Graceful handling, no crashes, helpful error messages

3. **Error Cases:**
   - Query with no results: "xyznotarealquery12345"
   - Empty query: "" (should be handled by caller, but verify)
   - Very large maxResults: 1000 (should cap appropriately)
   - Verify: Proper "no results" message, no parsing errors

### Performance Testing

1. **Measure parsing time:**
   - Log timestamp before/after `parseSearchResults()` call
   - Verify parsing completes in <100ms for typical queries
   - Check early termination prevents processing entire HTML

2. **Memory usage:**
   - Monitor dev server memory during searches
   - Verify no memory leaks from repeated searches
   - Check Go library memory is freed properly

## Potential Risks

### Risk 1: Breaking Existing Functionality
**Probability:** Low  
**Impact:** Medium  
**Description:** Refactoring class detection logic might break edge cases that currently work

**Mitigation:**
- Test with variety of queries before and after changes
- Compare results with Crush's parser on same HTML
- Keep old implementation in git history for easy rollback

**Rollback Plan:**
```bash
cd go-lib-ffi
git checkout HEAD -- search/parser.go
make build
```

### Risk 2: DuckDuckGo HTML Structure Has Changed Further
**Probability:** Medium  
**Impact:** High  
**Description:** DuckDuckGo might have changed HTML beyond multiple classes

**Mitigation:**
- Test with current live DuckDuckGo HTML immediately after implementation
- Save sample HTML responses for future comparison
- Add debug logging to output HTML when parsing returns 0 results

**Fallback:**
- If structure changed significantly, may need to update selectors
- Could add more flexible matching (partial class names, data attributes, etc.)

### Risk 3: Go Build Issues
**Probability:** Very Low  
**Impact:** Medium  
**Description:** Adding `slices` package might cause build issues

**Analysis:**
- `slices` package added in Go 1.21
- We have Go 1.25.5 ✓
- No version conflict expected

**Mitigation:**
- Verify build completes successfully
- Check for any deprecation warnings
- Test on target platforms (macOS, Linux if deployed)

### Risk 4: Performance Regression
**Probability:** Very Low  
**Impact:** Low  
**Description:** Multiple `hasClass()` calls might be slower than direct attribute loops

**Analysis:**
- `hasClass()` loops through attributes once per call
- Old code also looped through attributes
- String splitting is fast for short strings (typically 1-3 classes)
- Early termination optimization should compensate

**Mitigation:**
- Profile if performance issues arise
- Parsing only happens once per search (~10 results)
- Total overhead likely <10ms, acceptable for user-facing search

### Risk 5: FFI Boundary Issues
**Probability:** Very Low  
**Impact:** Medium  
**Description:** Changes might affect JSON serialization or FFI communication

**Analysis:**
- We're not changing `SearchResult` struct
- JSON marshaling remains identical
- FFI interface (`main.go`) unchanged
- Only internal parsing logic changes

**Mitigation:**
- Test FFI communication with logging
- Verify JSON structure matches expected format
- Check error handling path returns valid JSON

## Dependencies

### Go Packages Required

**Already in go.mod:**
- `golang.org/x/net/html` v0.48.0 ✓
- `strings` (standard library) ✓
- `net/url` (standard library) ✓

**To be added:**
- `slices` (standard library, Go 1.21+) ✓

**No `go get` needed** - `slices` is in standard library

### Build Requirements

- Go 1.21+ (we have 1.25.5 ✓)
- Make (for build automation) ✓
- C compiler (for CGO, used by FFI) ✓

### Runtime Requirements

- Bun (TypeScript runtime) ✓
- Go shared library loaded via FFI ✓

## Success Criteria

All of the following must be true for plan completion:

- [ ] Search queries return > 0 results for common queries (90%+ success rate)
- [ ] No false "rate limiting" errors in chat interface
- [ ] Parser correctly handles HTML elements with multiple CSS classes
- [ ] Results include valid title, link, and snippet for each search result
- [ ] Tracking URLs (containing "y.js") are filtered out
- [ ] Empty results properly distinguished from parsing failures in logs
- [ ] AI agent can successfully use search results to answer questions
- [ ] No crashes, panics, or FFI errors during normal operation
- [ ] Performance: Parsing completes in <100ms for typical queries
- [ ] Integration tests pass for 5+ different query types

## Rollback Plan

If changes cause critical issues:

### Immediate Rollback (< 5 minutes)

1. **Revert parser changes:**
   ```bash
   cd go-lib-ffi
   git checkout HEAD -- search/parser.go
   make clean
   make build
   ```

2. **Revert TypeScript changes:**
   ```bash
   git checkout HEAD -- src/backend/agent/web-tools.ts
   ```

3. **Restart dev server:**
   ```bash
   # Kill existing server (Ctrl+C)
   bun --hot src/backend/index.ts
   ```

4. **Verify rollback:**
   - Check that old binary is loaded
   - Verify previous behavior restored (even if broken)
   - Confirm no new errors introduced

### Alternative Approach (If Rollback Needed)

If `hasClass()` doesn't fix the issue completely:

1. **Debug with HTML dump:**
   - Save actual DuckDuckGo HTML response to file
   - Inspect HTML structure manually
   - Check what classes are actually present
   - Verify element hierarchy matches expectations

2. **Incremental fixes:**
   - Try more flexible matching (contains instead of equals)
   - Add data-attribute fallbacks
   - Look for alternative selectors (IDs, other classes)

3. **Consider alternative parsers:**
   - If HTML structure changed dramatically, might need different approach
   - Could use `github.com/PuerkitoBio/goquery` for more flexible querying
   - Would be larger change but more robust long-term

## Reference Implementation

**Source:** Crush's working DuckDuckGo parser (production-tested)  
**Location:** `/Users/luc/Development/Personal/crush/internal/agent/tools/search.go`  
**Version:** Current as of December 2025

### Key Functions to Reference

1. **`searchDuckDuckGo()`** (lines 24-64)
   - HTTP request setup
   - Headers and form data
   - Response handling (200 and 202 accepted)

2. **`parseSearchResults()`** (lines 66-94)
   - Main parsing logic with tree traversal
   - Uses `hasClass()` for flexible class matching
   - Early termination optimization
   - Tracking URL filtering

3. **`hasClass()`** (lines 96-104)
   - Core helper for multi-class handling
   - Uses `strings.Fields()` to split classes
   - Uses `slices.Contains()` to check membership

4. **`extractResult()`** (lines 106-135)
   - Extracts title, link, snippet from result div
   - Single traversal for efficiency
   - Uses `hasClass()` for both title and snippet

5. **`getTextContent()`** (lines 137-153)
   - Recursive text extraction
   - Handles nested elements
   - Returns trimmed string

6. **`cleanDuckDuckGoURL()`** (lines 155-171)
   - Extracts actual URL from DuckDuckGo redirect
   - Handles `//duckduckgo.com/l/?uddg=` format
   - URL unescapes the parameter

### Implementation Notes

- **Both implementations use `golang.org/x/net/html`** (not goquery) - We don't need to add new dependencies
- **Crush's implementation is battle-tested** in production CLI tool
- **Key difference is just the `hasClass()` helper** - Rest of logic is similar
- **This is a surgical fix** - We're not changing the overall architecture, just class detection

## Additional Notes

### Why This Fix Works

DuckDuckGo's HTML has evolved to use multiple CSS classes on result elements:

**Old HTML (hypothetical):**
```html
<div class="result">
    <a class="result__a" href="...">Title</a>
    <a class="result__snippet" href="...">Snippet text</a>
</div>
```

**Current HTML (actual):**
```html
<div class="result links_main links_deep">
    <a class="result__a result__a--custom" href="...">Title</a>
    <a class="result__snippet" href="...">Snippet text</a>
</div>
```

Our exact match `attr.Val == "result"` fails for `"result links_main links_deep"`.  
Crush's `slices.Contains(strings.Fields(attr.Val), "result")` succeeds because:
- `strings.Fields("result links_main links_deep")` → `["result", "links_main", "links_deep"]`
- `slices.Contains(["result", "links_main", "links_deep"], "result")` → `true`

This is a standard web scraping problem when targeting CSS classes.

### Why Previous Diagnosis Was Incorrect

The root cause analysis document stated: "current DuckDuckGo HTML structure has changed and no longer uses these exact CSS class names."

**This was incorrect.** The class names (`result`, `result__a`, `result__snippet`) are still present, but:
- Elements now have **multiple classes** instead of single classes
- Our parser used **exact string matching** which failed
- The fix is to use **substring/split matching** to handle multiple classes

This is why Crush's implementation still works - it was designed to handle multiple classes from the start.

### Future Proofing

To make the parser more resilient:

1. **Multiple selector fallbacks:** Try different class patterns if primary fails
2. **Structural matching:** Use element hierarchy as backup (div > a patterns)
3. **Data attributes:** Check for data-* attributes if classes fail
4. **Periodic testing:** Set up automated tests with live DuckDuckGo HTML

For this plan, we're implementing #1 via flexible class matching. Future improvements could add #2-4.

## Timeline Estimate

**Total Time:** 1-2 hours

- Step 1-5 (Go changes): 30 minutes
- Step 6 (TypeScript logging): 10 minutes
- Step 7 (Rebuild): 5 minutes
- Step 8-9 (Testing): 30-45 minutes
- Step 10 (Verification): 15 minutes

**Blocking Issues:** None expected (all dependencies available)

## Related Documentation

- **Root Cause Analysis:** `.llm/docs/SEARCH_PARSING_ROOT_CAUSE_ANALYSIS.md`
- **Crush Implementation Deep Dive:** `.llm/docs/GO_AGENTIC_FETCH_TECHNICAL_DEEP_DIVE.md`
- **Project Documentation:** `AGENTS.md` and `CLAUDE.md` (symlink)
- **Go Library README:** `go-lib-ffi/README.md`
