## Project Overview

"AI Command Center" - A meta-app designed as a controlled sandbox for training AI agents to interact with UI elements. A simulated digital environment where agents learn multi-step reasoning, action planning, and tool use in a safe, predictable space.

## Documentation Structure (IMPORTANT)

### Root Directory Markdown Files
The root directory must contain **ONLY TWO** markdown files:

1. **AGENTS.md** - This file. Main documentation for AI agents working in this codebase
2. **README.md** - Human-readable project overview and user-facing documentation

### CLAUDE.md
**CLAUDE.md** is exclusively for the Claude Code CLI tool. It must always be a **symbolic link** to AGENTS.md, not a separate file:

```bash
# Create the symbolic link (if not already present)
ln -s AGENTS.md CLAUDE.md
```

**Never** edit CLAUDE.md directly - it should always point to AGENTS.md so both human and AI agents see consistent documentation.

### Documentation for Non-Humans
All documentation intended for AI agents (implementation guides, architecture decisions, procedures) must live in the `.llm/docs/` directory, not in the root or other locations.

**Examples:**
- `.llm/docs/IMPLEMENTATION_GUIDES.md` - Technical implementation details for agents
- `.llm/docs/ARCHITECTURE_DECISIONS.md` - Architecture rationale and decisions  
- `.llm/docs/DEPLOYMENT_PROCEDURES.md` - Deployment and operational procedures

**Keep the root clean** - Only AGENTS.md, README.md, and the CLAUDE.md symlink belong in the root directory.

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
- **AI SDK** - xAI (Grok) + OpenRouter integration
- **Agent Tools** - Built-in agentic fetch with web search capabilities

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

## Code Organization

```
src/
├── backend/                    # Server-side code
│   ├── index.ts               # Main server entry point
│   ├── command-handlers.ts    # WebSocket command handlers
│   ├── agent/                 # AI agent implementations
│   │   ├── chat-agent.ts      # Main chat agent with xAI/Grok
│   │   ├── agentic-fetch.ts   # Web search/browsing tool
│   │   ├── title-generation.ts # Conversation title generation
│   │   ├── model-config.ts    # AI model configurations
│   │   └── web-tools.ts       # Web scraping utilities
│   └── db/                    # Database layer
│       ├── index.ts           # Database connection
│       ├── schema.ts          # Drizzle schema definitions
│       ├── queries.ts         # Database query functions
│       └── migrate.ts         # Database migrations
├── frontend/                  # Client-side React app
│   ├── app.tsx                # Main app component with routing
│   ├── frontend.tsx           # React DOM render entry
│   ├── index.html             # HTML template
│   ├── pages/                 # Route pages
│   │   ├── home/              # Home page
│   │   ├── chat/              # Chat interface
│   │   └── not-found/         # 404 page
│   ├── components/            # Reusable React components
│   │   ├── ui/                # shadcn/ui style components
│   │   ├── conversation-sidebar.tsx
│   │   └── markdown-renderer.tsx
│   ├── hooks/                 # Custom React hooks
│   │   └── useWebSocket.ts    # WebSocket connection hook
│   ├── lib/                   # Frontend utilities
│   │   └── utils.ts           # Shared utilities (cn, etc.)
│   ├── sandbox/               # Sandbox apps for agent training
│   │   └── todo-app/          # Example sandbox app
│   └── globals.css            # Global styles
└── shared/                    # Shared between frontend/backend
    ├── command-system.ts      # WebSocket message schemas & types
    ├── commands.ts            # Command/event definitions
    └── websocket-schemas.ts   # (Legacy) WebSocket schemas
```

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
  z.object({ /* request schema */ }),
  z.object({ /* response schema */ })
);
```

2. **Register handler in `src/backend/command-handlers.ts`:**
```typescript
commandHandlers.register(MyCommand, async (payload, context) => {
  const { ws, conversationId } = context;
  // Implementation
  return { /* response */ };
});
```

3. **Use in frontend with WebSocket hook:**
```typescript
const { sendCommand } = useWebSocket();
const result = await sendCommand("my_command", { /* payload */ });
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

### Chat Agent (`src/backend/agent/chat-agent.ts`)
- **Model**: xAI Grok-4-1-fast-reasoning
- **Capabilities**: Natural language processing, web search, content analysis
- **Tools**: `agentic_fetch` for web browsing/search
- **Streaming**: Real-time response streaming with status updates

### Agentic Fetch Tool
- **Search**: DuckDuckGo web search
- **Browse**: Web page content extraction
- **Status**: Real-time status updates during tool execution
- **Integration**: Automatic tool invocation based on user queries

## Frontend Patterns

### Component Structure
- **UI Components**: Use `class-variance-authority` (cva) for variants
- **Styling**: Tailwind CSS with `tailwind-merge` and `clsx`
- **Radix UI**: Headless components with custom styling
- **Icons**: Lucide React icons

### Example Component (`button.tsx`):
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
OPENROUTER_API_KEY=your_openrouter_api_key_here

# Database
DB_FILE_NAME=sqlite.db

# Optional: Server config
PORT=3000
HOST=localhost
```

## TypeScript Configuration

**Key Settings:**
- `target: "ESNext"`, `module: "Preserve"`, `jsx: "react-jsx"`
- `moduleResolution: "bundler"` with `allowImportingTsExtensions: true`
- `baseUrl: "."` with path mapping `@/*` → `./src/*`
- Strict mode enabled with additional checks

**Import Path Convention:**
```typescript
import { Button } from "@/frontend/components/ui/button";
import { cn } from "@/frontend/lib/utils";
```

## Testing

No test suite currently configured. When adding tests:
- Use `bun test` (Bun's built-in test runner)
- Import from `bun:test` (not jest/vitest)

## Important Gotchas

1. **Don't start server unless explicitly asked** - The backend server should only be started when the user requests it

2. **Bun vs Node.js** - Always use Bun commands, not Node.js equivalents
   - ✅ `bun --hot src/backend/index.ts`
   - ❌ `node src/backend/index.ts`
   - ✅ `bun install`
   - ❌ `npm install`

3. **Hot reloading** - Bun HMR preserves `import.meta.hot.data` between reloads

4. **WebSocket context** - WebSocket data (`ws.data.conversationId`) persists per connection

5. **Async generators** - AI responses use async generators for streaming: `async* generateResponse()`

6. **Schema validation** - All WebSocket messages validated with Zod schemas

7. **Database migrations** - Use Drizzle Kit, manual schema updates in `src/backend/db/schema.ts`

8. **Agent status detection** - Frontend detects agent tool usage via keyword matching in response chunks

9. **Component variants** - Use cva for component variants, never duplicate class strings

10. **CSS imports** - Import CSS directly in TSX files, Bun handles bundling

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
