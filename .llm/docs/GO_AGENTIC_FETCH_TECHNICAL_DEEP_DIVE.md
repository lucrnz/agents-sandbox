# Agentic Fetch in Crush: Technical Deep Dive

## Overview

Crush's Agentic Fetch is a sophisticated web content retrieval and analysis system that combines web searching, content fetching, and AI-powered analysis. This feature allows users to either search the web or fetch specific URLs, then have an AI agent analyze the content to extract relevant information or answer questions.

## Architecture

The Agentic Fetch feature is composed of several key components that work together to provide a seamless web content analysis experience:

### Core Components

1. **Agentic Fetch Tool** (`internal/agent/agentic_fetch_tool.go`)
   - Entry point for the agentic fetch functionality
   - Handles both URL fetching and web search modes
   - Spawns a sub-agent with specialized tools for content analysis

2. **Web Fetch Tool** (`internal/agent/tools/web_fetch.go`)
   - Handles fetching content from specific URLs
   - Converts HTML to markdown for better AI processing
   - Saves large content to temporary files

3. **Web Search Tool** (`internal/agent/tools/web_search.go`)
   - Performs web searches using DuckDuckGo
   - Returns formatted search results with titles, URLs, and snippets
   - Limits results to 20 items maximum

4. **Fetch Helpers** (`internal/agent/tools/fetch_helpers.go`)
   - Contains core utilities for URL fetching and content conversion
   - Handles HTML cleaning and markdown conversion
   - Processes JSON content for better readability

5. **Search Implementation** (`internal/agent/tools/search.go`)
   - Implements DuckDuckGo search functionality
   - Parses HTML search results
   - Handles URL redirects and result formatting

## Workflow

### URL Mode
When a user provides a specific URL:

1. The agentic fetch tool validates the URL and parameters
2. It creates an HTTP client with optimized connection pooling
3. Fetches the URL content using `FetchURLAndConvert`
4. Converts HTML to markdown or formats JSON appropriately
5. For large content (>50KB), saves to a temporary file
6. Creates a sub-agent with specialized tools
7. Returns the AI analysis of the content

### Search Mode
When a user wants to search the web:

1. The agentic fetch tool creates a sub-agent with search capabilities
2. The sub-agent uses the web_search tool to find relevant information
3. The sub-agent can perform multiple searches with refined queries
4. For promising results, it uses web_fetch to get full content
5. The sub-agent analyzes all gathered information
6. Returns a comprehensive answer with source citations

## Technical Implementation

### HTTP Client Configuration

The system uses a highly optimized HTTP client with the following configuration:

```go
client = &http.Client{
    Timeout: 30 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}
```

This configuration provides:
- Connection pooling for better performance
- Reasonable timeouts to prevent hanging
- Optimized for multiple concurrent requests

### Browser Headers

To improve compatibility and avoid bot detection, the system uses realistic browser headers:

```go
req.Header.Set("User-Agent", BrowserUserAgent)
req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
req.Header.Set("Accept-Language", "en-US,en;q=0.5")
```

The BrowserUserAgent is set to:
```
Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36
```

### Content Processing Pipeline

#### HTML Processing
1. **Noise Removal**: Eliminates script, style, nav, header, footer, and other noisy elements
2. **Conversion**: Uses html-to-markdown converter for AI-friendly format
3. **Cleanup**: Removes excessive whitespace and blank lines

#### JSON Processing
1. **Validation**: Ensures content is valid JSON
2. **Formatting**: Pretty-prints with proper indentation
3. **Fallback**: Keeps original content if formatting fails

### DuckDuckGo Search Implementation

The search functionality uses DuckDuckGo's HTML endpoint:

1. Makes POST request to `https://html.duckduckgo.com/html`
2. Parses HTML response to extract search results
3. Handles redirect URLs to extract actual destination
4. Formats results for easy consumption by the AI agent

### Sub-Agent Creation

The system creates a specialized sub-agent with these tools:
- `web_fetch`: For fetching specific URLs
- `web_search`: For performing searches
- `glob`: For file pattern matching in temp directories
- `grep`: For searching within content files
- `sourcegraph`: For code search across repositories
- `view`: For reading file contents

## Go Libraries and Versions

The Agentic Fetch feature relies on several key Go libraries:

### Core Dependencies

1. **HTML Processing**
   - `golang.org/x/net/html v0.48.0`: Standard library HTML parser
   - `github.com/PuerkitoBio/goquery v1.11.0`: jQuery-like HTML manipulation

2. **Markdown Conversion**
   - `github.com/JohannesKaufmann/html-to-markdown v1.6.0`: HTML to markdown converter

3. **HTTP Client**
   - Standard library `net/http`: Core HTTP functionality
   - `golang.org/x/net v0.48.0`: Extended networking capabilities

### Supporting Libraries

4. **Configuration & Types**
   - `charm.land/fantasy v0.5.3`: Agent tool framework
   - `github.com/invopop/jsonschema v0.13.0`: JSON schema generation

5. **Utilities**
   - `golang.org/x/sync v0.19.0`: Concurrency utilities
   - `github.com/google/uuid v1.6.0`: UUID generation
   - `golang.org/x/text v0.32.0`: Text processing

### Version Information

The project requires Go 1.25.5 and uses semantic versioning for dependencies.

## Security Considerations

### Content Limitations
- Maximum download size: 5MB per page
- Timeout limits to prevent hanging: 30 seconds default
- Large content saved to temporary files in secure directory

### Bot Detection Mitigation
- Realistic browser User-Agent strings
- Proper HTTP headers to mimic browser behavior
- Rate limiting awareness in search implementation

### Permission System
- All fetch operations require explicit permission
- Temporary files created in secure directory
- Auto-cleanup of temporary resources

## Error Handling

The system implements comprehensive error handling:

1. **Network Errors**: Graceful handling of timeouts, connection failures
2. **Parse Errors**: Fallback to original content if parsing fails
3. **Rate Limiting**: Informative messages when DuckDuckGo limits requests
4. **Invalid URLs**: Validation before making requests
5. **Content Validation**: UTF-8 validation and size limits

## Performance Optimizations

1. **Connection Pooling**: Reuses HTTP connections for multiple requests
2. **Content Limits**: Prevents memory exhaustion with size limits
3. **Parallel Processing**: Sub-agent can fetch multiple pages concurrently
4. **Smart Caching**: Temporary directory for large content avoids re-fetching

## Usage Examples

### Basic Search
```
User: "What are the main new features in the latest Python release?"
System: Performs web search, fetches relevant pages, analyzes content, returns summary with sources
```

### Specific URL Analysis
```
User: URL="https://docs.python.org/3/whatsnew/3.12.html", Prompt="Summarize key changes"
System: Fetches the URL, converts to markdown, analyzes with AI, returns structured summary
```

## Conclusion

Crush's Agentic Fetch is a sophisticated system that combines web crawling, search capabilities, and AI analysis. It's designed to be robust, efficient, and user-friendly while maintaining security and performance standards.

The architecture leverages modern Go libraries and best practices to provide a seamless web content analysis experience that can handle both specific URL analysis and open-ended web research tasks.