# Plan: Fix Agentic Fetch Status Display

## Overview

The UI is not showing real-time status updates when the AI agent uses the Agentic Fetch tool to search the web or browse URLs. Users should see messages like "Searching for {keywords}..." or "Browsing {page title}..." while the agent is working, before receiving the final response.

The root cause is that the AI SDK's `Experimental_Agent` class doesn't automatically emit events when tools are executed. The Agent executes tools in a loop, but the current implementation only tracks tool usage by parsing the agent's response text, which is unreliable and doesn't provide real-time feedback.

## Current State

### Backend Implementation Issues

1. **ChatAgent Configuration** (`src/backend/agent/chat-agent.ts`):
   - Uses AI SDK's `Experimental_Agent` class with the `agentic_fetch` tool
   - No mechanism to track tool execution in real-time
   - No hooks or callbacks to intercept tool calls/results
   - The `stream()` method returns a text stream, but tool execution happens internally without events

2. **Command Handler Implementation** (`src/backend/command-handlers.ts`):
   - Attempts to detect tool usage by parsing response chunks for keywords like "Successfully analyzed", "Found search results", etc.
   - This approach is fragile and unreliable - depends on the LLM's response format
   - Doesn't provide real-time status updates during tool execution
   - Status updates are inconsistent and often don't appear

3. **Agentic Fetch Tool** (`src/backend/agent/agentic-fetch.ts`):
   - Has a `generateStatusMessage()` helper function
   - Executes tools but doesn't emit status events
   - Returns tool results to the agent, but UI never sees intermediate status

### Frontend Implementation Issues

1. **Chat Page** (`src/frontend/pages/chat/chat-page.tsx`):
   - Has event handlers for `AgentToolStartEvent`, `AgentToolCompleteEvent`, `AgentToolErrorEvent`
   - Events are never actually emitted, so status messages never appear
   - Shows generic "Thinking..." message while the agent works
   - Tool status messages in the code commented as "for future use"

2. **WebSocket Event Schemas** (`src/shared/commands.ts`):
   - Event types `AgentToolStartEvent`, `AgentToolCompleteEvent`, `AgentToolErrorEvent` are defined
   - Includes proper TypeScript schemas for type safety
   - Events are never emitted from the backend

### Current Behavior

- Users send a message requiring web research
- The agent calls `agentic_fetch` tool internally
- UI shows "Thinking..." with no indication of tool usage
- After 2-5 seconds, the agent returns a complete answer
- User never knows if/what web searches were performed
- No transparency into agent's information gathering process

### Expected Behavior

- Users send a message requiring web research
- UI immediately shows: "Searching for {keywords}..."
- If browsing URLs: "Browsing {page title}..."
- Agent receives search results and browsing data BEFORE generating final answer
- Agent incorporates findings into response
- User sees transparent process of how information was gathered

## Proposed Solution

Use the AI SDK's `prepareStep` callback to intercept tool execution and emit WebSocket events in real-time. The `prepareStep` callback runs before each step in the agent loop and provides access to all previous steps, including tool calls and results.

### Architecture

1. **Modify ChatAgent** to accept callbacks for tool events
2. **Add prepareStep callback** to track tool calls and results
3. **Update command handler** to pass WebSocket context and emit events
4. **Tool execution flow**:
   - Agent generates tool call → `prepareStep` detects it → emit `agent_tool_start` event
   - Agent executes tool → gets result → `prepareStep` detects result → emit `agent_tool_complete` event
   - Agent generates final response → streamed to UI
   - UI shows status messages from events alongside the response

### Key Technical Details

- `prepareStep` runs before each step, receives `{ stepNumber, messages, steps }`
- Access `steps[steps.length - 1]` to get the last step's tool calls/results
- Tool calls appear in `step.toolCalls` when the agent decides to use a tool
- Tool results appear in `step.toolResults` after the tool executes
- Both arrays can contain multiple items (agent could call multiple tools)
- Need to track state to know when we've already handled a tool call/result

## Implementation Steps

### Phase 1: Update ChatAgent Class

- [x] Modify `ChatAgent` constructor to accept optional callbacks:
  - `onToolCall?(toolName: string, args: any): void`
  - `onToolResult?(toolName: string, result: any, error?: Error): void`
- [x] Add `prepareStep` callback to `Agent` configuration
- [x] In `prepareStep`, check the last step for tool calls and results
- [x] Call appropriate callbacks when tool calls/results are detected
- [x] Import necessary types: `PrepareStepParams` from 'ai'

### Phase 2: Update Command Handler

- [x] Modify `command-handlers.ts` to import the status generation functions:
  - `generateStatusMessage` from `./agent/agentic-fetch.js`
- [x] Update `SendMessage` handler to pass callbacks to `ChatAgent`
- [x] Create `emitToolEvent` helper function to send WebSocket events
- [x] In `onToolCall` callback:
  - Generate status message from tool arguments
  - Create `AgentToolStartEvent` message
  - Send via WebSocket to client
- [x] In `onToolResult` callback:
  - Create `AgentToolCompleteEvent` (or `AgentToolErrorEvent` if error)
  - Send via WebSocket to client

### Phase 3: Enhance Status Messages

- [x] Improve `generateStatusMessage` in `agentic-fetch.ts`:
  - For search: extract keywords and show "Searching for {keywords}..."
  - For URL browsing: extract domain or page title and show "Browsing {title/domain}..."
  - Use `inferPageTitle` function from `title-generation.ts`
- [x] Add helper function to extract search keywords from tool arguments
- [x] Ensure status messages are concise and informative

### Phase 4: Update Frontend Event Handling

- [ ] Verify `chat-page.tsx` already has event handlers (it does)
- [ ] Test that status messages appear correctly
- [ ] Ensure tool status messages don't duplicate with response chunks
- [ ] Check that status clears appropriately after tool completion

### Phase 5: Testing and Verification

- [ ] Test with queries requiring web search (no URL)
- [ ] Test with queries requiring specific URL browsing
- [ ] Test error scenarios (failed search, invalid URL)
- [ ] Verify status messages appear immediately when tools are called
- [ ] Verify status messages clear when tools complete
- [ ] Test with multiple sequential tool calls
- [ ] Verify Agent receives tool results before final response

## Files to Modify

### Backend Files

1. **src/backend/agent/chat-agent.ts**
   - Add constructor parameters for callbacks
   - Implement `prepareStep` callback
   - Track tool calls and results

2. **src/backend/command-handlers.ts**
   - Import status generation functions
   - Pass callbacks to `ChatAgent`
   - Emit WebSocket events for tool status

3. **src/backend/agent/agentic-fetch.ts**
   - Enhance `generateStatusMessage` function
   - Add helpers for extracting keywords/titles
   - Ensure tool returns proper metadata

### Frontend Files

1. **src/frontend/pages/chat/chat-page.tsx**
   - Verify event handlers work correctly
   - May need minor adjustments to message ordering

### Shared Files

1. **src/shared/commands.ts** (already done)
   - Events are already defined
   - Schemas are in place
   - No changes needed

## Testing Strategy

### Unit Tests

1. Test `generateStatusMessage` with various inputs:
   - Search queries with keywords
   - Search queries without extractable keywords
   - URL browsing
   - Edge cases (empty strings, special characters)

2. Test `prepareStep` callback:
   - Detects tool calls correctly
   - Detects tool results correctly
   - Handles errors appropriately
   - Only triggers callbacks once per call/result

### Integration Tests

1. Test full flow with web search:
   - Send message requiring search
   - Verify `agent_tool_start` event is emitted
   - Verify status message appears in UI
   - Verify `agent_tool_complete` event is emitted
   - Verify final response includes search results

2. Test full flow with URL browsing:
   - Send message with URL requirement
   - Verify "Browsing" status appears
   - Verify tool completes successfully
   - Verify UI shows completion status

3. Test error handling:
   - Simulate failed tool execution
   - Verify `agent_tool_error` event is emitted
   - Verify error is handled gracefully

### Manual Testing Scenarios

1. "What is the weather in Tokyo?" (should trigger web search)
2. "Summarize https://example.com/article" (should browse specific URL)
3. "Research machine learning trends 2025" (complex search)
4. Invalid queries to test error handling

### Verification Checklist

- [ ] Status messages appear immediately when tool is called
- [ ] Status messages accurately describe the action
- [ ] Status messages clear after tool completion
- [ ] Agent receives and uses tool results in final response
- [ ] No duplicate or stale status messages
- [ ] Error states are handled gracefully
- [ ] UI remains responsive during tool execution

## Potential Risks

### 1. Performance Impact

**Risk:** Adding callbacks and event emission may slow down tool execution

**Mitigation:**
- Minimal logic in `prepareStep` callback
- Async event emission (non-blocking)
- Avoid heavy computations in status generation

### 2. Race Conditions

**Risk:** Events may arrive out of order or duplicate

**Mitigation:**
- Track processed tool call IDs
- Use conversation-scoped state
- Buffer events if necessary

### 3. Unhandled Tool States

**Risk:** Not all tool execution paths are covered

**Mitigation:**
- Comprehensive testing of all tool states
- Handle both streaming and complete tool calls
- Log warnings for unexpected states

### 4. UI Message Ordering

**Risk:** Status messages may appear after final response

**Mitigation:**
- Ensure timestamps are set correctly
- Frontend handles messages with proper ordering
- Use message IDs if reordering is needed

### 5. Agent Not Receiving Results

**Risk:** Tool results not properly forwarded to agent

**Mitigation:**
- Verify AI SDK handles result passing correctly
- Check that `prepareStep` returns `{}` to continue
- Test with verbose logging to confirm data flow

## Dependencies

No new external dependencies are required. The implementation uses:

- Existing AI SDK Agent class
- Existing WebSocket infrastructure
- Already-defined event schemas
- Existing tool implementations

## Estimated Implementation Time

- **Phase 1 (ChatAgent):** 30 minutes
- **Phase 2 (Command Handler):** 45 minutes
- **Phase 3 (Status Messages):** 30 minutes
- **Phase 4 (Frontend):** 15 minutes
- **Testing:** 1 hour
- **Total:** ~3 hours

## Success Criteria

1. Users see "Searching for {keywords}..." when agent performs web search
2. Users see "Browsing {title}..." when agent visits a URL
3. Status messages appear immediately when tool execution starts
4. Status messages clear when tool execution completes
5. Tool results are incorporated into agent's response (already working)
6. No significant performance degradation
7. All tests pass
8. Manual testing scenarios work as expected
