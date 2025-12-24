## AI Agent System

### Chat Agent (`src/backend/agent/chat-agent.ts`)

- **Model**: xAI Grok-4-1-fast-reasoning
- **Capabilities**: Natural language processing, web search, content analysis
- **Tools**: `agentic_fetch` for web browsing/search
- **Streaming**: Real-time response streaming with status updates

### Agentic Fetch (Sub-Agent Pattern)

**Architecture:**

The agentic_fetch tool is implemented as a **sub-agent** - an autonomous AI agent that operates in a virtual sandbox to perform web research tasks.

- **Model**: xAI Grok-4-1-fast-reasoning
- **Pattern**: Recursive sub-agent (ChatAgent spawns Sub-Agent)

```
User → ChatAgent (Parent)
         ↓ (invokes agentic_fetch)
       Sub-Agent (with web_search, web_fetch, view, grep)
         ↓ (autonomous execution in virtual workspace /home/agent)
       Web Tools (DuckDuckGo, HTTP fetch, file operations)
```

**Virtual Workspace:**

- **Virtual Path**: `/home/agent` - made-up directory for the sub-agent (does NOT exist on host OS)
- **Actual Path**: Maps to OS temp directory (e.g., `/tmp/agents-sandbox-{timestamp}`)
- **Security**: All filesystem tools (view, grep, web-fetch) are strictly bounded to `/home/agent`
- **Cleanup**: Temp directory is automatically deleted when sub-agent completes

**Critical Security Note:**

`/home/agent` is a **virtual sandbox directory** - it does not exist on the host operating system. The sub-agent believes it's working in `/home/agent`, but all file operations are mapped to an actual OS temp directory. This is an implementation detail for sandboxing, not a real path on the filesystem.

**Sub-Agent Tools:**

1. **`web_search`** - DuckDuckGo web search to find information
2. **`web_fetch`** - Fetch web pages and convert to markdown
   - Saves large pages (>50KB) to virtual `/home/agent/` path
   - Returns virtual path for use with view/grep tools
3. **`view`** - Read file contents from virtual workspace
   - **Security**: Validates all paths, rejects access outside `/home/agent`
   - Only allows paths starting with `/home/agent` or relative paths
4. **`grep`** - Search within files for specific patterns
   - **Security**: Same path validation as view tool
   - Efficiently search large saved files

**Sub-Agent Capabilities:**

- Performs multiple searches in sequence
- Follows relevant links from search results
- Analyzes fetched content to answer questions
- Uses view/grep tools for efficient large-page analysis
- Returns structured responses with sources

**Tool Usage from ChatAgent:**

```typescript
// ChatAgent uses agentic_fetch as a simple tool
const { agentic_fetch } = tools;
await agentic_fetch({ prompt: "What are the main features of Python 3.12?" });
```

**Security Enforcement:**

All filesystem tools (view, grep, web-fetch) implement strict path validation:

- Only paths starting with `/home/agent` or relative paths are allowed
- Paths outside sandbox are rejected with "forbidden request" error
- Path traversal attempts (`../`, absolute paths) are blocked
- Virtual paths are mapped to actual OS temp directories
- No tool can bypass this validation (security-first design)