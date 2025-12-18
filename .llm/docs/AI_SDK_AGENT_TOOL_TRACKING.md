# AI SDK Agent Tool Execution Tracking

## Overview

The Vercel AI SDK's `Experimental_Agent` class provides a high-level abstraction for building agents with automatic tool execution and loop control. However, tracking tool execution in real-time requires understanding the Agent's internal mechanics and using the `prepareStep` callback.

## Key Concepts

### 1. Agent Tool Execution Flow

When an Agent calls a tool:

1. **Tool Call Generation**: The LLM generates a tool call request
2. **Tool Execution**: The Agent executes the tool's `execute` function
3. **Result Processing**: The Agent processes the result and potentially generates another response
4. **Loop Continuation**: The loop continues based on `stopWhen` condition

### 2. Agent Configuration

```typescript
import { Experimental_Agent as Agent, stepCountIs } from 'ai';
import { tool } from 'ai';
import { z } from 'zod';

const myAgent = new Agent({
  model: "anthropic/claude-sonnet-4.5",
  system: 'You are a helpful assistant.',
  tools: {
    myTool: tool({
      description: 'Tool description',
      inputSchema: z.object({
        param: z.string(),
      }),
      execute: async ({ param }) => {
        // Tool implementation
        return { result: 'data' };
      },
    }),
  },
  stopWhen: stepCountIs(10), // Maximum 10 steps
  prepareStep: async ({ stepNumber, messages, steps }) => {
    // Called before each step
    // Can modify settings, context, tools
    return {};
  },
});
```

### 3. Real-time Tool Tracking with prepareStep

The `prepareStep` callback is the key to tracking tool execution. It runs before each step and receives:

- `stepNumber`: Current step number (0-indexed)
- `messages`: Messages to be sent to the model
- `steps`: All previous steps with their results
- `model`: Current model configuration

```typescript
prepareStep: async ({ stepNumber, messages, steps }) => {
  // Access previous tool calls and results
  const previousToolCalls = steps.flatMap(step => step.toolCalls);
  const previousResults = steps.flatMap(step => step.toolResults);

  // Check for tool calls in the last step
  const lastStep = steps[steps.length - 1];
  if (lastStep?.toolCalls && lastStep.toolCalls.length > 0) {
    // Tool was called - emit event
    for (const toolCall of lastStep.toolCalls) {
      console.log(`Tool ${toolCall.toolName} called with:`, toolCall.args);
      // TODO: Emit WebSocket event to UI
    }
  }

  // Check for tool results in the last step
  if (lastStep?.toolResults && lastStep.toolResults.length > 0) {
    for (const toolResult of lastStep.toolResults) {
      console.log(`Tool ${toolResult.toolName} completed with:`, toolResult.result);
      // TODO: Emit WebSocket event to UI
    }
  }

  return {}; // Continue with default settings
}
```

### 4. Step Information Structure

Each step contains:

```typescript
interface Step {
  stepNumber: number;
  text?: string; // Generated text (if model generated text)
  toolCalls?: Array<{
    toolName: string;
    toolCallId: string;
    args: Record<string, unknown>; // Tool arguments
  }>;
  toolResults?: Array<{
    toolName: string;
    toolCallId: string;
    result: unknown; // Tool execution result
    error?: Error;
  }>;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
}
```

### 5. Tool Execution States

Tool calls and results have different states:

- **Tool Call States**:
  - `input-streaming`: Tool call is being generated
  - `input-available`: Tool call is complete, ready for execution

- **Tool Result States**:
  - `output-available`: Tool execution completed successfully
  - `output-error`: Tool execution failed

### 6. Streaming vs Non-streaming

**Streaming (`agent.stream()`)**:
- Real-time text chunks via `textStream`
- Tool calls are executed as they happen
- Need to use `prepareStep` for tracking

**Non-streaming (`agent.generate()`)**:
- Returns complete result
- All tool execution happens before returning
- Access steps via `result.steps`

### 7. Integration with WebSocket Events

To show tool status in the UI:

1. Emit `agent_tool_start` event when tool call is detected
2. Emit `agent_tool_complete` event when tool result is available
3. Emit `agent_tool_error` event if tool fails

```typescript
// In prepareStep callback
if (lastStep?.toolCalls) {
  for (const toolCall of lastStep.toolCalls) {
    ws.send(JSON.stringify({
      type: 'agent_tool_start',
      conversationId,
      toolName: toolCall.toolName,
      description: generateStatusMessage(toolCall.args),
      timestamp: new Date().toISOString()
    }));
  }
}

if (lastStep?.toolResults) {
  for (const toolResult of lastStep.toolResults) {
    if (toolResult.error) {
      ws.send(JSON.stringify({
        type: 'agent_tool_error',
        conversationId,
        toolName: toolResult.toolName,
        error: toolResult.error.message,
        timestamp: new Date().toISOString()
      }));
    } else {
      ws.send(JSON.stringify({
        type: 'agent_tool_complete',
        conversationId,
        toolName: toolResult.toolName,
        result: toolResult.result,
        timestamp: new Date().toISOString()
      }));
    }
  }
}
```

### 8. Custom Tool Wrapper Pattern

To inject status tracking into existing tools:

```typescript
function wrapToolWithStatus(tool, toolName, emitStatus) {
  return {
    ...tool,
    execute: async (params) => {
      // Emit start event
      emitStatus('start', toolName, params);
      
      try {
        const result = await tool.execute(params);
        // Emit complete event
        emitStatus('complete', toolName, result);
        return result;
      } catch (error) {
        // Emit error event
        emitStatus('error', toolName, error.message);
        throw error;
      }
    }
  };
}
```

### 9. Best Practices

1. **Use prepareStep for tracking**: It's the only way to track tool execution in real-time
2. **Handle both tool calls and results**: Track both start and completion
3. **Emit events immediately**: Don't wait for the full response to stream
4. **Include conversation context**: Always include conversationId in events
5. **Generate meaningful status messages**: Create user-friendly descriptions
6. **Handle errors gracefully**: Emit error events when tools fail

### 10. Common Pitfalls

1. **Trying to track in execute function**: The execute function runs async, hard to track there
2. **Only checking final result**: Tool execution happens mid-stream
3. **Not using prepareStep**: prepareStep is essential for real-time tracking
4. **Forgetting tool call states**: Check for both `input-streaming` and `input-available`

## Summary

To track AI SDK Agent tool execution:

1. Use the `prepareStep` callback in Agent configuration
2. Check `steps` array for tool calls and results
3. Emit WebSocket events when tools start/complete/fail
4. Track both tool calls (before execution) and results (after execution)
5. Handle tool execution states properly
6. Generate meaningful status messages for the UI
