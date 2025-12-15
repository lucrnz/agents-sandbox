import { z } from "zod";

// Base message schema with common fields
const BaseMessageSchema = z.object({
  timestamp: z.string().datetime().optional(),
});

// Client to Server Messages
export const UserMessageSchema = z.object({
  type: z.literal("user_message"),
  content: z.string().min(1, "Message content cannot be empty"),
  timestamp: z.string().datetime().optional(),
});

// Server to Client Messages  
export const SystemMessageSchema = z.object({
  type: z.literal("system"),
  message: z.string(),
  error: z.boolean().optional(),
});

export const AIResponseSchema = z.object({
  type: z.literal("ai_response"),
  content: z.string(),
  timestamp: z.string().datetime(),
});

// Union types for message validation
export const IncomingMessageSchema = z.discriminatedUnion("type", [
  UserMessageSchema,
]);

export const OutgoingMessageSchema = z.discriminatedUnion("type", [
  SystemMessageSchema,
  AIResponseSchema,
]);

// All possible messages (for client-side validation of incoming)
export const AnyMessageSchema = z.discriminatedUnion("type", [
  UserMessageSchema,
  SystemMessageSchema, 
  AIResponseSchema,
]);

// TypeScript types derived from schemas
export type UserMessage = z.infer<typeof UserMessageSchema>;
export type SystemMessage = z.infer<typeof SystemMessageSchema>;
export type AIResponse = z.infer<typeof AIResponseSchema>;
export type IncomingMessage = z.infer<typeof IncomingMessageSchema>;
export type OutgoingMessage = z.infer<typeof OutgoingMessageSchema>;
export type AnyMessage = z.infer<typeof AnyMessageSchema>;

// Helper functions for message creation with validation
export const createUserMessage = (content: string): UserMessage => {
  return UserMessageSchema.parse({
    type: "user_message",
    content,
    timestamp: new Date().toISOString(),
  });
};

export const createSystemMessage = (message: string, error = false): SystemMessage => {
  return SystemMessageSchema.parse({
    type: "system",
    message,
    error,
  });
};

export const createAIResponse = (content: string): AIResponse => {
  return AIResponseSchema.parse({
    type: "ai_response",
    content,
    timestamp: new Date().toISOString(),
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