# Plan: Implement go-lib-ffi to Replace happy-dom and HTML-to-Markdown

## Overview

Create a centralized Go FFI library (`go-lib-ffi`) to replace the current TypeScript-based happy-dom HTML parsing and HTML-to-markdown conversion functionality. This will significantly improve performance for the Agentic Fetch feature while maintaining API compatibility with existing TypeScript code.

**Context:** The current implementation uses happy-dom (TS) for DOM parsing and a JavaScript library for HTML-to-markdown conversion. Based on the technical analysis, a Go-based solution via FFI can provide 2-5x performance improvement and better memory efficiency.

## Current State

### HTML Processing Pipeline
- **Location:** `src/backend/agent/web-tools.ts`
- **happy-dom usage:** DOM parsing for content cleaning and search result extraction
- **HTML-to-Markdown:** JavaScript library (likely Turndown or similar)
- **Performance:** ~50-100ms for 1MB HTML pages, high memory usage
- **Issues:** Memory-intensive DOM trees, slower processing for large documents

### Current Workflow
```
1. Fetch HTML content (Bun fetch)
2. Parse with happy-dom (create Window, document.body.innerHTML)
3. Clean HTML by removing noisy elements (script, style, nav, etc.)
4. Convert to markdown (JavaScript library)
5. Return formatted markdown
```

## Proposed Solution

Create `go-lib-ffi`, a centralized Go shared library that provides:

1. **HTML Cleaning:** Remove noisy elements (script, style, nav, header, footer, etc.)
2. **HTML-to-Markdown Conversion:** Fast, reliable conversion with Go libraries
3. **Search Result Parsing:** Extract structured data from DuckDuckGo HTML results
4. **Unified FFI Interface:** Single library for all Go-based processing

**Architecture:**
- Go library compiled to shared library (.so/.dylib/.dll)
- Bun FFI bindings in TypeScript
- Graceful fallback to current JS implementation if library unavailable
- Build integration with existing build system

## Implementation Steps

### Phase 1: Setup Go Project Structure
- [ ] Create `go-lib-ffi/` directory at project root
- [ ] Initialize Go module: `go mod init go-lib-ffi`
- [ ] Create directory structure:
  ```
  go-lib-ffi/
  ├── go.mod
  ├── go.sum
  ├── Makefile
  ├── build.go
  ├── main.go
  ├── html/
  │   ├── cleaner.go
  │   └── converter.go
  ├── search/
  │   └── parser.go
  └── ffi/
      └── exports.go
  ```

### Phase 2: Implement Core Go Libraries

- [ ] **Install Go dependencies:**
  ```bash
  go get github.com/JohannesKaufmann/html-to-markdown/v2
  go get golang.org/x/net/html
  ```

- [ ] **Create HTML cleaner (`go-lib-ffi/html/cleaner.go`):**
  - Remove script, style, nav, header, footer, aside, noscript, iframe, svg elements
  - Extract cleaned HTML as string
  - Handle malformed HTML gracefully

- [ ] **Create HTML-to-markdown converter (`go-lib-ffi/html/converter.go`):**
  - Use `html-to-markdown/v2` library
  - Configure with base, commonmark, table, and strikethrough plugins
  - Support domain-based URL resolution

- [ ] **Create search result parser (`go-lib-ffi/search/parser.go`):**
  - Parse DuckDuckGo HTML results
  - Extract title, URL, snippet for each result
  - Handle up to 20 results maximum
  - Clean DuckDuckGo redirect URLs

### Phase 3: Create FFI Exports

- [ ] **Create FFI exports (`go-lib-ffi/ffi/exports.go`):**
  ```go
  // Export functions:
  // - CleanHTML(html *C.char) *C.char
  // - ConvertHTMLToMarkdown(html *C.char) *C.char
  // - ParseSearchResults(html *C.char) *C.char
  // - FreeString(str *C.char)
  // - GetLibraryVersion() *C.char
  ```

- [ ] **Ensure proper memory management:**
  - Caller-owned memory pattern for returned strings
  - Provide FreeString function
  - Document memory ownership in code comments

### Phase 4: Build System Integration

- [ ] **Create Makefile (`go-lib-ffi/Makefile`):**
  - Targets: build-linux, build-macos, build-windows, build-all
  - Clean target for artifact removal
  - Install target for copying libraries to TypeScript directory

- [ ] **Create build script (`go-lib-ffi/build.go`):**
  - Auto-detect platform
  - Build appropriate shared library
  - Generate C header file

- [ ] **Integrate with main build (`build.ts`):**
  ```typescript
  // Add to build.ts
  async function buildGoLib() {
    const goDir = path.join(process.cwd(), "go-lib-ffi");
    await $`cd ${goDir} && make all`;
  }
  ```

### Phase 5: Create TypeScript FFI Bindings

- [ ] **Create FFI TypeScript bindings (`src/backend/agent/go-lib-ffi.ts`):**
  ```typescript
  import { dlopen, FFIType, suffix } from "bun:ffi"
  
  interface GoLibFFI {
    symbols: {
      CleanHTML: (html: Pointer) => Pointer
      ConvertHTMLToMarkdown: (html: Pointer) => Pointer
      ParseSearchResults: (html: Pointer) => Pointer
      FreeString: (str: Pointer) => void
      GetLibraryVersion: () => Pointer
    }
  }
  ```

- [ ] **Create high-level wrapper class:**
  ```typescript
  export class GoLibFFIWrapper {
    private lib: GoLibFFI
    
    cleanHTML(html: string): string
    convertToMarkdown(html: string): string
    parseSearchResults(html: string): SearchResult[]
    getVersion(): string
    static isAvailable(): boolean
  }
  ```

### Phase 6: Integrate with Existing Code

- [ ] **Update web-tools.ts:**
  - Import GoLibFFIWrapper
  - Replace happy-dom usage with Go library calls
  - Maintain fallback to current implementation if library unavailable
  - Update `removeNoisyElements()` to use `CleanHTML`
  - Update `parseSearchResults()` to use `ParseSearchResults`

- [ ] **Update HTML-to-markdown conversion:**
  - Replace JavaScript converter with Go library call
  - Ensure equivalent formatting options
  - Handle edge cases (empty HTML, malformed HTML)

- [ ] **Add feature detection:**
  ```typescript
  const useGoLib = GoLibFFIWrapper.isAvailable()
  if (useGoLib) {
    // Use Go library
  } else {
    // Fallback to current implementation
    console.warn("go-lib-ffi unavailable, using fallback")
  }
  ```

### Phase 7: Testing and Validation

- [ ] **Unit tests for Go library:**
  - Test HTML cleaning with various inputs
  - Test markdown conversion with complex HTML
  - Test search result parsing with DuckDuckGo format
  - Memory leak tests for FFI calls

- [ ] **Integration tests for TypeScript bindings:**
  - Test FFI loading and symbol resolution
  - Test wrapper class methods
  - Test fallback behavior when library unavailable

- [ ] **Performance benchmarks:**
  - Compare Go vs current implementation
  - Measure memory usage for large HTML documents
  - Test concurrent processing performance

- [ ] **Regression tests:**
  - Ensure output matches current implementation
  - Test with real-world HTML from various sources
  - Verify search results parsing accuracy

### Phase 8: Documentation and Deployment

- [ ] **Create README for go-lib-ffi:**
  - Build instructions for each platform
  - API documentation for exported functions
  - Memory management guidelines
  - Troubleshooting section

- [ ] **Update AGENTS.md:**
  - Document new Go library dependency
  - Update build instructions
  - Note performance improvements

- [ ] **Create CI/CD integration:**
  - Build libraries for all target platforms
  - Run tests on each platform
  - Package libraries with application

## Files to Modify

### New Files
- `go-lib-ffi/go.mod` - Go module definition
- `go-lib-ffi/Makefile` - Build configuration
- `go-lib-ffi/html/cleaner.go` - HTML cleaning logic
- `go-lib-ffi/html/converter.go` - HTML-to-markdown conversion
- `go-lib-ffi/search/parser.go` - Search result parsing
- `go-lib-ffi/ffi/exports.go` - FFI export functions
- `src/backend/agent/go-lib-ffi.ts` - TypeScript FFI bindings
- `.llm/docs/GO_LIB_FFI_IMPLEMENTATION.md` - Technical documentation

### Modified Files
- `src/backend/agent/web-tools.ts` - Integrate Go library, add fallbacks
- `build.ts` - Add Go library build step
- `package.json` - Add build:go script
- `AGENTS.md` - Update documentation

## Testing Strategy

### Automated Tests
1. **Go unit tests:** Test each package (html, search, ffi) independently
2. **TypeScript integration tests:** Test FFI loading and wrapper methods
3. **End-to-end tests:** Test complete workflow from URL to markdown output
4. **Performance benchmarks:** Compare against baseline

### Manual Testing Checklist
- [ ] Clean HTML from various websites (news, blogs, docs)
- [ ] Convert complex HTML with tables, code blocks, nested elements
- [ ] Parse DuckDuckGo search results for different queries
- [ ] Verify fallback works when library is missing
- [ ] Test concurrent requests performance
- [ ] Memory profiling with large documents (1MB+)

### Test Data Sources
- Real-world HTML from popular websites
- Edge cases: malformed HTML, empty content, very large documents
- DuckDuckGo search results for various queries
- Complex markdown scenarios (nested lists, code blocks, tables)

## Potential Risks

### Technical Risks
1. **FFI Stability:** Bun FFI is experimental and may have bugs
   - **Mitigation:** Maintain fallback to current implementation
   
2. **Memory Leaks:** Improper memory management in FFI calls
   - **Mitigation:** Strict memory ownership documentation, automated leak detection
   
3. **Platform Compatibility:** Libraries must work across Linux, macOS, Windows
   - **Mitigation:** CI/CD builds for all platforms, thorough testing

### Performance Risks
1. **No Performance Gain:** Go library may not be significantly faster
   - **Mitigation:** Benchmark early, have rollback plan
   
2. **Increased Binary Size:** Adding Go libraries increases deployment size
   - **Mitigation:** Optimize builds, consider feature flags

### Integration Risks
1. **API Incompatibility:** Output format differences between implementations
   - **Mitigation:** Extensive regression testing, output normalization
   
2. **Build Complexity:** Additional build step may complicate development
   - **Mitigation:** Automated builds, clear documentation, Docker support

## Rollback Plan

If implementation fails or causes issues:

1. **Immediate:** Switch feature flag to use current implementation only
2. **Short-term:** Remove Go library integration from web-tools.ts
3. **Medium-term:** Keep go-lib-ffi directory but disable build integration
4. **Long-term:** Delete go-lib-ffi directory if no longer needed

**Migration path:**
1. Implement Go library with fallback mechanism
2. Test thoroughly in development
3. Deploy with fallback enabled
4. Monitor performance and stability
5. Gradually enable for production
6. Remove fallback code after confidence established

## Success Criteria

- [ ] Go library builds successfully on Linux, macOS, Windows
- [ ] FFI bindings load without errors
- [ ] HTML cleaning produces equivalent output to current implementation
- [ ] Markdown conversion matches current formatting
- [ ] Search result parsing extracts same data as current implementation
- [ ] Performance improvement: 2-5x faster processing for large documents
- [ ] Memory usage: 50-70% reduction for large HTML parsing
- [ ] Graceful fallback when library unavailable
- [ ] All existing tests pass
- [ ] New integration tests added and passing

## Reference Documents

These documents contain essential technical details and examples that informed this plan:

### BUN_FFI_IMPLEMENTATION.md
**Description:** Comprehensive guide to Bun's Foreign Function Interface including API reference, implementation examples, and best practices for calling native libraries from TypeScript.

**Why Read:** Essential for understanding how to write TypeScript FFI bindings, memory management patterns, and platform-specific compilation details. Contains working examples of dlopen, FFIType, and CString patterns.

### GO_AGENTIC_FETCH_TECHNICAL_DEEP_DIVE.md
**Description:** Technical documentation of the current Go-based Agentic Fetch implementation, including HTTP client configuration, content processing pipeline, DuckDuckGo search implementation, and library versions.

**Why Read:** Provides context on the existing Agentic Fetch architecture, current performance characteristics, and the specific HTML processing requirements that the Go library must replicate.

### GOLANG_HTML_TO_MARKDOWN_TUTORIAL.md
**Description:** Step-by-step tutorial for creating a Go HTML-to-markdown converter with FFI bindings, including project structure, build configuration, TypeScript integration, and testing strategies.

**Why Read:** Contains complete, working code examples for Go FFI implementation, Makefile configurations, and TypeScript wrapper patterns that can be adapted for go-lib-ffi. Includes performance benchmarks and troubleshooting guidance.

### HAPPY_DOM_ANALYSIS.md
**Description:** Detailed analysis of how happy-dom is currently used in the codebase, including specific DOM operations, CSS selectors, integration points, and performance characteristics.

**Why Read:** Critical for understanding exactly what functionality needs to be replicated in the Go library. Documents the specific HTML elements being removed, the DOM APIs in use, and current performance baseline.
