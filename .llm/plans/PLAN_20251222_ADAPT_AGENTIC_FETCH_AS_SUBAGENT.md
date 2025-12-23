# Plan: Adapt Agentic Fetch as a Sub-Agent

## Overview

Transform current `agentic_fetch` from a simple tool into a sub-agent pattern. The sub-agent will autonomously search the web, fetch pages, and analyze content using dedicated tools (`web_search`, `web_fetch`, `view`, `grep`), providing more intelligent and comprehensive web content analysis.

**Security Focus:**
- Sub-agent operates in a **virtual sandbox** at `/home/agent` (made-up directory for agent)
- Maps to actual OS temp directory (e.g., `/tmp/agents-sandbox-{timestamp}`)
- Filesystem tools are **strictly bounded** to `/home/agent` virtual workspace
- Path traversal attempts are rejected with "forbidden request"
- Temp directory cleaned up on completion

## Current State

**Current agentic-fetch.ts behavior:**
- Simple tool that performs one action per call:
  - URL mode: Fetches a single URL and returns markdown content
  - Search mode: Performs one DuckDuckGo search and returns formatted results
- No autonomous decision-making or multi-step reasoning
- Returns raw content directly to parent agent
- Parent agent must handle all interpretation

**Current ChatAgent:**
- Uses `agentic_fetch` as a simple tool
- Receives raw search results or page content
- Must interpret and analyze content itself

**Missing capabilities:**
- Sub-agent cannot perform multiple searches in sequence
- Cannot autonomously decide to follow links
- No ability to break down complex queries
- Cannot efficiently analyze large pages
- No tool for reading/viewing saved content files
- No structured response format with sources

## Proposed Solution

Implement a **sub-agent pattern** where:

1. **Parent Agent** (ChatAgent) receives user message with web-related query
2. **Agentic Fetch Tool** is invoked by parent as a tool
3. **Sub-Agent** is spawned with specialized tools:
   - `web_search` - DuckDuckGo web search
   - `web_fetch` - Fetch web pages and convert to markdown
   - `view` - Read file contents (for large pages saved to disk)
   - `grep` - Search within files (for efficient content analysis)
4. **Sub-Agent** autonomously:
   - Breaks down complex queries into focused searches
   - Performs multiple searches as needed
   - Follows relevant links from search results
   - Analyzes fetched content to answer the question
   - Returns structured response with sources
5. **Response** flows back to parent agent as tool result

**Architecture:**

```
User → ChatAgent (Parent)
         ↓ (invokes agentic_fetch)
       Sub-Agent (with web_search, web_fetch, view, grep)
         ↓ (autonomous execution in virtual workspace /home/agent)
       Web Tools (DuckDuckGo, HTTP fetch, file operations)
```

**Virtual Workspace Security:**
- Sub-agent operates in virtual `/home/agent` directory (does NOT exist on host OS)
- Maps to actual OS temp directory (e.g., `/tmp/agents-sandbox-{timestamp}`)
- Filesystem tools (view, grep, web-fetch) only operate within this sandbox
- Path traversal outside `/home/agent` is rejected with "forbidden request"
- Temp directory cleaned up when sub-agent completes

## Implementation Steps

### Step 1: Create Sub-Agent Infrastructure with Virtual Workspace
- [ ] Create `src/backend/agent/sub-agent.ts` - Base class for sub-agents
- [ ] Implement virtual workspace mapping:
  - Create unique OS temp directory for each sub-agent session (e.g., `/tmp/agents-sandbox-{timestamp}`)
  - Map virtual path `/home/agent` to actual temp directory
  - Store path mapping in sub-agent configuration
  - Clean up temp directory on sub-agent completion
- [ ] Implement session management for sub-agents (no DB, in-memory only)
- [ ] Create sub-agent system prompt builder with `<env>` section
- [ ] Add sub-agent configuration (model, tools, max steps)
- [ ] Implement sub-agent lifecycle (create, execute, cleanup)

### Step 2: Split Web Tools into Individual Tools
- [ ] Create `web-search.ts` - Dedicated search tool with DuckDuckGo
- [ ] Create `web-fetch.ts` - Dedicated fetch tool with URL→markdown conversion
  - Save large pages (>50KB) to virtual `/home/agent/` path
  - Convert actual OS temp path to virtual `/home/agent/` path in tool response
  - Example: `/tmp/agents-sandbox-123456/page.md` → `/home/agent/page.md`
- [ ] Update tool descriptions for AI SDK tool format
- [ ] Keep `web-tools.ts` as shared utilities for web operations

### Step 3: Create View and Grep Tools with Security Boundaries
- [ ] Create `view-tool.ts` - Read file contents for analysis
  - **CRITICAL SECURITY**: Validate all file paths
  - Only allow paths starting with `/home/agent` or relative paths
  - Resolve paths relative to `/home/agent` virtual directory
  - Convert virtual path to actual OS temp path using sub-agent mapping
  - Reject paths outside sandbox with error: "❌ Forbidden request: Path outside allowed workspace /home/agent"
- [ ] Create `grep-tool.ts` - Search within files for specific patterns
  - **CRITICAL SECURITY**: Implement same path validation as view-tool
  - Only allow searching within `/home/agent` virtual directory
  - Reject invalid paths with clear error message
- [ ] Add file path handling and error management with security-first approach

### Step 4: Rewrite agentic-fetch.ts as Sub-Agent Spawner
- [ ] Refactor `createAgenticFetchTool` to spawn sub-agent
- [ ] Build enhanced system prompt with:
  - Search strategy and response format
  - **CRITICAL**: `<env>` section stating working directory is `/home/agent`
  - **CRITICAL**: Instructions that agent can only operate within `/home/agent`
  - Clear guidance on using view/grep tools for file analysis
- [ ] Implement virtual workspace mapping:
  - Create unique OS temp directory for each session
  - Map `/home/agent` → actual temp directory path
  - Pass mapping to sub-agent tools for path conversion
  - Ensure cleanup on completion (even on errors)
- [ ] Handle both URL and search modes appropriately
- [ ] Return structured response with sources section

### Step 5: Update ChatAgent Integration
- [ ] Ensure `agentic_fetch` tool still works as expected from parent agent
- [ ] Verify tool tracking callbacks work correctly
- [ ] Test WebSocket events for tool lifecycle
- [ ] Maintain backward compatibility with current command handlers

### Step 6: Add Permission System (Future Enhancement)
- [ ] Design permission request structure for tool calls
- [ ] Implement auto-approval for sub-agent sessions
- [ ] Add permission event types to commands.ts (optional, can defer)

### Step 7: Update Documentation
- [ ] Document sub-agent architecture in AGENTS.md
- [ ] Update agent system section with sub-agent pattern explanation
- [ ] Add tool descriptions and usage examples
- [ ] Document temporary workspace management
- [ ] **CRITICAL:** Add note about `/home/agent` virtual directory quirk:
  - Explain that `/home/agent` is a made-up directory for the sub-agent
  - It does NOT exist on the host OS
  - It maps to an actual OS temp directory (e.g., `/tmp/agents-sandbox-{timestamp}`)
  - Cleanup happens when sub-agent finishes
  - This is an implementation detail for sandboxing, not a real path

### Step 8: Testing and Verification
- [ ] Test URL mode: fetch and analyze a specific webpage
- [ ] Test search mode: search and follow multiple links
- [ ] Test complex query: requires multiple searches and link following
- [ ] Test large page handling: verify file saving and view/grep tools work
- [ ] Test error handling: network failures, parsing errors, rate limiting
- [ ] Verify debug mode still works with sub-agent pattern

## Files to Modify

### New Files to Create
1. **`src/backend/agent/sub-agent.ts`** - Sub-agent base class and session management
2. **`src/backend/agent/web-search.ts`** - Dedicated web search tool
3. **`src/backend/agent/web-fetch.ts`** - Dedicated web fetch tool
4. **`src/backend/agent/view-tool.ts`** - View file contents tool
5. **`src/backend/agent/grep-tool.ts`** - Search within files tool

### Files to Refactor
1. **`src/backend/agent/agentic-fetch.ts`** - Complete rewrite as sub-agent spawner
2. **`src/backend/agent/web-tools.ts`** - Keep as shared utilities (no changes needed)

### Files to Update (Minor)
1. **`src/backend/agent/model-config.ts`** - May need small model export for sub-agent
2. **`AGENTS.md`** - Document new sub-agent architecture
   - Add section on virtual workspace and `/home/agent` concept
   - **CRITICAL NOTE:** Explain that `/home/agent` is a made-up directory for the agent (virtual sandbox)
   - Document that it maps to actual OS temp directory
   - Explain security boundaries and path validation
   - Note that `/home/agent` does not exist on host OS

### Files to Review (Potential Minor Updates)
1. **`src/backend/agent/chat-agent.ts`** - Ensure compatibility (may need no changes)
2. **`src/backend/command-handlers.ts`** - Ensure tool events still work (may need no changes)

## Testing Strategy

### Unit Testing
1. **Sub-agent creation:**
   - Verify sub-agent spawns correctly with proper tools
   - Test session management and cleanup
   - Verify system prompt generation

2. **Individual tools:**
   - Test `web_search` returns proper search results
   - Test `web_fetch` converts HTML to markdown correctly
   - Test `view` reads file contents
   - Test `grep` searches within files

3. **Integration:**
   - Test sub-agent performs multiple searches in sequence
   - Test sub-agent follows links from search results
   - Test large page handling (file save + view/grep)

### End-to-End Testing
1. **Simple URL analysis:**
   - User: "Summarize https://example.com"
   - Verify: Sub-agent fetches, analyzes, returns summary with source

2. **Web search:**
   - User: "What are the main features in Python 3.12?"
   - Verify: Sub-agent searches, fetches relevant links, summarizes with sources

3. **Complex multi-step query:**
   - User: "Compare prices of iPhone 15 vs Samsung Galaxy S24 from multiple retailers"
   - Verify: Sub-agent performs multiple searches, fetches product pages, compares prices

4. **Large page handling:**
   - User: "Find all sections about security in this documentation"
   - Verify: Large page saved to file, sub-agent uses grep to find relevant sections

5. **Error scenarios:**
   - Test network failure handling
   - Test DuckDuckGo rate limiting
   - Test malformed URLs
   - Test permission system (if implemented)

6. **Security Testing (CRITICAL):**
   - Test path traversal attempts: `view /etc/passwd`, `grep "../../secret"`
   - Test absolute paths: `view /tmp/other-file`, `grep "/root/config"`
   - Test symlinks pointing outside sandbox
   - Verify all rejected attempts return "forbidden request" error
   - Test that valid paths within `/home/agent` work correctly
   - Verify temp directory is cleaned up after sub-agent completion

## Potential Risks

1. **Performance Issues:**
   - Sub-agent spawning adds latency
   - Multiple searches increase cost
   - Large file operations may be slow
   - **Mitigation:** Set reasonable step limits, use efficient tools

2. **Token Costs:**
   - Sub-agent uses AI model for reasoning
   - Multiple API calls per agentic_fetch invocation
   - **Mitigation:** Use small model for sub-agent, set max token limits

3. **Complexity:**
   - More moving parts (sub-agent + tools)
   - Harder to debug issues
   - **Mitigation:** Clear logging, comprehensive error handling

4. **Breaking Changes:**
   - Current tool behavior changes (returns AI-processed content instead of raw)
   - May affect existing conversation flows
   - **Mitigation:** Test thoroughly, document behavior changes

5. **File System:**
   - Temporary workspace creation/cleanup
   - File path handling issues
   - **Mitigation:** Use OS temp directory, robust cleanup with try/finally

6. **Tool Compatibility:**
   - Current tool tracking may need updates for sub-agent's internal tools
   - WebSocket events only track agentic_fetch, not internal web_search/web_fetch
   - **Mitigation:** Document which tools are visible to UI

7. **Path Traversal Security (CRITICAL):**
   - Agent might try to access files outside virtual sandbox
   - Path injection attacks via `../` or absolute paths
   - **Mitigation:**
     - Strict path validation in all filesystem tools (view, grep)
     - Resolve all paths relative to `/home/agent` virtual directory
     - Reject any attempt to access outside sandbox with "forbidden request" error
     - Use `path.resolve()` and `path.relative()` for validation
     - Log all path access attempts for security auditing

## Rollback Plan

If sub-agent approach causes issues:

1. **Revert to original agentic-fetch.ts:**
   ```bash
   git checkout HEAD -- src/backend/agent/agentic-fetch.ts
   ```

2. **Remove new tool files:**
   ```bash
   rm src/backend/agent/sub-agent.ts
   rm src/backend/agent/web-search.ts
   rm src/backend/agent/web-fetch.ts
   rm src/backend/agent/view-tool.ts
   rm src/backend/agent/grep-tool.ts
   ```

3. **Restore imports in chat-agent.ts if needed:**
   ```bash
   git checkout HEAD -- src/backend/agent/chat-agent.ts
   ```

## Design Decisions

### Model Selection for Sub-Agent
- **Option A:** Use `bigModel` (Grok-4-1-fast-reasoning) - Better reasoning, higher cost
- **Option B:** Use `smallModel` (Mistral-3B) - Lower cost, may be sufficient
- **Decision:** Use `smallModel` initially for cost efficiency, upgrade to `bigModel` if quality is insufficient

### Workspace Management
- **Option A:** Use git repo (allows commit history, but pollutes repo)
- **Option B:** Use OS temp directory (clean, but no persistence)
- **Decision:** Use OS temp directory (`tmpdir()`) with automatic cleanup

### Tool Granularity
- **Option A:** Combined `web_fetch` that handles both small and large pages
- **Option B:** Separate tools for fetch and file operations
- **Decision:** Combined `web_fetch` that auto-saves large pages, with separate `view` and `grep` tools

### Session Management
- **Option A:** Store sub-agent sessions in database (persistent, queryable)
- **Option B:** In-memory sessions only (simpler, no DB schema changes)
- **Decision:** In-memory only for now - can add persistence later if needed

### Permission System
- **Option A:** Implement full permission system with user approval
- **Option B:** Auto-approve all sub-agent tool calls
- **Decision:** Auto-approve initially (sub-agent is trusted), add permission system later if needed

### Virtual Workspace Security (CRITICAL)
- **Virtual Path Concept:** `/home/agent` is a made-up directory that does not exist on host OS
- **Implementation:**
  - Sub-agent believes it's working in `/home/agent`
  - All tools (view, grep, web-fetch) operate on virtual paths
  - Virtual paths are mapped to actual OS temp directories
  - Example: `/home/agent/page.md` → `/tmp/agents-sandbox-123456/page.md`
- **Security Enforcement:**
  - Every filesystem tool validates paths before operation
  - Only paths starting with `/home/agent` or relative paths are allowed
  - Paths outside sandbox are rejected with "forbidden request" error
  - No tool can bypass this validation (security-first design)
- **Cleanup:**
  - Temp directories are deleted when sub-agent finishes
  - Cleanup happens even on errors (try/finally block)
  - No persistent data remains on host system

## Future Enhancements

After initial implementation:
1. Add more tools to sub-agent toolkit:
   - `summarize` - Generate summaries of long content
   - `extract` - Extract structured data from pages (dates, prices, etc.)
   - `compare` - Compare information from multiple sources

2. Improve sub-agent capabilities:
   - Add caching for previously fetched pages
   - Implement parallel search execution
   - Add tool prioritization (fetch relevant links first)

3. Enhance debugging and monitoring:
   - Track sub-agent tool usage metrics
   - Add sub-agent conversation history to debug output
   - Visualize sub-agent reasoning steps

4. Permission system:
   - Implement user approval for certain actions
   - Add permission categories (web access, file operations, etc.)
   - UI for managing permissions

5. Multiple sub-agents:
   - Create specialized sub-agents (research, code analysis, etc.)
   - Add sub-agent selection/orchestration logic
   - Enable sub-agent to sub-agent delegation

## Success Criteria

Implementation is successful when:
1. Sub-agent spawns correctly when agentic_fetch tool is invoked
2. Sub-agent performs autonomous web searches and content analysis
3. Sub-agent returns structured responses with sources
4. Large pages are saved to `/home/agent/` virtual path and analyzed with view/grep tools
5. Complex queries requiring multiple searches are handled correctly
6. Tool tracking events still work for agentic_fetch
7. Debug mode works with sub-agent pattern
8. No increase in error rates compared to current implementation
9. Token usage is reasonable (within 2x of current for same queries)
10. User experience is improved (more comprehensive answers)
11. **Security:** All path traversal attempts are blocked with "forbidden request" error
12. **Security:** Temp directories are always cleaned up after sub-agent completion
13. **Security:** `/home/agent` virtual path is correctly mapped to OS temp directory
14. **Security:** No tool can access files outside the virtual workspace
