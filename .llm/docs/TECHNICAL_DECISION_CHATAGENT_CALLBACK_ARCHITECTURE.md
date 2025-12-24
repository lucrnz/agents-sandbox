# Technical Decision: ChatAgent Callback Architecture

**Date:** December 23, 2025  
**Status:** DECIDED - No Refactoring Required  
**Category:** Architecture  

---

## Summary

After analysis, we decided **NOT** to refactor the `ChatAgent` callback-based event system to a more generic event emitter or subscription pattern. The current implementation is appropriate for the project's scope and requirements.

---

## Issue Raised

**Report:** Abstraction Leak in ChatAgent Callbacks  
**Location:** `src/backend/agent/chat-agent.ts:11-13`

The `ChatAgent` explicitly defines callbacks for tool calls and results. This was flagged as potentially coupling the agent to the orchestrator's event system rather than using a more generic event emitter or subscription pattern.

---

## Current Implementation

### ChatAgent Constructor

```typescript
// src/backend/agent/chat-agent.ts
export class ChatAgent {
  private params?: {
    onToolCall?: (toolName: string, args: any) => void;
    onToolResult?: (toolName: string, result: any, error?: Error) => void;
    onCriticalError?: (error: Error, originalError?: string) => void;
  };

  constructor(params?: {
    onToolCall?: (toolName: string, args: any) => void;
    onToolResult?: (toolName: string, result: any, error?: Error) => void;
    onCriticalError?: (error: Error, originalError?: string) => void;
  }) {
    this.params = params;
    // ... initialization
  }
}
```

### Orchestrator Usage

```typescript
// src/backend/services/chat-orchestrator.ts
const agent = new ChatAgent({
  onToolCall: (toolName, args) => {
    // Emit WebSocket event for tool start
    this.emitEvent(AgentToolStartEvent.name, { ... });
  },
  onToolResult: (toolName, result, error) => {
    // Emit WebSocket event for tool completion/error
    if (error) {
      this.emitEvent(AgentToolErrorEvent.name, { ... });
    } else {
      this.emitEvent(AgentToolCompleteEvent.name, { ... });
    }
  },
  onCriticalError: (error, originalError) => {
    // Emit WebSocket event for critical errors
    this.emitEvent(ChatAgentErrorEvent.name, { ... });
  },
});
```

### Key Observations

1. **Single Consumer:** `ChatAgent` is instantiated in exactly **one location** - the `ChatOrchestrator`
2. **Generic Signatures:** Callbacks use generic types (`toolName: string, args: any`) with no WebSocket-specific semantics
3. **Dependency Injection:** The agent receives callbacks; it doesn't reach out to external systems
4. **Unidirectional Flow:** Information flows agent → callback with no back-pressure

---

## Analysis

### Arguments FOR Refactoring to Event Emitter

| Argument | Explanation |
|----------|-------------|
| **Decoupling** | Event emitters provide a more decoupled architecture where the agent doesn't need to know about subscribers |
| **Multiple Subscribers** | With events, multiple listeners can subscribe independently (logging, analytics, etc.) |
| **Extensibility** | Adding new event types is easier - just emit new events without changing constructor signatures |
| **Standard Pattern** | `EventEmitter` is a well-understood pattern in the Node.js/Bun ecosystem |
| **Runtime Introspection** | Event names are discoverable at runtime |

### Arguments AGAINST Refactoring

| Argument | Explanation |
|----------|-------------|
| **YAGNI** | There is exactly ONE consumer. Multiple subscribers aren't needed. |
| **Simplicity** | Callbacks are simpler than event emitters - explicit, type-safe by default, no hidden state |
| **Type Safety** | TypeScript callbacks have explicit signatures. Event emitters require more ceremony (typed event maps, generics) |
| **No Abstraction Leak** | The callbacks are *injected*, not *pulled*. This is dependency injection, which is a good pattern |
| **Project Scope** | This is a sandbox for AI agent training - simplicity and readability matter more than theoretical architectural purity |
| **No Observed Pain** | There's no bug, no maintenance friction, no feature blocked by this design |
| **Code Churn** | Refactoring would touch multiple files, require new abstractions, and add complexity without concrete benefit |

---

## Decision

**KEEP THE CURRENT CALLBACK-BASED IMPLEMENTATION**

### Rationale

1. **Not Actually an Abstraction Leak:** The `ChatAgent` has no knowledge of WebSockets, event schemas, or the orchestrator's internals. It just calls generic functions with `(toolName, args)` signatures.

2. **Appropriate for Project Scope:** Per `AGENTS.md`, this is "a controlled sandbox for training AI agents." Over-engineering hurts readability and learning.

3. **No Real-World Friction:** There's no observed pain - no bugs, no maintainability issues, no need for multiple subscribers.

4. **Clean Dependency Injection:** The current pattern is a valid form of DI. The agent depends on abstractions (callback functions), not concretions.

5. **YAGNI Principle:** We have one consumer and no concrete need for multiple subscribers.

---

## When to Revisit This Decision

Consider refactoring to an event emitter pattern if:

1. **Multiple independent systems** need to react to tool events (e.g., separate logging, analytics, or monitoring services)

2. **Plugin architecture** is introduced where third parties should hook into agent events without modifying `ChatAgent`

3. **Significant code duplication** emerges from passing similar callbacks in multiple places

4. **Testing becomes difficult** due to callback complexity (though current testing is not impacted)

5. **The project scope changes** from a training sandbox to a production system with more complex requirements

---

## Alternative Considered (Hybrid Approach)

A middle-ground option was considered: extending `ChatAgent` with `EventEmitter` while keeping callbacks as the primary interface. This would future-proof the class without breaking existing code.

```typescript
// Hypothetical hybrid approach (NOT IMPLEMENTED)
export class ChatAgent extends EventEmitter {
  constructor(params?: { ... }) {
    super();
    // Emit events AND call callbacks
    this.emit('toolCall', toolName, args);
    params?.onToolCall?.(toolName, args);
  }
}
```

**Decision:** Even this was deemed premature. The added complexity isn't justified for the current use case.

---

## Files Involved

| File | Role |
|------|------|
| `src/backend/agent/chat-agent.ts` | Agent class with callback parameters |
| `src/backend/services/chat-orchestrator.ts` | Single consumer that provides callbacks |
| `src/shared/commands.ts` | WebSocket event definitions (not directly coupled to agent) |

---

## References

- [Vercel AI SDK Agents Documentation](.llm/docs/VERCEL_AI_SDK_AGENTS.md)
- [AI SDK Agent Tool Tracking](.llm/docs/AI_SDK_AGENT_TOOL_TRACKING.md)

