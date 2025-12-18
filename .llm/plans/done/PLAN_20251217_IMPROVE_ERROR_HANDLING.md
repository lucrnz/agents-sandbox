# Plan: Implement Error Handling for Sub-Agents and Chat Agent

## Overview

Implement differentiated error handling where sub-agents (like agentic_fetch) return failure messages to continue the conversation, while Chat Agent errors stop the execution and show a retry button to the user.

## Current State

- Both sub-agent and Chat Agent errors crash the current execution
- No clear distinction between recoverable tool errors and critical agent errors
- Users have no way to retry failed requests without re-typing their message
- Error messages are not user-friendly

## Proposed Solution

Implement a two-tier error handling system:

1. **Sub-Agent Errors** (Tool Level): 
   - Catch and return error messages as tool results
   - Allow Chat Agent to continue processing with error context
   - Use structured error responses with retry suggestions

2. **Chat Agent Errors** (Agent Level):
   - Stop execution immediately
   - Send special error event to frontend
   - Display retry button that resends the last user message
   - Show user-friendly error message

## Implementation Steps

- [x] Analyze current error flow in agentic-fetch.ts and chat-agent.ts
- [x] Define error types and interfaces for structured error handling
- [x] Update sub-agent tools to catch errors and return structured error messages
- [x] Implement Chat Agent error boundary that stops execution on critical errors
- [x] Add new WebSocket event for agent-level errors
- [x] Update frontend to handle error events and display retry UI
- [x] Implement retry functionality that resends the last user prompt
- [x] Add error classification to distinguish recoverable vs critical errors
- [x] Update error logging for better debugging

## Files to Modify

- `src/backend/agent/chat-agent.ts` - Add error boundary and critical error handling
- `src/backend/agent/agentic-fetch.ts` - Improve error handling to return results instead of throwing
- `src/backend/command-handlers.ts` - Handle agent-level errors and create error events
- `src/shared/commands.ts` - Add new error event schema
- `src/shared/websocket-schemas.ts` - Add error message types
- `src/frontend/hooks/useWebSocket.ts` - Handle error events
- `src/frontend/pages/chat/` - Add error UI with retry button

## Testing Strategy

- Test sub-agent failures (e.g., network errors) return proper error messages
- Test Chat Agent critical errors stop execution and show retry UI
- Verify retry button resends the exact same prompt
- Test error classification works correctly
- Verify error messages are user-friendly
- Test error recovery flow end-to-end

## Potential Risks

- Breaking existing error handling in other tools
- Frontend error states might not clear properly on retry
- Error classification could misclassify recoverable errors
- Retry might cause infinite loops if the same error persists

## Rollback Plan

- Revert to original error handling by removing error boundary
- Remove new WebSocket events and UI components
- Restore original tool error throwing behavior

## New Error Types to Implement

```typescript
// Tool-level errors (recoverable)
interface ToolErrorResult {
  type: "tool_error";
  tool: string;
  message: string;
  canRetry: boolean;
  retrySuggestion?: string;
}

// Agent-level errors (critical)
interface AgentError {
  type: "agent_error";
  message: string;
  originalError?: string;
  requiresRestart: boolean;
}
```