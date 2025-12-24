import { test, expect, describe, mock, beforeEach, afterEach, spyOn, type Mock } from "bun:test";
import { commandHandlers } from "./command-handlers";
import {
  SendMessage,
  LoadConversation,
  GetConversations,
  type SendMessageResponse,
  type LoadConversationResponse,
  type GetConversationsResponse,
} from "@/shared/commands";
import * as db from "@/backend/db";
import { ChatOrchestrator } from "@/backend/services/chat-orchestrator";
import type { ServerWebSocket } from "bun";

describe("Command Handlers", () => {
  let ws: ServerWebSocket<{ conversationId?: string }>;
  let context: { ws: ServerWebSocket<{ conversationId?: string }>; conversationId?: string };
  let spies: Mock<any>[] = [];

  beforeEach(() => {
    ws = {
      send: mock((_data: string | Uint8Array) => {}),
      data: {},
    } as unknown as ServerWebSocket<{ conversationId?: string }>;
    context = { ws };

    // Setup spies
    spies.push(
      spyOn(db, "getOrCreateConversation").mockImplementation(async () => ({
        id: "conv-id",
        title: "Chat",
        createdAt: new Date(),
        updatedAt: new Date(),
      })),
    );
    spies.push(
      spyOn(db, "addMessage").mockImplementation(
        async (conversationId, role, content) =>
          ({
            id: 1,
            conversationId,
            role,
            content,
            createdAt: new Date(),
          }) as const,
      ),
    );
    spies.push(
      spyOn(db, "getConversationWithMessages").mockImplementation(
        async (id) =>
          ({
            id,
            title: "Chat",
            messages: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }) as const,
      ),
    );
    spies.push(
      spyOn(db, "getConversationsWithMessages").mockImplementation(async () => [
        {
          id: "conv-id",
          title: "Chat",
          updatedAt: new Date(),
          createdAt: new Date(),
        } as const,
      ]),
    );
    spies.push(
      spyOn(ChatOrchestrator.prototype, "processUserMessage").mockImplementation(async () => {}),
    );
  });

  afterEach(() => {
    // Restore all spies
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies = [];
  });

  describe("SendMessage", () => {
    test("should handle SendMessage command", async () => {
      const payload = { content: "Hello", conversationId: "conv-id" };
      const result = (await commandHandlers.execute(
        SendMessage.name,
        payload,
        context,
      )) as SendMessageResponse;

      expect(result.conversationId).toBe("conv-id");
      expect(db.getOrCreateConversation).toHaveBeenCalledWith("conv-id");
      expect(db.addMessage).toHaveBeenCalledWith("conv-id", "user", "Hello");
      // For prototype spies, we check the spy itself
      const orchestratorSpy = spies.find((s) => s.name === "processUserMessage");
      expect(orchestratorSpy!).toHaveBeenCalledWith("Hello");
    });
  });

  describe("LoadConversation", () => {
    test("should load existing conversation", async () => {
      const payload = { conversationId: "conv-id" };
      const result = (await commandHandlers.execute(
        LoadConversation.name,
        payload,
        context,
      )) as LoadConversationResponse;

      expect(result.conversationId).toBe("conv-id");
      expect(db.getConversationWithMessages).toHaveBeenCalledWith("conv-id");
    });

    test("should create new conversation if no ID provided", async () => {
      const payload = { conversationId: undefined };
      const result = (await commandHandlers.execute(
        LoadConversation.name,
        payload,
        context,
      )) as LoadConversationResponse;

      expect(result.conversationId).toBe("conv-id");
      expect(db.getOrCreateConversation).toHaveBeenCalled();
    });
  });

  describe("GetConversations", () => {
    test("should return list of conversations", async () => {
      const result = (await commandHandlers.execute(
        GetConversations.name,
        {},
        context,
      )) as GetConversationsResponse;

      expect(result.conversations).toHaveLength(1);
      expect(result.conversations[0]!.id).toBe("conv-id");
    });
  });
});
