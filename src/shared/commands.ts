import { z } from "zod";
import { registry } from "./command-system";

// ============================================================================
// Shared Schemas
// ============================================================================

export const ToolNameSchema = z.enum(["deep_research"]);
export type ToolName = z.infer<typeof ToolNameSchema>;

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
    selectedTools: z.array(ToolNameSchema).optional(),
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

export const AIResponseChunkEvent = registry.event(
  "ai_response_chunk",
  z.object({
    messageId: z.number(),
    conversationId: z.string(),
    delta: z.string(),
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

export const AgentStatusUpdateEvent = registry.event(
  "agent_status_update",
  z.object({
    conversationId: z.string(),
    status: z.string(),
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

export const BackgroundTaskErrorEvent = registry.event(
  "background_task_error",
  z.object({
    conversationId: z.string(),
    taskType: z.enum(["title_generation", "ai_response"]),
    message: z.string(),
    timestamp: z.string().datetime(),
  }),
);

// ============================================================================
// Type Exports
// ============================================================================

export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;

export type SendMessageRequest = z.infer<typeof SendMessage.requestSchema>;
export type SendMessageResponse = z.infer<typeof SendMessage.responseSchema>;

export type LoadConversationRequest = z.infer<typeof LoadConversation.requestSchema>;
export type LoadConversationResponse = z.infer<typeof LoadConversation.responseSchema>;

export type GetConversationsRequest = z.infer<typeof GetConversations.requestSchema>;
export type GetConversationsResponse = z.infer<typeof GetConversations.responseSchema>;

export type AIResponsePayload = z.infer<typeof AIResponseEvent.payloadSchema>;
export type AIResponseChunkPayload = z.infer<typeof AIResponseChunkEvent.payloadSchema>;
export type ConversationUpdatedPayload = z.infer<typeof ConversationUpdatedEvent.payloadSchema>;
export type SystemNotificationPayload = z.infer<typeof SystemNotificationEvent.payloadSchema>;

export type AgentStatusUpdatePayload = z.infer<typeof AgentStatusUpdateEvent.payloadSchema>;
export type ChatAgentErrorPayload = z.infer<typeof ChatAgentErrorEvent.payloadSchema>;
export type BackgroundTaskErrorPayload = z.infer<typeof BackgroundTaskErrorEvent.payloadSchema>;
