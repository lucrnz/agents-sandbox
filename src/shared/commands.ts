import { z } from "zod";
import { registry } from "./command-system";

// ============================================================================
// Shared Schemas
// ============================================================================

const MessageSchema = z.object({
  id: z.number(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string().datetime(),
});

// ============================================================================
// Commands (Request/Response)
// ============================================================================

export const SendMessage = registry.command(
  "send_message",
  z.object({
    content: z.string().min(1, "Message cannot be empty"),
    conversationId: z.string().optional(),
  }),
  z.object({
    messageId: z.number(),
    conversationId: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const LoadConversation = registry.command(
  "load_conversation",
  z.object({
    conversationId: z.string().optional(),
  }),
  z.object({
    conversationId: z.string(),
    title: z.string(),
    messages: z.array(MessageSchema),
  }),
);

export const GetConversations = registry.command(
  "get_conversations",
  z.object({}),
  z.object({
    conversations: z.array(ConversationSchema),
  }),
);

// ============================================================================
// Events (Server → Client notifications)
// ============================================================================

export const AIResponseEvent = registry.event(
  "ai_response",
  z.object({
    messageId: z.number(),
    conversationId: z.string(),
    content: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const ConversationUpdatedEvent = registry.event(
  "conversation_updated",
  z.object({
    conversationId: z.string(),
    title: z.string(),
  }),
);

export const SystemNotificationEvent = registry.event(
  "system_notification",
  z.object({
    level: z.enum(["info", "warning", "error"]),
    message: z.string(),
  }),
);

// ============================================================================
// Agent Tool Events (for future tool integration)
// ============================================================================

export const AgentToolStartEvent = registry.event(
  "agent_tool_start",
  z.object({
    conversationId: z.string(),
    toolName: z.string(),
    description: z.string().optional(),
    timestamp: z.string().datetime(),
  }),
);

export const AgentToolCompleteEvent = registry.event(
  "agent_tool_complete",
  z.object({
    conversationId: z.string(),
    toolName: z.string(),
    result: z.any().optional(),
    timestamp: z.string().datetime(),
  }),
);

export const AgentToolErrorEvent = registry.event(
  "agent_tool_error",
  z.object({
    conversationId: z.string(),
    toolName: z.string(),
    error: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const ChatAgentErrorEvent = registry.event(
  "chat_agent_error",
  z.object({
    conversationId: z.string(),
    error: z.string(),
    originalError: z.string().optional(),
    canRetry: z.boolean().default(true),
    timestamp: z.string().datetime(),
  }),
);

// ============================================================================
// Type Exports
// ============================================================================

export type SendMessageRequest = z.infer<typeof SendMessage.requestSchema>;
export type SendMessageResponse = z.infer<typeof SendMessage.responseSchema>;

export type LoadConversationRequest = z.infer<typeof LoadConversation.requestSchema>;
export type LoadConversationResponse = z.infer<typeof LoadConversation.responseSchema>;

export type GetConversationsRequest = z.infer<typeof GetConversations.requestSchema>;
export type GetConversationsResponse = z.infer<typeof GetConversations.responseSchema>;

export type AIResponsePayload = z.infer<typeof AIResponseEvent.payloadSchema>;
export type ConversationUpdatedPayload = z.infer<typeof ConversationUpdatedEvent.payloadSchema>;
export type SystemNotificationPayload = z.infer<typeof SystemNotificationEvent.payloadSchema>;

export type AgentToolStartPayload = z.infer<typeof AgentToolStartEvent.payloadSchema>;
export type AgentToolCompletePayload = z.infer<typeof AgentToolCompleteEvent.payloadSchema>;
export type AgentToolErrorPayload = z.infer<typeof AgentToolErrorEvent.payloadSchema>;
export type ChatAgentErrorPayload = z.infer<typeof ChatAgentErrorEvent.payloadSchema>;
