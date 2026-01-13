/**
 * Common types for tool callback functions used across agents.
 * Using `unknown` instead of `any` for TypeScript strictness.
 */

export type ToolCallCallback = (toolName: string, args: unknown) => void;
export type ToolResultCallback = (toolName: string, result: unknown, error?: Error) => void;

export interface ToolCallbacks {
  onToolCall?: ToolCallCallback;
  onToolResult?: ToolResultCallback;
}
