# Root Cause Analysis: Search Functionality Failure

## Issue Summary

The AI agent's search functionality is failing consistently, causing the AI to repeatedly try different search variations without success. The AI responds with "I'm sorry, but I'm currently unable to fetch the latest web search results due to technical issues with the search service (likely rate limiting)."

## Root Cause

The issue is in the **Go library search result parser** (`go-lib-ffi/search/parser.go`). Based on the logs:

1. **DuckDuckGo requests are succeeding** (Status 202, 14K+ bytes of HTML received)
2. **Go library is returning 0 results** for all searches
3. **Error messages indicate parsing failure**: `ParseSearchResults did not return an array`

## Technical Details

### Current Flow
```
Search Query → DuckDuckGo (✓ Success) → Go Library Parser (✗ Failed) → 0 Results
```

### Evidence from Logs
```
[WEB_TOOLS] Search response status: 202
[WEB_TOOLS] Raw search HTML length: 14484
[GO_LIB_FFI] Library loaded successfully
[GO_LIB_FFI] Library version: 1.0.0
[WEB_TOOLS] Using Go library for search result parsing
[WEB_TOOLS] Go library parsed 0 results        ← PROBLEM HERE
[GO_LIB_FFI] ParseSearchResults did not return an array  ← ERROR MESSAGE
```

### The Go Parser Problem

The Go library expects DuckDuckGo HTML with specific structure:
```go
// Looking for: div.result
for _, attr := range node.Attr {
    if attr.Key == "class" && attr.Val == "result" {
        // Parse this result
    }
}

// Looking for: a.result__a (title links)
if attr.Key == "class" && attr.Val == "result__a" {
    // Extract title
}

// Looking for: a.result__snippet (snippets)
if attr.Key == "class" && attr.Val == "result__snippet" {
    // Extract snippet
}
```

**But current DuckDuckGo HTML structure has changed** and no longer uses these exact CSS class names.

## Why This Causes Cascading Failures

1. **AI receives 0 search results**
2. **AI thinks search failed, not parsing failed**
3. **AI tries different search terms** (more specific, simpler, etc.)
4. **All attempts fail the same way**
5. **AI gives up and apologizes for "rate limiting"** (wrong diagnosis)

## Secondary Issues

### 1. Tool Arguments Not Logged
```
[CHAT_AGENT] Tool call detected: agentic_fetch undefined
```
The `undefined` indicates tool arguments aren't being properly passed through the logging system.

### 2. Database Migration Issues
The database setup is fragile - tables need manual creation. However, this is a separate issue from the search failure.

## Immediate Solution

### Fix Go Parser
- Update Go parser to handle current DuckDuckGo HTML structure
- Add fallback parsing for different class names
- Add better error handling and logging

## Recommended Action Plan

1. **Update the Go parser** to match the current DuckDuckGo HTML structure
2. **Add robust parsing logic** similar to Crush's implementation using goquery
3. **Improve error handling** to properly detect and report parsing failures
4. **Add logging** to identify when parsing fails vs. when search genuinely returns no results

## Impact Assessment

- **Severity**: HIGH - Core search functionality completely broken
- **User Experience**: Poor - AI appears to have "rate limiting" issues
- **Business Impact**: HIGH - Search is a primary AI capability

## Files Requiring Updates

1. `/go-lib-ffi/search/parser.go` - Update parsing logic to use goquery like Crush
2. `/src/backend/agent/web-tools.ts` - Improve error detection and logging
3. `/src/backend/agent/agentic-fetch.ts` - Better error handling for parsing failures
4. `/src/backend/agent/go-lib-ffi.ts` - Add better error handling and validation

## Conclusion

The search failure is **not** a rate limiting or network issue. It's a **parsing failure** in the Go library due to DuckDuckGo HTML structure changes. The AI's error handling incorrectly diagnoses this as a service/rate limiting problem, leading to user confusion about the actual issue.