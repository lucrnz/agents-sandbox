# Plan: Add Tool Usage Tracking System

## Overview

Implement a comprehensive tool usage tracking system that persists tool executions to the database, enabling:
- Storage of all tool calls made by the ChatAgent (e.g., `agentic_fetch`, `web_search`, `web_fetch`)
- Hierarchical grouping of tool usages (parent tools like `agentic_fetch` group their sub-tool calls)
- Type-safe tool details with versioned Zod schemas for retrocompatibility
- UI rendering based on `toolId` with custom components per tool type

## Current State Analysis

### Architecture Overview

```
User Message
    ↓
CommandHandler (send_message)
    ↓
ChatOrchestrator.processUserMessage()
    ├── Creates assistant message (id: messageId)
    ├── Creates ChatAgent with callbacks
    │       ↓
    │   ChatAgent (ToolLoopAgent)
    │   └── Tool: agentic_fetch
    │           ↓
    │       SubAgent (ToolLoopAgent)
    │       └── Tools: web_search, web_fetch, view, grep
    │
    └── Emits WebSocket events on tool callbacks
```

### Key Files and Their Roles

| File | Role | Relevant Lines |
|------|------|----------------|
| `chat-orchestrator.ts` | Creates ChatAgent, handles callbacks, emits events | 110-154 |
| `chat-agent.ts` | Main agent with `agentic_fetch` tool | 49-69 |
| `agentic-fetch.ts` | Creates SubAgent, defines sub-agent tools | 119-143 |
| `sub-agent.ts` | Generic sub-agent with workspace isolation | 160-180 |
| `commands.ts` | WebSocket event schemas | 102-130 |
| `schema.ts` | Database tables (conversations, messages) | 1-18 |

### Current Tool Event Flow

1. **ChatOrchestrator** creates `ChatAgent` with callbacks (lines 110-154)
2. **onToolCall** fires → emits `AgentToolStartEvent` (only for `agentic_fetch`)
3. **onToolResult** fires → emits `AgentToolCompleteEvent` or `AgentToolErrorEvent`
4. **Sub-agent tools** (`web_search`, etc.) only log to console, no events emitted

### What's Missing

- **No persistence**: Tool events are only emitted via WebSocket, lost on page refresh
- **No messageId linkage**: Tool usages aren't linked to the assistant message
- **No hierarchical tracking**: Sub-agent tools aren't grouped under `agentic_fetch`
- **No tool usage IDs**: Events don't have unique identifiers for tracking
- **Limited sub-tool visibility**: Only `agentic_fetch` emits events, not its children

## Proposed Solution

### Database Schema Changes

**New `toolUsagesTable`:**

```typescript
export const toolUsagesTable = sqliteTable("tool_usages", {
  id: int("id").primaryKey({ autoIncrement: true }),
  messageId: int("message_id")
    .notNull()
    .references(() => messagesTable.id, { onDelete: "cascade" }),
  parentId: int("parent_id"),  // Self-reference: parent tool's id (for hierarchical grouping)
  toolId: text("tool_id").notNull(),  // Tool type identifier (e.g., "web_search", "web_fetch")
  toolArgs: text("tool_args"),  // JSON string of tool input arguments
  toolResult: text("tool_result"),  // JSON string of tool output (truncated if large)
  status: text("status").notNull(),   // 'pending' | 'success' | 'error'
  errorMessage: text("error_message"), // Optional error details
  startedAt: int("started_at", { mode: "timestamp" }),
  completedAt: int("completed_at", { mode: "timestamp" }),
});
```

### Updated Callback Signatures

**Current (no tracking):**
```typescript
onToolCall?: (toolName: string, args: any) => void;
onToolResult?: (toolName: string, result: any, error?: Error) => void;
```

**New (with tracking context):**
```typescript
interface ToolExecutionContext {
  messageId: number;
  parentToolUsageId?: number;  // Set when inside a parent tool like agentic_fetch
}

onToolCall?: (toolName: string, args: any, ctx: ToolExecutionContext) => Promise<number>;  // Returns toolUsageId
onToolResult?: (toolUsageId: number, result: any, error?: Error) => Promise<void>;
```

### Hierarchical Grouping Flow

**Example execution:**
```
User: "What's new in Python 3.12?"
    ↓
1. ChatOrchestrator creates message (messageId=42)
2. ChatAgent calls agentic_fetch
   → onToolCall("agentic_fetch", {...}, {messageId: 42})
   → Creates toolUsage record (id=100, messageId=42, parentId=null)
   → Returns toolUsageId=100
3. SubAgent executes:
   → onToolCall("web_search", {...}, {messageId: 42, parentToolUsageId: 100})
   → Creates toolUsage (id=101, messageId=42, parentId=100)
   → onToolResult(101, results)
   → onToolCall("web_fetch", {...}, {messageId: 42, parentToolUsageId: 100})
   → Creates toolUsage (id=102, messageId=42, parentId=100)
   → onToolResult(102, results)
4. agentic_fetch completes
   → onToolResult(100, finalResult)

Database state:
┌────┬───────────┬──────────┬───────────────┐
│ id │ messageId │ parentId │ toolId        │
├────┼───────────┼──────────┼───────────────┤
│100 │    42     │   null   │ agentic_fetch │
│101 │    42     │   100    │ web_search    │
│102 │    42     │   100    │ web_fetch     │
└────┴───────────┴──────────┴───────────────┘
```

### WebSocket Event Updates

**Add toolUsageId to events:**

```typescript
export const AgentToolStartEvent = registry.event(
  "agent_tool_start",
  z.object({
    toolUsageId: z.number(),  // NEW
    conversationId: z.string(),
    messageId: z.number(),  // NEW
    parentToolUsageId: z.number().optional(),  // NEW
    toolName: z.string(),
    toolArgs: z.any().optional(),  // NEW (sanitized)
    description: z.string().optional(),
    timestamp: z.string().datetime(),
  }),
);
```

## Implementation Steps

### Phase 1: Database Layer
- [ ] Add `toolUsagesTable` to `src/backend/db/schema.ts`
- [ ] Generate migration: `bunx drizzle-kit generate`
- [ ] Push migration: `bunx drizzle-kit push`
- [ ] Add query functions to `src/backend/db/queries.ts`:
  - [ ] `createToolUsage(messageId, toolId, args, parentId?)` → returns `toolUsageId`
  - [ ] `completeToolUsage(id, result, error?)` → updates status, result, completedAt
  - [ ] `getToolUsagesForMessage(messageId)` → returns all tool usages with hierarchy
  - [ ] `getToolUsagesForConversation(conversationId)` → returns all for conversation

### Phase 2: Update Callback System

- [ ] Create `src/backend/agent/tool-tracking-types.ts`:
  - [ ] `ToolExecutionContext` interface
  - [ ] Updated callback type definitions
  - [ ] Helper types for tool args/results

- [ ] Update `src/backend/agent/chat-agent.ts`:
  - [ ] Accept new callback signatures
  - [ ] Pass context to `onToolCall`, receive `toolUsageId`
  - [ ] Store `toolUsageId` to pass to `onToolResult`

- [ ] Update `src/backend/agent/sub-agent.ts`:
  - [ ] Accept `ToolExecutionContext` in constructor
  - [ ] Pass context (with `parentToolUsageId`) to tool callbacks

- [ ] Update `src/backend/agent/agentic-fetch.ts`:
  - [ ] Accept callbacks from parent agent
  - [ ] Propagate `parentToolUsageId` to SubAgent
  - [ ] Forward tool events to parent callbacks

### Phase 3: Orchestrator Integration

- [ ] Update `src/backend/services/chat-orchestrator.ts`:
  - [ ] Store `messageId` when creating assistant message (line 103)
  - [ ] Create tool usage records in `onToolCall` callback
  - [ ] Update tool usage records in `onToolResult` callback
  - [ ] Track active `parentToolUsageId` context for nested tools
  - [ ] Update WebSocket events to include new fields

### Phase 4: WebSocket Event Schema Updates

- [ ] Update `src/shared/commands.ts`:
  - [ ] Add `toolUsageId`, `messageId`, `parentToolUsageId` to `AgentToolStartEvent`
  - [ ] Add `toolUsageId` to `AgentToolCompleteEvent`
  - [ ] Add `toolUsageId` to `AgentToolErrorEvent`
  - [ ] Export new payload types

### Phase 5: Load Conversation with Tool Usages

- [ ] Update `LoadConversation` command response to include tool usages
- [ ] Update `src/backend/command-handlers.ts`:
  - [ ] Query tool usages when loading conversation
  - [ ] Include tool usages in response

### Phase 6: Frontend Display

- [ ] Update `src/frontend/pages/chat/chat-page.tsx`:
  - [ ] Store tool usages from `LoadConversation` response
  - [ ] Merge real-time tool events with stored data
  - [ ] Display tool usages inline with messages

- [ ] Create `src/frontend/components/tool-usage/`:
  - [ ] `tool-usage-list.tsx` - Container for tool usages on a message
  - [ ] `tool-usage-item.tsx` - Single tool usage display
  - [ ] `tool-usage-group.tsx` - Collapsible group for hierarchical tools

## Files to Modify

### New Files
- `src/backend/agent/tool-tracking-types.ts` - Type definitions for tool tracking
- `src/frontend/components/tool-usage/tool-usage-list.tsx`
- `src/frontend/components/tool-usage/tool-usage-item.tsx`
- `src/frontend/components/tool-usage/tool-usage-group.tsx`

### Modified Files
- `src/backend/db/schema.ts` - Add `toolUsagesTable`
- `src/backend/db/queries.ts` - Add tool usage query functions
- `src/backend/agent/chat-agent.ts` - Updated callback handling
- `src/backend/agent/sub-agent.ts` - Accept context, propagate parentId
- `src/backend/agent/agentic-fetch.ts` - Forward callbacks to SubAgent
- `src/backend/services/chat-orchestrator.ts` - Create/update tool usage records
- `src/backend/command-handlers.ts` - Include tool usages in LoadConversation
- `src/shared/commands.ts` - Update event schemas
- `src/frontend/pages/chat/chat-page.tsx` - Display tool usages

## Implementation Notes

### Async Tool Usage ID Flow

The key challenge is that `onToolCall` needs to create a DB record and return the ID synchronously to the AI SDK's `onStepFinish` callback. Since `onStepFinish` is async, this should work:

```typescript
// In chat-orchestrator.ts
onToolCall: async (toolName, args) => {
  const toolUsageId = await createToolUsage(
    aiMessage.id,
    toolName,
    JSON.stringify(args),
    currentParentToolUsageId
  );
  
  // Store for later use in onToolResult
  activeToolUsages.set(toolName, toolUsageId);
  
  // If this is a groupable tool, set it as parent for children
  if (toolName === 'agentic_fetch') {
    currentParentToolUsageId = toolUsageId;
  }
  
  this.emitEvent(AgentToolStartEvent.name, { toolUsageId, ... });
  return toolUsageId;
},
```

### Sub-Agent Tool Callback Propagation

The `agentic_fetch` tool needs to forward its callbacks to the SubAgent. This requires:

1. Accept callbacks in `createAgenticFetchTool(callbacks)`
2. Pass callbacks to SubAgent constructor
3. SubAgent wraps callbacks to add `parentToolUsageId`

```typescript
// In agentic-fetch.ts
export function createAgenticFetchTool(callbacks?: {
  onToolCall?: (toolName: string, args: any, parentId?: number) => Promise<number>;
  onToolResult?: (toolUsageId: number, result: any, error?: Error) => Promise<void>;
  parentToolUsageId?: number;
}) {
  // ...
}
```

### Truncating Large Results

Tool results (especially from `web_fetch`) can be very large. The `toolResult` column should store truncated/summarized versions:

```typescript
function truncateResult(result: any, maxLength = 1000): string {
  const str = typeof result === 'string' ? result : JSON.stringify(result);
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength) + '... [truncated]';
}
```

## Testing Strategy

1. **Unit tests** for query functions (`createToolUsage`, `completeToolUsage`, etc.)
2. **Integration test**: Send message that triggers `agentic_fetch`, verify:
   - Tool usages are created in DB
   - Hierarchy is correct (parentId relationships)
   - WebSocket events include correct `toolUsageId`
3. **E2E test**: Load conversation, verify tool usages appear in UI

## Post-Implementation Tasks (Future Enhancements)

- [ ] Add tool usage analytics (execution time per tool, success rates)
- [ ] Add ability to re-run failed tools from UI
- [ ] Export conversation with tool usage history (JSON/markdown)
- [ ] Add search/filter by tool type in conversation history
- [ ] Add tool result preview/expansion in UI
- [ ] Versioned Zod schemas for `toolArgs`/`toolResult` for type-safe rendering
