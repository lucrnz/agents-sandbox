## Project Overview

"Super Chat" - A multi-modal AI chat application that enables conversational AI interactions with advanced tools including web research, filesystem operations, and code execution.

## Documentation Structure

### Root Directory Markdown Files

The root directory contains these primary markdown files:

1. **AGENTS.md** - This file. Main documentation for AI agents working in this codebase
2. **README.md** - Human-readable project overview and user-facing documentation
3. **CLAUDE.md** - Symbolic link for Claude Code
4. **GEMINI.md** - Symbolic link for Antigravity and Gemini CLI

### CLAUDE.md

**CLAUDE.md** is exclusively for the Claude Code CLI tool. It must always be a **symbolic link** to AGENTS.md, not a separate file:

**Never** edit CLAUDE.md directly - it should always point to AGENTS.md so both human and AI agents see consistent documentation.

### GEMINI.md

**GEMINI.md** is for **Antigravity** and for the **Gemini CLI** tool. Like CLAUDE.md, it must always be a **symbolic link** to AGENTS.md, not a separate file:

**Never** edit GEMINI.md directly - it should always point to AGENTS.md so both human and AI agents see consistent documentation.

### Documentation for Non-Humans

All documentation intended for AI agents (implementation guides, architecture decisions, procedures) must live in the `.llm/docs/` directory, not in the root or other locations.

**Examples:**

- `.llm/docs/IMPLEMENTATION_GUIDES.md` - Technical implementation details for agents
- `.llm/docs/ARCHITECTURE_DECISIONS.md` - Architecture rationale and decisions
- `.llm/docs/DEPLOYMENT_PROCEDURES.md` - Deployment and operational procedures

**Keep the root clean** - Only AGENTS.md, README.md, and the CLAUDE.md/GEMINI.md symlinks belong in the root directory.

## Implementation Plans

IMPORTANT: If the user didn't ask for a plan, do not create it.

Plans break down large tasks into executable steps with clear context, affected files, testing strategies, and potential risks.

Quick Reference:

- **Create plan:** `.llm/plans/PLAN_YYYYMMdd_DESCRIPTION.md`
- **Execute:** Follow steps sequentially, mark completed with `[x]`
- **Complete:** Move to `.llm/plans/done/` when finished

See `.llm/plans/README_TO_UNDERSTAND_HOW_TO_USE_PLANS.md` for complete guidelines on when to create plans, naming conventions, structure, and workflow.

## Development Commands

### Core Commands

- **Development server**: `bun --hot src/backend/index.ts` or `bun run dev`
- **Production server**: `NODE_ENV=production bun src/backend/index.ts` or `bun run start`
- **Build**: `bun run build.ts` (with optional flags: `--outdir`, `--minify`, `--sourcemap`, etc.)
- **Type checking**: `bunx tsc --noEmit` or `bun run typecheck`
- **Install dependencies**: `bun install`

### Build Script Options

```sh
bun run build.ts --outdir=dist --minify --sourcemap=linked --external=react,react-dom
```

## Technology Stack

### Backend Framework

- **Bun runtime** - Full Stack JavaScript runtime (alternative to Node.js)
- **Bun.serve()** - Built-in HTTP/WebSocket server (no Express)
- **Drizzle ORM** - SQLite database with `bun:sqlite`
- **AI SDK** - xAI (Grok) + Mistral (3B) integration
- **Agent Tools** - Built-in deep research with web search capabilities

### Frontend Framework

- **React 19** - Latest React with TypeScript
- **Wouter** - Lightweight client-side routing (~2KB)
- **Tailwind CSS v4** - Utility-first CSS framework
- **Radix UI** - Headless UI components (Button, Select, Label, Slot)
- **React Markdown** - Markdown rendering with GFM support
- **Custom UI Components** - shadcn/ui style components in `src/frontend/components/ui/`

### Key Differences from Standard React

- **No Vite/Webpack** - Bun's native bundler handles everything
- **HTML imports** - Import `.tsx`, `.jsx`, `.css` files directly in HTML
- **Hot Module Replacement** - Built into Bun's dev server
- **Environment variables** - Auto-loaded from `.env`, no dotenv needed

## WebSocket Command System

### Architecture

The app uses a typed WebSocket command system for client-server communication:

1. **Commands** (Client → Server → Client)
   - `send_message` - Send chat message, get AI response
   - `load_conversation` - Load existing or create new conversation
   - `get_conversations` - List all conversations

2. **Events** (Server → Client, fire-and-forget)
   - `ai_response` - AI response stream complete
   - `conversation_updated` - Conversation metadata changed
   - `system_notification` - System status messages
   - `agent_tool_start/complete/error` - Agent tool execution status

### Adding New Commands

1. **Define command in `src/shared/commands.ts`:**

```typescript
export const MyCommand = registry.command(
  "my_command",
  z.object({
    /* request schema */
  }),
  z.object({
    /* response schema */
  }),
);
```

1. **Register handler in `src/backend/command-handlers.ts`:**

```typescript
commandHandlers.register(MyCommand, async (payload, context) => {
  const { ws, conversationId } = context;
  // Implementation
  return {
    /* response */
  };
});
```

1. **Use in frontend with WebSocket hook:**

```typescript
const { sendCommand } = useWebSocket();
const result = await sendCommand("my_command", {
  /* payload */
});
```

## Database Schema

### Tables

**conversations**

```typescript
{
  id: string (primary key)
  title: string
  createdAt: Date
  updatedAt: Date
}
```

**messages**

```typescript
{
  id: number (primary key, auto-increment)
  conversationId: string (foreign key)
  role: "user" | "assistant"
  content: string
  createdAt: Date
}
```

### Database Commands

```sh
# Generate migrations
bunx drizzle-kit generate

# Push schema changes (dev)
bunx drizzle-kit push

# Studio (GUI for database)
bunx drizzle-kit studio
```

## AI Agent System

Read the [AI Agent System Documentation](.llm/docs/AI_AGENT_SYSTEM_DOCUMENTATION.md) to understand the current architecture and implementation of the AI Agent System.

## Frontend Patterns

### Component Structure

- **UI Components**: Use `class-variance-authority` (cva) for variants
- **Styling**: Tailwind CSS with `tailwind-merge` and `clsx`
- **Radix UI**: Headless components with custom styling. **DO NOT use Radix UI primitives directly**; always use the pre-built shadcn/ui components in `src/frontend/components/ui/`.
- **Icons**: Lucide React icons

### Adding shadcn Components

To add a new shadcn component, use the `shadcn` CLI via `bunx`. The `--bun` flag is crucial to ensure it uses the Bun runtime.

Browse the [available components catalog](https://ui.shadcn.com/docs/components) to find the correct component name.

```bash
bunx --bun shadcn@latest add [component-name]
```

Example:

```bash
bunx --bun shadcn@latest add accordion
```

### Example Component (`button.tsx`)

```typescript
const buttonVariants = cva("base-classes", {
  variants: { variant: { ... }, size: { ... } },
  defaultVariants: { variant: "default", size: "default" }
});

function Button({ className, variant, size, asChild, ...props }) {
  const Comp = asChild ? Slot : "button";
  return <Comp className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}
```

### Routing with Wouter

```typescript
import { Route, Switch, Link } from "wouter";

<Switch>
  <Route path="/" component={Home} />
  <Route path="/chat" component={Chat} />
  <Route path="*" component={NotFound} />
</Switch>

<Link href="/chat">Go to Chat</Link>
```

### WebSocket Hook Pattern

```typescript
const { sendCommand, sendEvent, lastMessage, readyState } = useWebSocket();
```

## Environment Variables

Create `.env` file (copy from `.env.example`):

```bash
# AI API Keys
XAI_API_KEY=your_xai_api_key_here
MISTRAL_API_KEY=your_mistral_api_key_here

# Database
DB_FILE_NAME=sqlite.db

# Optional: Server config
PORT=3000
HOST=localhost

# Debug Mode
DEBUG=true
```

When `DEBUG=true`, deep research requests generate detailed markdown files in the `.debug/` directory containing search results, URL analysis data, and execution details for debugging purposes.

## TypeScript Configuration

**Key Settings:**

- `target: "ESNext"`, `module: "Preserve"`, `jsx: "react-jsx"`
- `moduleResolution: "bundler"` with `allowImportingTsExtensions: true`
- `baseUrl: "."` with path mapping `@/*` → `./src/*`
- Strict mode enabled with additional checks

**Import Path Convention:**

Always use path aliases (`@/`) instead of relative imports, unless the file is in the same directory:

```typescript
// ✅ Good - use path aliases for cross-directory imports
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";
import { ChatAgent } from "@/backend/agent/chat-agent";

// ✅ Good - relative imports allowed for same-directory files
import { schema } from "./schema";
import type { LocalType } from "./types";

// ❌ Bad - don't use relative imports across directories
import { Button } from "../../components/ui/button";
import { cn } from "../lib/utils";
```

## Unit Testing

### Test Stack

- **Bun Test Runner** - Bun's built-in Jest-compatible test runner
- **happy-dom** - Lightweight DOM implementation for headless browser testing
- **React Testing Library** - DOM testing utilities for React components

### Running Tests

```bash
# Run all tests
bun test

# Run tests in watch mode
bun test --watch

# Run specific test file
bun test ./path/to/test.test.tsx

# Run tests matching a pattern
bun test --test-name-pattern "button"
```

### Writing Component Tests

When testing React components, import from `bun:test` and use React Testing Library:

```typescript
/// <reference lib="dom" />

import { test, expect, describe } from "bun:test";
import { render, screen } from "@testing-library/react";

// Example component test
describe("Button component", () => {
  test("renders with correct text", () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole("button")).toHaveTextContent("Click me");
  });

  test("calls onClick handler when clicked", async () => {
    const handleClick = mock(() => {});
    render(<Button onClick={handleClick}>Click me</Button>);

    await screen.getByRole("button").click();
    expect(handleClick).toHaveBeenCalled();
  });
});
```

### Test Documentation

For detailed API reference and examples, see the [Bun test documentation](./node_modules/bun-types/docs/test/index.mdx)

### Time Mocking

Bun uses `setSystemTime` instead of Jest's `useFakeTimers()`. Import it directly from `bun:test`:

```typescript
import { setSystemTime } from "bun:test";

setSystemTime(new Date("2024-01-01T12:00:00.000Z")); // Set mock time
setSystemTime(); // Reset to real time
```

**Note:** This only mocks `Date.now()` and `new Date()`, not `setTimeout`/`setInterval`.

For detailed patterns and workarounds, see [`.llm/docs/BUN_TESTS_TIME_MOCKING_README_INSTEAD_OF_USING_JEST_FAKE_TIMERS.md`](./.llm/docs/BUN_TESTS_TIME_MOCKING_README_INSTEAD_OF_USING_JEST_FAKE_TIMERS.md).

### Unit Tests Final Remarks

- DO NOT install jsdom
- DO NOT install jest
- DO NOT use `jest.useFakeTimers()` - use `setSystemTime` from `bun:test` instead

## Integration Testing

For comprehensive integration testing patterns including WebSocket testing, database testing with Drizzle ORM, mocking strategies, and CI/CD configuration, see the [Bun Integration Testing Guide](./.llm/docs/BUN_INTEGRATION_TESTING_GUIDE.md).

### Go Library FFI Integration Test

The file `src/backend/go-lib-ffi.integration.test.ts` tests the actual `.dylib` library (not mocks) to verify real FFI behavior:

```bash
# Build the Go library first
cd go-lib-ffi && make build && cd ..

# Run integration tests
bun test go-lib-ffi.integration.test.ts
```

**Key features:**

- Uses `describe.skipIf(!libExists)` to gracefully skip when `.dylib` is not built
- Tests all FFI functions: `cleanHTML`, `convertToMarkdown`, `parseSearchResults`, `stripMarkdown`, `getVersion`
- Validates library loading and singleton pattern

## Go Library FFI (`go-lib-ffi/`)

### Overview

High-performance Go library that provides HTML processing, HTML-to-markdown conversion, and search result parsing via FFI (Foreign Function Interface).

**Performance improvements:**

- 2-5x faster HTML processing
- 50-70% less memory usage for large documents

### Location

- **Source code**: `go-lib-ffi/` (Go implementation)
- **FFI bindings**: `src/backend/agent/go-lib-ffi.ts` (TypeScript wrapper)
- **Build integration**: `build.ts` (automatically builds with app)

### Functions

The Go library provides these functions (callable from TypeScript):

- **`CleanHTML(html: string): string`** - Remove noisy elements (script, style, nav, etc.)
- **`ConvertHTMLToMarkdown(html: string): string`** - Convert HTML to markdown
- **`ParseSearchResults(html: string, maxResults: number): SearchResult[]`** - Parse DuckDuckGo results
- **`GetLibraryVersion(): string`** - Get library version

### Building

The library is automatically built when running the main build:

```bash
bun run build.ts  # Builds Go library + TypeScript app
```

Manual build commands:

```bash
cd go-lib-ffi
make build        # Build for current platform
make build-all    # Build for all platforms (Linux, macOS, Windows)
make clean        # Remove build artifacts
```

### Dependencies

- Go 1.21+ required
- External Go packages:
  - `github.com/JohannesKaufmann/html-to-markdown/v2` - HTML to markdown conversion
  - `golang.org/x/net/html` - HTML parsing and DOM manipulation

## Important Gotchas

- **Don't start server unless explicitly asked** - The backend server should only be started when the user requests it

- **Bun vs Node.js** - Always use Bun commands, not Node.js equivalents
  - ✅ `bun --hot src/backend/index.ts`
  - ❌ `node src/backend/index.ts`
  - ✅ `bun install`
  - ❌ `npm install`

- **Hot reloading** - Bun HMR preserves `import.meta.hot.data` between reloads

- **WebSocket context** - WebSocket data (`ws.data.conversationId`) persists per connection

- **Async generators** - AI responses use async generators for streaming: `async* generateResponse()`

- **Schema validation** - All WebSocket messages validated with Zod schemas

- **Database migrations** - Use Drizzle Kit, manual schema updates in `src/backend/db/schema.ts`

- **better-sqlite3** - Only used by drizzle-kit CLI tools. Never use as a database connector - the app uses `bun:sqlite` instead.

- **Agent status detection** - Frontend detects agent tool usage via keyword matching in response chunks

- **Component variants** - Use cva for component variants, never duplicate class strings

- **CSS imports** - Import CSS directly in TSX files, Bun handles bundling

- **UI Components** - **NEVER** install or use Radix UI primitives directly (e.g., `@radix-ui/react-dialog`). **ALWAYS** use the corresponding shadcn/ui component (e.g., `src/frontend/components/ui/dialog.tsx`). If a component is missing, ask the user to add it.

## Debugging Tips

### Backend

- Console logs prefixed with `[COMMAND_HANDLER]`, `[CHAT_AGENT]`, etc.
- WebSocket messages logged for debugging
- AI tool execution status updates streamed

### Frontend

- React DevTools supported
- WebSocket connection state in `useWebSocket` hook
- Component hot reloading preserves state when possible

### Database

- SQLite DB file location in `.env` (`DB_FILE_NAME`)
- Use Drizzle Studio for GUI inspection: `bunx drizzle-kit studio`
- All queries in `src/backend/db/queries.ts`
