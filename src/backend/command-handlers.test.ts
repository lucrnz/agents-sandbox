import { test, expect, describe, mock, beforeEach } from "bun:test";
import { commandHandlers } from "./command-handlers";
import { SendMessage, LoadConversation, GetConversations } from "@/shared/commands";

// Mock DB
const mockGetOrCreateConversation = mock(async () => ({ id: "conv-id", title: "Chat" }));
const mockAddMessage = mock(async () => ({ id: 1, role: "user", content: "hi" }));
const mockGetConversationWithMessages = mock(async () => ({
  id: "conv-id",
  title: "Chat",
  messages: [],
}));
const mockGetConversationsWithMessages = mock(async () => [
  { id: "conv-id", title: "Chat", updatedAt: new Date() },
]);

mock.module("@/backend/db", () => ({
  getOrCreateConversation: mockGetOrCreateConversation,
  addMessage: mockAddMessage,
  getConversationWithMessages: mockGetConversationWithMessages,
  getConversationsWithMessages: mockGetConversationsWithMessages,
}));

// Mock Orchestrator
const mockProcessUserMessage = mock(async () => {});
mock.module("@/backend/services/chat-orchestrator", () => ({
  ChatOrchestrator: class {
    processUserMessage = mockProcessUserMessage;
  },
}));

describe("Command Handlers", () => {
  let ws: any;
  let context: any;

  beforeEach(() => {
    ws = {
      send: mock(() => {}),
      data: {},
    };
    context = { ws };
    mockGetOrCreateConversation.mockClear();
    mockAddMessage.mockClear();
    mockProcessUserMessage.mockClear();
  });

  describe("SendMessage", () => {
    test("should handle SendMessage command", async () => {
      const payload = { content: "Hello", conversationId: "conv-id" };
      const result = (await commandHandlers.execute(SendMessage.name, payload, context)) as any;

      expect(result.conversationId).toBe("conv-id");
      expect(mockGetOrCreateConversation).toHaveBeenCalledWith("conv-id");
      expect(mockAddMessage).toHaveBeenCalledWith("conv-id", "user", "Hello");
      expect(mockProcessUserMessage).toHaveBeenCalledWith("Hello");
    });
  });

  describe("LoadConversation", () => {
    test("should load existing conversation", async () => {
      const payload = { conversationId: "conv-id" };
      const result = (await commandHandlers.execute(
        LoadConversation.name,
        payload,
        context,
      )) as any;

      expect(result.conversationId).toBe("conv-id");
      expect(mockGetConversationWithMessages).toHaveBeenCalledWith("conv-id");
    });

    test("should create new conversation if no ID provided", async () => {
      const payload = { conversationId: undefined };
      const result = (await commandHandlers.execute(
        LoadConversation.name,
        payload,
        context,
      )) as any;

      expect(result.conversationId).toBe("conv-id");
      expect(mockGetOrCreateConversation).toHaveBeenCalled();
    });
  });

  describe("GetConversations", () => {
    test("should return list of conversations", async () => {
      const result = (await commandHandlers.execute(GetConversations.name, {}, context)) as any;

      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0].id).toBe("conv-id");
    });
  });
});
