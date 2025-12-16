import { z } from "zod";

// Base message schema with common fields
const BaseMessageSchema = z.object({
  timestamp: z.string().datetime().optional(),
  conversationId: z.string().optional(),
});

// Client to Server Messages
export const UserMessageSchema = z.object({
  type: z.literal("user_message"),
  content: z.string().min(1, "Message content cannot be empty"),
  timestamp: z.string().datetime().optional(),
  conversationId: z.string().optional(),
});

export const LoadConversationSchema = z.object({
  type: z.literal("load_conversation"),
  conversationId: z.string().optional(), // If not provided, creates new conversation
});

export const GetConversationsSchema = z.object({
  type: z.literal("get_conversations"),
});

// Server to Client Messages  
export const SystemMessageSchema = z.object({
  type: z.literal("system"),
  message: z.string(),
  error: z.boolean().optional(),
  conversationId: z.string().optional(),
});

export const AIResponseSchema = z.object({
  type: z.literal("ai_response"),
  content: z.string(),
  timestamp: z.string().datetime(),
  conversationId: z.string(),
});

export const ConversationLoadedSchema = z.object({
  type: z.literal("conversation_loaded"),
  conversationId: z.string(),
  title: z.string(),
  messages: z.array(z.object({
    id: z.number(),
    role: z.enum(["user", "assistant"]),
    content: z.string(),
    createdAt: z.string().datetime(),
  })),
});

export const ConversationsListSchema = z.object({
  type: z.literal("conversations_list"),
  conversations: z.array(z.object({
    id: z.string(),
    title: z.string(),
    updatedAt: z.string().datetime(),
  })),
});

// Individual conversation schema
export const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string().datetime(),
});

// Union types for message validation
export const IncomingMessageSchema = z.discriminatedUnion("type", [
  UserMessageSchema,
  LoadConversationSchema,
  GetConversationsSchema,
]);

export const OutgoingMessageSchema = z.discriminatedUnion("type", [
  SystemMessageSchema,
  AIResponseSchema,
  ConversationLoadedSchema,
  ConversationsListSchema,
]);

// All possible messages (for client-side validation of incoming)
export const AnyMessageSchema = z.discriminatedUnion("type", [
  UserMessageSchema,
  SystemMessageSchema, 
  AIResponseSchema,
  LoadConversationSchema,
  GetConversationsSchema,
  ConversationLoadedSchema,
  ConversationsListSchema,
]);

// TypeScript types derived from schemas
export type UserMessage = z.infer<typeof UserMessageSchema>;
export type LoadConversation = z.infer<typeof LoadConversationSchema>;
export type GetConversations = z.infer<typeof GetConversationsSchema>;
export type SystemMessage = z.infer<typeof SystemMessageSchema>;
export type AIResponse = z.infer<typeof AIResponseSchema>;
export type ConversationLoaded = z.infer<typeof ConversationLoadedSchema>;
export type ConversationsList = z.infer<typeof ConversationsListSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;
export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;
export type AnyMessage = z.infer<typeof AnyMessageSchema>;

// Helper functions for message creation with validation
export const createUserMessage = (content: string, conversationId?: string): UserMessage => {
  return UserMessageSchema.parse({
    type: "user_message",
    content,
    conversationId,
    timestamp: new Date().toISOString(),
  });
};

export const createLoadConversation = (conversationId?: string): LoadConversation => {
  return LoadConversationSchema.parse({
    type: "load_conversation",
    conversationId,
  });
};

export const createGetConversations = (): GetConversations => {
  return GetConversationsSchema.parse({
    type: "get_conversations",
  });
};

export const createSystemMessage = (message: string, error = false, conversationId?: string): SystemMessage => {
  return SystemMessageSchema.parse({
    type: "system",
    message,
    error,
    conversationId,
  });
};

export const createAIResponse = (content: string, conversationId: string): AIResponse => {
  return AIResponseSchema.parse({
    type: "ai_response",
    content,
    conversationId,
    timestamp: new Date().toISOString(),
  });
};

export const createConversationLoaded = (
  conversationId: string,
  title: string,
  messages: any[]
): ConversationLoaded => {
  return ConversationLoadedSchema.parse({
    type: "conversation_loaded",
    conversationId,
    title,
    messages,
  });
};

export const createConversationsList = (conversations: any[]): ConversationsList => {
  return ConversationsListSchema.parse({
    type: "conversations_list",
    conversations,
  });
};

// Validation helper functions
export const validateIncomingMessage = (data: unknown): IncomingMessage => {
  return IncomingMessageSchema.parse(data);
};

export const validateOutgoingMessage = (data: unknown): OutgoingMessage => {
  return OutgoingMessageSchema.parse(data);
};

export const validateAnyMessage = (data: unknown): AnyMessage => {
  return AnyMessageSchema.parse(data);
};