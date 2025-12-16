import { z } from "zod";

// ============================================================================
// Core Command Infrastructure
// ============================================================================

export interface CommandDef<TReq, TRes> {
  name: string;
  requestSchema: z.ZodType<TReq>;
  responseSchema: z.ZodType<TRes>;
}

export interface EventDef<TPayload> {
  name: string;
  payloadSchema: z.ZodType<TPayload>;
}

// Command message (client → server → client)
export interface CommandMessage<T = unknown> {
  kind: "command";
  command: string;
  correlationId: string;
  payload: T;
  timestamp: string;
}

// Command result (server → client)
export interface CommandResult<T = unknown> {
  kind: "result";
  command: string;
  correlationId: string;
  payload: T;
  timestamp: string;
}

// Command error (server → client)
export interface CommandError {
  kind: "error";
  command: string;
  correlationId: string;
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
  timestamp: string;
}

// Event message (server → client, no response expected)
export interface EventMessage<T = unknown> {
  kind: "event";
  event: string;
  payload: T;
  timestamp: string;
}

// All possible WebSocket messages
export type WebSocketMessage =
  | CommandMessage
  | CommandResult
  | CommandError
  | EventMessage;

// ============================================================================
// Command Registry
// ============================================================================

class Registry {
  private commands = new Map<string, CommandDef<any, any>>();
  private events = new Map<string, EventDef<any>>();

  command<TReq, TRes>(
    name: string,
    requestSchema: z.ZodType<TReq>,
    responseSchema: z.ZodType<TRes>
  ): CommandDef<TReq, TRes> {
    const cmd = { name, requestSchema, responseSchema };
    this.commands.set(name, cmd);
    return cmd;
  }

  event<TPayload>(
    name: string,
    payloadSchema: z.ZodType<TPayload>
  ): EventDef<TPayload> {
    const evt = { name, payloadSchema };
    this.events.set(name, evt);
    return evt;
  }

  getCommand(name: string) {
    return this.commands.get(name);
  }

  getEvent(name: string) {
    return this.events.get(name);
  }

  validateCommandRequest(command: string, payload: unknown) {
    const cmd = this.getCommand(command);
    if (!cmd) throw new Error(`Unknown command: ${command}`);
    return cmd.requestSchema.parse(payload);
  }

  validateCommandResponse(command: string, payload: unknown) {
    const cmd = this.getCommand(command);
    if (!cmd) throw new Error(`Unknown command: ${command}`);
    return cmd.responseSchema.parse(payload);
  }

  validateEvent(event: string, payload: unknown) {
    const evt = this.getEvent(event);
    if (!evt) throw new Error(`Unknown event: ${event}`);
    return evt.payloadSchema.parse(payload);
  }
}

export const registry = new Registry();

// ============================================================================
// Zod Schemas for WebSocket Messages
// ============================================================================

export const CommandMessageSchema = z.object({
  kind: z.literal("command"),
  command: z.string(),
  correlationId: z.string().uuid(),
  payload: z.unknown(),
  timestamp: z.string().datetime(),
});

export const CommandResultSchema = z.object({
  kind: z.literal("result"),
  command: z.string(),
  correlationId: z.string().uuid(),
  payload: z.unknown(),
  timestamp: z.string().datetime(),
});

export const CommandErrorSchema = z.object({
  kind: z.literal("error"),
  command: z.string(),
  correlationId: z.string().uuid(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
  timestamp: z.string().datetime(),
});

export const EventMessageSchema = z.object({
  kind: z.literal("event"),
  event: z.string(),
  payload: z.unknown(),
  timestamp: z.string().datetime(),
});

export const WebSocketMessageSchema = z.discriminatedUnion("kind", [
  CommandMessageSchema,
  CommandResultSchema,
  CommandErrorSchema,
  EventMessageSchema,
]);

// ============================================================================
// Helper Functions
// ============================================================================

export function createCommandMessage<T>(
  command: string,
  payload: T,
  correlationId: string = crypto.randomUUID()
): CommandMessage<T> {
  return {
    kind: "command",
    command,
    correlationId,
    payload,
    timestamp: new Date().toISOString(),
  };
}

export function createCommandResult<T>(
  command: string,
  correlationId: string,
  payload: T
): CommandResult<T> {
  return {
    kind: "result",
    command,
    correlationId,
    payload,
    timestamp: new Date().toISOString(),
  };
}

export function createCommandError(
  command: string,
  correlationId: string,
  code: string,
  message: string,
  details?: unknown
): CommandError {
  return {
    kind: "error",
    command,
    correlationId,
    error: { code, message, details },
    timestamp: new Date().toISOString(),
  };
}

export function createEventMessage<T>(event: string, payload: T): EventMessage<T> {
  return {
    kind: "event",
    event,
    payload,
    timestamp: new Date().toISOString(),
  };
}