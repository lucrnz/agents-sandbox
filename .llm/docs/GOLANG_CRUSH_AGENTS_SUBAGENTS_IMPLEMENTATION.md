# Crush Agents & Sub-Agents Implementation

## What is Crush?

Crush is a powerful terminal-based AI coding assistant that integrates various Large Language Models (LLMs) with your development workflow. It's your "coding bestie" that brings together:

- **Multi-model support**: Switch between different LLMs (Claude, GPT-4, Gemini, etc.) while preserving context
- **Session management**: Maintain multiple work sessions per project
- **Tool ecosystem**: Provides agents with powerful tools for code analysis, file operations, web search, and more
- **LSP integration**: Uses Language Server Protocol for deep code understanding
- **Extensibility**: Supports Model Context Protocol (MCP) servers for custom capabilities

Crush enables AI agents to understand your codebase, make intelligent edits, run tests, search documentation, and autonomously complete complex multi-step tasks. At its core, Crush implements a sophisticated agent hierarchy system that allows for specialized sub-agents to handle specific tasks like web research and content analysis.

---

## 1. Agent Architecture & Hierarchy

### Main Agent Construction

Crush uses a **coordinator-based architecture** with a hierarchical agent system:

```
Coordinator
    └── Main Session Agent (Coder Agent)
        ├── Tools (bash, edit, view, grep, etc.)
        ├── Sub-Agent Tool (for general tasks)
        └── Agentic Fetch Tool (spawns specialized sub-agent)
            └── Web Content Analysis Sub-Agent
                ├── web_search
                ├── web_fetch
                ├── grep
                ├── view
                └── other read-only tools
```

**Key Components:**

1. **Coordinator** (`coordinator.go`): Top-level orchestrator that:
   - Manages agent lifecycle
   - Builds providers and models (large & small)
   - Configures tools based on agent configuration
   - Handles OAuth token refresh
   - Routes requests to the appropriate session agent

2. **Session Agent** (`agent.go`): Core agent implementation that:
   - Maintains conversation history per session
   - Executes tool calls through Fantasy framework
   - Manages prompt assembly and caching
   - Handles auto-summarization when context grows large
   - Tracks token usage and costs
   - Supports message queueing when busy

3. **Fantasy Framework**: Third-party AI abstraction layer that:
   - Provides provider-agnostic interface for multiple LLM APIs
   - Handles streaming, tool calls, and multi-step reasoning
   - Supports structured outputs and reasoning modes
   - Manages provider-specific options (Anthropic thinking, OpenAI reasoning, etc.)

### Agent Composition Pattern: Tool-Wielding Sub-Agents

Crush implements a **tool-wielding sub-agent pattern** where:

- The **main agent** has access to all development tools (edit, bash, git, LSP, etc.)
- **Sub-agents** are spawned as tools with restricted, specialized capabilities
- Each sub-agent runs in its **own isolated session** (tracked via `agentToolSessionID`)
- Sub-agents have **auto-approved permissions** (bypassing user prompts)
- Parent sessions **inherit costs** from child sub-agent sessions

**Implementation in `agentic_fetch_tool.go` (lines 172-190):**

```go
agent := NewSessionAgent(SessionAgentOptions{
    LargeModel:           small, // Uses small model for efficiency
    SmallModel:           small,
    SystemPromptPrefix:   smallProviderCfg.SystemPromptPrefix,
    SystemPrompt:         systemPrompt,  // Specialized prompt
    DisableAutoSummarize: c.cfg.Options.DisableAutoSummarize,
    IsYolo:               c.permissions.SkipRequests(),
    Sessions:             c.sessions,
    Messages:             c.messages,
    Tools:                fetchTools,  // Limited toolset
})

agentToolSessionID := c.sessions.CreateAgentToolSessionID(validationResult.AgentMessageID, call.ID)
session, err := c.sessions.CreateTaskSession(ctx, agentToolSessionID, validationResult.SessionID, "Fetch Analysis")

c.permissions.AutoApproveSession(session.ID)  // No permission prompts
```

### Hierarchy Design Patterns

**1. Session Isolation Pattern:**
Each sub-agent gets a unique session ID composed of:
```
agentToolSessionID = parentMessageID + ":" + toolCallID
```
This enables:
- Independent message history tracking
- Parallel sub-agent execution
- Cost attribution to parent session
- Proper context management

**2. Model Selection Strategy:**
- **Main agent**: Uses "large" model (e.g., Claude Sonnet 4) for complex reasoning
- **Agentic fetch sub-agent**: Uses "small" model (e.g., Claude Haiku) for efficiency
- **Title generation**: Uses small model with limited tokens
- **Summarization**: Uses large model for quality

**Implementation in `coordinator.go` (lines 435-517):**
```go
func (c *coordinator) buildAgentModels(ctx context.Context) (Model, Model, error) {
    largeModelCfg := c.cfg.Models[config.SelectedModelTypeLarge]
    smallModelCfg := c.cfg.Models[config.SelectedModelTypeSmall]
    // ... build both models for use by agents
}
```

**3. Tool Restriction Pattern:**
Different agents receive different tool sets:

- **Coder Agent** (main): All tools including destructive ones (bash, edit, write)
- **Task Agent** (sub-agent tool): Read-only tools (view, grep, ls, glob)
- **Agentic Fetch Agent** (sub-agent): Web + read-only tools (web_search, web_fetch, view, grep, glob, sourcegraph)

**Implementation in `agentic_fetch_tool.go` (lines 160-170):**
```go
fetchTools := []fantasy.AgentTool{
    webFetchTool,
    webSearchTool,
    tools.NewGlobTool(tmpDir),        // Scoped to tmpDir
    tools.NewGrepTool(tmpDir),        // Scoped to tmpDir
    tools.NewSourcegraphTool(client),
    tools.NewViewTool(c.lspClients, c.permissions, tmpDir),
}
```

**4. Context Injection Pattern:**
Context values flow through the agent hierarchy:
```go
ctx = context.WithValue(ctx, tools.SessionIDContextKey, call.SessionID)
ctx = context.WithValue(ctx, tools.MessageIDContextKey, assistantMsg.ID)
ctx = context.WithValue(ctx, tools.SupportsImagesContextKey, model.SupportsImages)
ctx = context.WithValue(ctx, tools.ModelNameContextKey, model.Name)
```

This enables:
- Tools to access session-specific data
- Sub-agents to create nested sessions
- Permission system to track tool calls
- Message attribution

---

## 2. Agentic Fetch Decision Logic

### Trigger Conditions

**When agentic_fetch is invoked vs. direct fetch:**

The main agent decides based on the system prompt guidance in `agentic_fetch.md`:

```markdown
<when_to_use>
Use this tool when you need to:
- Search the web for information (omit the url parameter)
- Extract specific information from a webpage (provide a url)
- Answer questions about web content
- Summarize or analyze web pages
- Research topics by searching and following links

DO NOT use this tool when:
- You just need raw content without analysis (use fetch instead)
- You want direct access to API responses or JSON (use fetch instead)
- You don't need the content processed or interpreted (use fetch instead)
</when_to_use>
```

**Key differences:**
- **`fetch` tool**: Returns raw content (HTML→markdown, JSON formatted)
- **`agentic_fetch` tool**: Spawns a sub-agent that can search, fetch multiple pages, and synthesize information

### Execution Flow: Prompt → Search → Fetch → Response

**Detailed flow for search mode (no URL provided):**

1. **Main agent receives user query** (e.g., "What are the latest features in Python 3.12?")

2. **Main agent invokes agentic_fetch tool**:
   ```json
   {
     "prompt": "What are the latest features in Python 3.12?"
   }
   ```

3. **Agentic fetch tool preprocessing** (`agentic_fetch_tool.go`, lines 104-135):
   - Creates temporary directory for storing fetched content
   - Builds full prompt: `"<user_prompt>\n\nUse the web_search tool to find relevant information..."`
   - No URL provided → sub-agent enters **search mode**

4. **Sub-agent initialization**:
   - Loads specialized system prompt from `agentic_fetch_prompt.md.tpl`
   - Receives limited toolset (web_search, web_fetch, view, grep, glob)
   - Gets auto-approved permissions

5. **Sub-agent autonomous execution**:
   
   a. **Initial search**:
   ```go
   web_search(query="Python 3.12 new features", max_results=10)
   ```
   Returns formatted results with titles, URLs, snippets.

   b. **Result evaluation** (by sub-agent's LLM):
   - Reads search results
   - Identifies most relevant URLs
   - Decides which pages to fetch for detailed content

   c. **Iterative fetching**:
   ```go
   web_fetch(url="https://docs.python.org/3/whatsnew/3.12.html")
   ```
   - Large content (>50KB) saved to temp file
   - Sub-agent uses `view` and `grep` to analyze
   - Can fetch additional linked pages as needed

   d. **Iterative refinement** (if needed):
   - Sub-agent may perform additional searches with refined queries
   - Can break down complex questions into multiple focused searches
   - Follows links from initial results

6. **Sub-agent response synthesis**:
   - Aggregates information from all fetched sources
   - Formats response with requested information
   - Includes "Sources" section with all useful URLs

7. **Cost tracking & cleanup**:
   ```go
   parentSession.Cost += updatedSession.Cost
   c.sessions.Save(ctx, parentSession)
   os.RemoveAll(tmpDir)  // Cleanup temporary files
   ```

8. **Response returned to main agent**:
   The main agent receives the sub-agent's synthesized answer and can:
   - Present it to the user
   - Use it to inform further actions
   - Combine it with other information

**URL mode flow (URL provided):**

1. Main agent invokes:
   ```json
   {
     "url": "https://example.com/page",
     "prompt": "Summarize the key points about X"
   }
   ```

2. **Pre-fetching** (`agentic_fetch_tool.go`, lines 106-131):
   - Tool immediately fetches the URL content
   - Checks content size:
     - **Small (<50KB)**: Embeds in prompt directly
     - **Large (≥50KB)**: Saves to temp file, provides path

3. **Sub-agent receives**:
   - Either: `"<prompt>\n\nWeb page URL: ...\n\n<webpage_content>...</webpage_content>"`
   - Or: `"<prompt>\n\nThe web page from <url> has been saved to: <file>\n\nUse view and grep tools..."`

4. **Sub-agent analyzes** using view/grep tools if needed, synthesizes answer

### Information Sufficiency Determination

The sub-agent determines sufficiency through its **system prompt guidance** in `agentic_fetch_prompt.md.tpl`:

```markdown
<rules>
1. Be concise and direct in your responses
2. Focus only on the information requested in the user's prompt
3. If the content is provided in a file path, use the grep and view tools...
4. When relevant, quote specific sections from the content...
5. If the requested information is not found, clearly state that
...
11. Don't hesitate to follow multiple links or perform multiple searches if necessary
</rules>
```

**Stopping criteria:**
- Sub-agent has found all requested information
- No more relevant links to follow
- Search queries are not yielding new information
- Tool call budget exhausted (Fantasy framework handles max turns)

The sub-agent doesn't have explicit "max URLs" or "max searches" limits—it's guided by:
- LLM's natural reasoning about task completion
- Context window constraints (auto-summarization kicks in if needed)
- Timeout constraints (HTTP client timeouts, session timeouts)

---

## 3. Tool System & Capabilities

### Agentic Fetch Agent Toolset

**Tools available to the web content analysis sub-agent:**

1. **web_search** (`web_search.go`)
   - **Purpose**: Search the web via DuckDuckGo
   - **Parameters**: `query` (string), `max_results` (int, default 10, max 20)
   - **Output**: Formatted list with position, title, URL, snippet
   - **Implementation**: POST to DuckDuckGo HTML endpoint, parse results

2. **web_fetch** (`web_fetch.go`)
   - **Purpose**: Fetch and convert web pages to markdown
   - **Parameters**: `url` (string)
   - **Output**: 
     - Small pages: Markdown content directly
     - Large pages (>50KB): Saves to file, returns file path
   - **Content processing**: HTML→markdown conversion, JSON formatting

3. **view** (standard tool, scoped to tmpDir)
   - **Purpose**: Read file contents with line numbers
   - **Scope**: Restricted to temporary directory
   - **Limits**: Max 5MB file size, 2000 lines default

4. **grep** (standard tool, scoped to tmpDir)
   - **Purpose**: Search file contents by regex/text
   - **Scope**: Restricted to temporary directory
   - **Features**: Literal text mode, include patterns, respects .gitignore

5. **glob** (standard tool, scoped to tmpDir)
   - **Purpose**: Find files by name pattern
   - **Scope**: Restricted to temporary directory
   - **Limits**: 100 files max, sorted by modification time

6. **sourcegraph** (optional, no scope restriction)
   - **Purpose**: Search public code repositories
   - **Parameters**: `query` (Sourcegraph syntax), `count`, `timeout`
   - **Limits**: Max 20 results

### Internal Workings & Constraints

#### web_search Implementation Details

**DuckDuckGo Integration** (`search.go`, lines 23-64):

```go
func searchDuckDuckGo(ctx context.Context, client *http.Client, query string, maxResults int) ([]SearchResult, error) {
    formData := url.Values{}
    formData.Set("q", query)
    
    req, _ := http.NewRequestWithContext(ctx, "POST", "https://html.duckduckgo.com/html", ...)
    req.Header.Set("User-Agent", BrowserUserAgent)  // Realistic browser UA
    req.Header.Set("Referer", "https://duckduckgo.com/")
    
    // ... execute request, parse HTML results
}
```

**Constraints:**
- **Rate limiting**: DuckDuckGo may return 202 status or block requests
- **Bot detection**: Uses realistic User-Agent and headers to avoid detection
- **Max results**: Hard limit of 20 results (configurable, default 10)
- **No API key**: Uses free HTML endpoint (no authentication)
- **Result parsing**: HTML parsing via `golang.org/x/net/html`

**Result extraction** (`search.go`, lines 66-135):
- Finds `<div class="result">` elements
- Extracts title from `<a class="result__a">`
- Extracts snippet from `<a class="result__snippet">`
- Cleans DuckDuckGo redirect URLs to get actual URLs

#### web_fetch Implementation Details

**URL Fetching** (`fetch_helpers.go`, lines 22-77):

```go
func FetchURLAndConvert(ctx context.Context, client *http.Client, url string) (string, error) {
    req.Header.Set("User-Agent", BrowserUserAgent)
    req.Header.Set("Accept", "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8")
    
    // Limit response size to 5MB
    body, _ := io.ReadAll(io.LimitReader(resp.Body, 5*1024*1024))
    
    // Convert HTML to markdown
    if strings.Contains(contentType, "text/html") {
        cleanedHTML := removeNoisyElements(content)
        markdown := ConvertHTMLToMarkdown(cleanedHTML)
        return cleanupMarkdown(markdown)
    }
}
```

**HTML Processing** (`fetch_helpers.go`, lines 79-126):
- **Noise removal**: Strips `<script>`, `<style>`, `<nav>`, `<header>`, `<footer>`, `<aside>`, `<iframe>`, `<svg>`
- **Markdown conversion**: Uses `JohannesKaufmann/html-to-markdown` library
- **Cleanup**: Removes excessive whitespace, normalizes line breaks

**Constraints:**
- **Max size**: 5MB per request
- **Timeout**: 30 seconds (HTTP client default)
- **Content types**: HTML, JSON supported; binary rejected
- **UTF-8 validation**: Non-UTF-8 content rejected
- **No authentication**: Cannot handle login-protected sites
- **No cookies**: Stateless requests

#### URL Extraction from Search Results

The sub-agent extracts URLs through **LLM reasoning** over structured search results:

**Formatted search output** (`search.go`, lines 173-189):
```
Found 10 search results:

1. Python 3.12 Release Notes
   URL: https://docs.python.org/3/whatsnew/3.12.html
   Summary: Official documentation covering new features in Python 3.12...

2. Real Python - Python 3.12 Overview
   URL: https://realpython.com/python312-new-features/
   Summary: A comprehensive guide to the latest Python 3.12 features...
```

The LLM sub-agent:
1. Reads the formatted results
2. Identifies which URLs likely contain relevant information
3. Calls `web_fetch(url="...")` for selected URLs
4. Can follow links found within fetched pages

**No hardcoded URL extraction logic**—the LLM decides which URLs to pursue based on:
- Relevance of title and snippet to user's query
- Authoritative sources (e.g., official docs)
- Comprehensive coverage (e.g., tutorials vs. release notes)

---

## 4. Configuration & Control

### Search & Fetch Configuration Parameters

#### Global Configuration

**Working Directory Scope** (`agentic_fetch_tool.go`, line 98):
```go
tmpDir, _ := os.MkdirTemp(c.cfg.Options.DataDirectory, "crush-fetch-*")
```
- Temporary directory for fetched content
- Auto-cleanup on tool completion

**Model Selection** (`agentic_fetch_tool.go`, lines 146-159):
```go
_, small, _ := c.buildAgentModels(ctx)
// Uses "small" model for both large & small roles
agent := NewSessionAgent(SessionAgentOptions{
    LargeModel: small,
    SmallModel: small,
    // ...
})
```
- Configured via `crush.json` → `models.small`
- Typically: Claude Haiku, GPT-4o-mini, Gemini Flash

**Token Limits** (`agentic_fetch_tool.go`, lines 193-196):
```go
maxTokens := small.CatwalkCfg.DefaultMaxTokens
if small.ModelCfg.MaxTokens != 0 {
    maxTokens = small.ModelCfg.MaxTokens
}
```
- Default: From Catwalk model config
- Override: `crush.json` → `models.small.max_tokens`

#### HTTP Client Configuration

**Timeouts & Connection Pooling** (`agentic_fetch_tool.go`, lines 54-62):
```go
client := &http.Client{
    Timeout: 30 * time.Second,
    Transport: &http.Transport{
        MaxIdleConns:        100,
        MaxIdleConnsPerHost: 10,
        IdleConnTimeout:     90 * time.Second,
    },
}
```

**Configurable via**:
- Passing custom `client` to tool constructors
- No exposed config file settings (hardcoded defaults)

#### Search Result Limits

**DuckDuckGo Search** (`web_search.go`, lines 36-42):
```go
maxResults := params.MaxResults
if maxResults <= 0 {
    maxResults = 10  // Default
}
if maxResults > 20 {
    maxResults = 20  // Hard limit
}
```
- Default: 10 results
- Maximum: 20 results
- Controlled by agent via `max_results` parameter

#### Content Size Thresholds

**Large Content Handling** (`fetch_types.go`, line 13):
```go
const LargeContentThreshold = 50000 // 50KB
```

When content exceeds 50KB:
- Saved to temporary file
- File path provided to sub-agent
- Sub-agent uses `view`/`grep` for analysis

### Customization & Extension

#### Adding Custom Tools to Agentic Fetch Agent

**Modify `agentic_fetch_tool.go`, lines 160-170**:
```go
fetchTools := []fantasy.AgentTool{
    webFetchTool,
    webSearchTool,
    tools.NewGlobTool(tmpDir),
    tools.NewGrepTool(tmpDir),
    tools.NewSourcegraphTool(client),
    tools.NewViewTool(c.lspClients, c.permissions, tmpDir),
    // Add custom tool here:
    // myCustomTool(tmpDir),
}
```

**Requirements for custom tools**:
- Must implement `fantasy.AgentTool` interface
- Should be read-only (no file modifications)
- Should be scoped to `tmpDir` if file-based
- Should handle errors gracefully (return error responses, not panics)

#### Customizing System Prompts

**Agentic fetch prompt** (`templates/agentic_fetch_prompt.md.tpl`):
- Modify search strategy guidance
- Add domain-specific instructions
- Change response format requirements
- Adjust stopping criteria

**Example customization**:
```markdown
<search_strategy>
For academic research:
1. Prioritize .edu and .gov domains
2. Search for peer-reviewed sources
3. Cross-reference multiple sources
4. Include publication dates in sources
</search_strategy>
```

#### Model-Specific Behavior

Currently **no different modes** for different query types, but provider-specific options are supported:

**Provider options flow** (`coordinator.go`, lines 181-299):
```go
func getProviderOptions(model Model, providerCfg config.ProviderConfig) fantasy.ProviderOptions {
    // Merges: catwalk defaults → provider config → model config
    switch providerCfg.Type {
    case openai.Name:
        // Handle reasoning_effort, responses API
    case anthropic.Name:
        // Handle thinking mode, extended thinking
    case google.Name:
        // Handle thinking_config
    }
}
```

**Customizing via `crush.json`**:
```json
{
  "models": {
    "small": {
      "provider": "anthropic",
      "model": "claude-3-5-haiku-20241022",
      "think": true,  // Enable Anthropic thinking mode
      "provider_options": {
        "thinking": {
          "budget_tokens": 2000
        }
      }
    }
  }
}
```

### Agent Configuration System

**Agent definitions** (`config.go`):
```go
type Agent struct {
    Name         string
    Model        string
    AllowedTools []string
    AllowedMCP   map[string][]string
}
```

**Coder agent config** (default):
```go
config.AgentCoder: {
    Name:  "Coder",
    Model: config.SelectedModelTypeLarge,
    AllowedTools: [/* all tools */],
}
```

**Task agent config** (for agent tool):
```go
config.AgentTask: {
    Name:  "Task",
    Model: config.SelectedModelTypeLarge,
    AllowedTools: [/* read-only tools */],
}
```

**Agentic fetch implicitly defined** in `agenticFetchTool()` function—not externally configurable.

---

## 5. Error Handling & Resilience

### Network Error Handling

#### HTTP Request Failures

**web_search** (`search.go`, lines 46-56):
```go
resp, err := client.Do(req)
if err != nil {
    return nil, fmt.Errorf("failed to execute search: %w", err)
}

if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusAccepted {
    return nil, fmt.Errorf("search failed with status code: %d (DuckDuckGo may be rate limiting requests)", resp.StatusCode)
}
```

**Handled errors**:
- Network timeouts → Returns error to sub-agent
- DNS failures → Returns error to sub-agent
- HTTP 4xx/5xx → Returns error to sub-agent with status code
- HTTP 202 (Accepted) → Treated as success (DuckDuckGo may return this)

**Error propagation**:
```
HTTP error → tool returns fantasy.ToolResponse{error} → sub-agent sees error message → can retry with different query
```

#### Content Fetching Failures

**web_fetch** (`fetch_helpers.go`, lines 34-48):
```go
resp, err := client.Do(req)
if err != nil {
    return "", fmt.Errorf("failed to fetch URL: %w", err)
}

if resp.StatusCode != http.StatusOK {
    return "", fmt.Errorf("request failed with status code: %d", resp.StatusCode)
}

body, err := io.ReadAll(io.LimitReader(resp.Body, maxSize))
if err != nil {
    return "", fmt.Errorf("failed to read response body: %w", err)
}
```

**Error scenarios**:
- HTTP errors → Detailed error message returned
- Body read failures → Error message returned
- Size limit exceeded → Truncated at 5MB
- Invalid UTF-8 → Explicit error returned
- HTML parse failures → Falls back to original content

### Retry Mechanisms

**No built-in retry logic at tool level**—retry is handled by:

1. **LLM-based retry**: Sub-agent can:
   - Try different search queries
   - Fetch alternative URLs from search results
   - Rephrase queries if results are poor

2. **Provider-level retry** (Fantasy framework):
   ```go
   OnRetry: func(err *fantasy.ProviderError, delay time.Duration) {
       // TODO: implement
   }
   ```
   Currently not implemented, but framework supports it.

3. **HTTP client retry**: Not configured (could use custom `http.RoundTripper`)

**User-initiated retry**:
- Main agent can cancel sub-agent and re-invoke
- User can cancel ongoing operations via UI

### Fallback Strategies

#### Search Failure Fallback

**No search results** (`search.go`, lines 175-177):
```
"No results were found for your search query. This could be due to DuckDuckGo's bot detection or the query returned no matches. Please try rephrasing your search or try again in a few minutes."
```

Sub-agent receives this message and can:
- Try alternative search terms
- Use different search strategy
- Report to user that information couldn't be found

#### Fetch Failure Fallback

If `web_fetch` fails:
- Sub-agent can try alternative URLs from search results
- Can simplify query or search for alternative sources
- Can report partial results if some fetches succeeded

#### Rate Limiting Handling

**DuckDuckGo bot detection**:
- No automated backoff/retry
- Error message informs sub-agent of rate limiting
- Sub-agent can wait before retrying (LLM decision)
- User sees error in tool result

**Potential improvement** (not implemented):
```go
if resp.StatusCode == http.StatusTooManyRequests {
    retryAfter := resp.Header.Get("Retry-After")
    time.Sleep(parseRetryAfter(retryAfter))
    return retryRequest()
}
```

### Blocked Sites & Invalid Content

**Blocked sites**:
- HTTP 403/451 → Error returned to sub-agent
- No circumvention attempted
- Sub-agent must find alternative sources

**Invalid content**:
- **Non-UTF-8**: Rejected with error
- **Binary files**: No special handling (likely UTF-8 validation failure)
- **Malformed HTML**: Conversion may fail, falls back to raw content
- **Malformed JSON**: Formatting fails, returns original

**HTML conversion failures** (`fetch_helpers.go`, lines 58-66):
```go
markdown, err := ConvertHTMLToMarkdown(cleanedHTML)
if err != nil {
    return "", fmt.Errorf("failed to convert HTML to markdown: %w", err)
}
```
- Error returned to sub-agent
- Sub-agent sees error message, can try alternative approach

### Timeout Handling

**HTTP timeouts**:
```go
Timeout: 30 * time.Second
```
- After 30s, request fails with timeout error
- Error propagated to sub-agent
- No retry attempt

**Sub-agent session timeout**:
- No explicit timeout on sub-agent execution
- Bounded by:
  - Context cancellation (if parent cancels)
  - Provider API timeouts
  - Token/turn limits (Fantasy framework)

**Context cancellation** (`agent.go`, lines 190-194):
```go
genCtx, cancel := context.WithCancel(ctx)
a.activeRequests.Set(call.SessionID, cancel)
defer cancel()
defer a.activeRequests.Del(call.SessionID)
```
- User cancellation immediately stops sub-agent
- Cleanup happens in deferred functions
- Partial results are lost

### Permission Denial

**Not applicable to agentic fetch sub-agent**:
```go
c.permissions.AutoApproveSession(session.ID)
```
All sub-agent tool calls are auto-approved.

**Main agent permission denial**:
```go
if !p {
    return fantasy.ToolResponse{}, permission.ErrorPermissionDenied
}
```
- User denies agentic_fetch tool call
- Main agent receives permission denied error
- Agent can inform user or try alternative approach

### Malformed Responses & Parsing Failures

**Search result parsing** (`search.go`, lines 66-94):
```go
func parseSearchResults(htmlContent string, maxResults int) ([]SearchResult, error) {
    doc, err := html.Parse(strings.NewReader(htmlContent))
    if err != nil {
        return nil, fmt.Errorf("failed to parse HTML: %w", err)
    }
    // ... traverse DOM tree
}
```

**Resilience**:
- HTML parse errors return error to sub-agent
- Empty results list returned if no `<div class="result">` found
- Malformed result divs are skipped (no error thrown)

**URL cleaning** (`search.go`, lines 155-171):
```go
func cleanDuckDuckGoURL(rawURL string) string {
    // Extracts actual URL from redirect URL
    decoded, err := url.QueryUnescape(encoded)
    if err == nil {
        return decoded
    }
    return rawURL  // Fallback to raw URL
}
```
- Malformed redirect URLs → Returns raw URL (may be invalid)
- Sub-agent may encounter error when fetching, can try next result

---

## 6. Performance & Boundaries

### Hard Limits

#### Content Size Limits

**HTTP Response Size**:
```go
maxSize := int64(5 * 1024 * 1024) // 5MB
body, err := io.ReadAll(io.LimitReader(resp.Body, maxSize))
```
- **Maximum**: 5MB per web page
- **Enforcement**: `io.LimitReader` truncates at boundary
- **Consequence**: Large pages silently truncated

**File View Limit**:
- **Maximum file size**: 5MB (view tool)
- **Default lines**: 2000 lines per view
- **Configurable**: Via `offset` and `limit` parameters

**Search Results**:
- **Maximum**: 20 results per search
- **Default**: 10 results
- **Configurable**: Via `max_results` parameter in tool call

#### Timeout Limits

**HTTP Request Timeout**:
```go
Timeout: 30 * time.Second
```
- **Per-request**: 30 seconds
- **Not configurable**: Hardcoded default
- **Affects**: web_search and web_fetch

**Connection Timeouts**:
```go
IdleConnTimeout: 90 * time.Second
```
- **Idle connection**: 90 seconds
- **Connection pool**: 100 total, 10 per host

**Session/Agent Timeout**:
- **No explicit limit** on sub-agent execution time
- **Bounded by**: User cancellation, provider timeouts, context deadlines

#### Token Usage Limits

**Context Window**:
- Depends on selected "small" model
- Example: Claude Haiku (200K context)
- Auto-summarization triggers at ~20% remaining tokens

**Max Output Tokens**:
```go
maxTokens := small.CatwalkCfg.DefaultMaxTokens
if small.ModelCfg.MaxTokens != 0 {
    maxTokens = small.ModelCfg.MaxTokens
}
```
- Default: From Catwalk config (e.g., 8K for Claude Haiku)
- Override: `crush.json` → `models.small.max_tokens`

#### URL & Search Limits

**No hard limit on**:
- Number of URLs sub-agent can fetch
- Number of searches sub-agent can perform
- Depth of link following

**Practical limits**:
- Context window (long conversation history)
- User patience / cancellation
- Provider rate limits (Anthropic, OpenAI)
- DuckDuckGo rate limiting

### Loop Prevention

#### Infinite Search Prevention

**No explicit loop detection**, but bounded by:

1. **LLM reasoning**: Sub-agent decides when enough information is gathered
2. **Context exhaustion**: Long history triggers summarization
3. **Repetitive tool calls**: LLM typically avoids repeating identical queries
4. **Tool budget** (Fantasy framework): May limit number of turns (not configured in Crush)

**Potential vulnerability**:
- Sub-agent could theoretically keep searching indefinitely
- No max-turns configuration visible in code
- Relies on LLM's judgment to stop

#### Infinite Recursion Prevention

**Sub-agents cannot spawn sub-agents**:
- Agentic fetch agent has limited toolset
- No access to `agentic_fetch` or `agent` tools
- **Hard restriction** via tool filtering

**Implementation** (`agentic_fetch_tool.go`, lines 160-170):
```go
fetchTools := []fantasy.AgentTool{
    webFetchTool,
    webSearchTool,
    // No agenticFetchTool
    // No agentTool
    tools.NewGlobTool(tmpDir),
    tools.NewGrepTool(tmpDir),
    tools.NewSourcegraphTool(client),
    tools.NewViewTool(c.lspClients, c.permissions, tmpDir),
}
```

**Depth limit**: Maximum 2 levels (main agent → agentic fetch agent)

#### Circular Fetch Prevention

**No URL visit tracking**:
- Sub-agent could fetch same URL multiple times
- No cache or visited-URL tracking
- LLM should avoid this naturally

**Potential improvement** (not implemented):
```go
type fetchCache struct {
    visited map[string]bool
    content map[string]string
}
```

### Performance Characteristics

#### Latency Profile

**Typical agentic fetch execution**:

1. **Tool invocation overhead**: ~50-100ms
   - Permission check (auto-approved)
   - Temporary directory creation
   - Session creation

2. **Sub-agent initialization**: ~100-500ms
   - Model loading (cached)
   - System prompt assembly
   - Tool registration

3. **Search execution**: ~1-3 seconds per search
   - Network latency to DuckDuckGo
   - HTML parsing
   - Result formatting

4. **Fetch execution**: ~1-5 seconds per URL
   - Network latency
   - HTML download
   - Markdown conversion
   - File I/O (for large pages)

5. **LLM reasoning**: ~5-30 seconds per turn
   - Depends on model speed (Haiku: fast, GPT-4: slower)
   - Depends on context size
   - Depends on complexity of reasoning

6. **Total duration**: ~10-60 seconds for simple queries
   - More for complex multi-search queries
   - Depends on number of URLs fetched

**Optimization opportunities**:
- Cache frequently accessed pages
- Parallel fetching (currently sequential)
- Streaming results back to main agent

#### Resource Usage

**Memory**:
- **Per sub-agent**: ~50-200MB (LLM context, tool state)
- **Per fetched page**: Up to 5MB (in memory before file save)
- **Temporary files**: Stored on disk, cleaned up after tool completes

**Disk I/O**:
- Temporary directory: `$DATA_DIR/crush-fetch-*`
- Files: `page-*.md` for large content
- Auto-cleanup: `defer os.RemoveAll(tmpDir)`

**Network**:
- Concurrent connections: Up to 10 per host (connection pool)
- Bandwidth: Depends on page sizes fetched
- No rate limiting on client side (DuckDuckGo may rate limit)

#### Cost Characteristics

**Token costs**:
- **Small model**: Cheaper (e.g., Claude Haiku: $0.25/M input, $1.25/M output)
- **Context size**: Grows with each search/fetch
- **Output size**: Depends on response length

**Example cost** (rough estimate):
- Search result: ~500 tokens input
- Fetched page: ~5,000-50,000 tokens input
- Sub-agent response: ~500-2,000 tokens output
- Total: ~$0.01-0.10 per agentic fetch call (with Claude Haiku)

**Cost tracking**:
```go
parentSession.Cost += updatedSession.Cost
```
Sub-agent costs automatically attributed to parent session.

#### Parallelism

**Parallel tool calls**:
```go
fantasy.NewParallelAgentTool(...)
```
- Multiple agentic fetch calls can run **in parallel**
- Each gets independent session and context
- No shared state between parallel calls

**Sequential within sub-agent**:
- Sub-agent executes tools sequentially (LLM decides order)
- No parallel fetching within a single sub-agent
- Could be optimized for multi-URL scenarios

### Developer Considerations

#### When to Use Agentic Fetch

**Use when**:
- User needs information not in codebase
- Query requires searching and synthesizing multiple sources
- Content needs intelligent extraction/summarization
- Research-style tasks (compare, analyze, find latest)

**Avoid when**:
- Simple URL fetch (use `fetch` tool)
- Structured API calls (use `fetch` tool)
- Known URL with specific content location (use `fetch` + main agent reasoning)

#### Token Efficiency Tips

**For developers extending Crush**:
1. **Use small model**: Agentic fetch already uses small model—appropriate for most tasks
2. **Limit context**: Encourage sub-agents to be concise (system prompt already does this)
3. **Cache aggressively**: Consider caching search results, frequently accessed pages
4. **Summarize large pages**: Before passing to LLM, consider extractive summarization

#### Debugging & Observability

**Logging**:
```go
if c.cfg.Options.Debug {
    httpClient := log.NewHTTPClient()
    opts = append(opts, anthropic.WithHTTPClient(httpClient))
}
```
- HTTP requests/responses logged when `debug: true` in config
- Logs stored in `.crush/logs/crush.log`

**Session tracking**:
- Each sub-agent session has unique ID
- Messages stored in database
- Can inspect sub-agent conversation history

**Cost tracking**:
- Per-session cost tracked
- Sub-agent costs rolled up to parent
- Viewable in UI (session cost display)

#### Security Considerations

**Isolation**:
- Sub-agent limited to temporary directory
- No access to user's file system
- No bash/write/edit tools

**Network**:
- No authentication credentials exposed
- Only public web pages accessible
- HTTPS enforced (HTTP auto-upgraded)

**Injection risks**:
- User prompt passed to sub-agent (potential prompt injection)
- Fetched content passed to LLM (potential malicious web content)
- **Mitigation**: System prompt guards, LLM alignment, read-only tools

**Rate limiting**:
- No protection against user-triggered DDoS on external sites
- DuckDuckGo may block Crush IP if overused
- **Recommendation**: Implement request throttling per session

---

## Summary

Crush's agentic fetch implementation demonstrates a sophisticated **hierarchical agent architecture** where:

1. **Main agents** handle complex coding tasks with full tool access
2. **Sub-agents** are spawned as specialized tools with restricted capabilities
3. **Tool-wielding pattern** enables composable, isolated agent behaviors
4. **LLM-driven decision making** determines search strategies, URL selection, and stopping criteria
5. **Cost-efficient design** uses smaller models for sub-agents, tracks costs across hierarchy
6. **Resilient error handling** propagates errors to LLM agents for intelligent retry
7. **Performance boundaries** prevent infinite loops through context limits and tool restrictions

This architecture enables powerful autonomous web research while maintaining safety, efficiency, and user control. The system's flexibility allows for future enhancements like caching, parallelism, and custom search backends without fundamental redesign.
