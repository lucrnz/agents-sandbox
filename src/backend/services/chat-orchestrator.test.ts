import { test, expect, describe, mock, beforeEach, afterEach, spyOn, type Mock } from "bun:test";
import { ChatOrchestrator } from "./chat-orchestrator";
import * as db from "@/backend/db";
import * as titleGen from "@/backend/agent/title-generation.js";
import { ChatAgent } from "@/backend/agent/chat-agent";
import type { ServerWebSocket } from "bun";
import type { EventMessage } from "@/shared/command-system";
import type { AIResponseChunkPayload } from "@/shared/commands";

describe("ChatOrchestrator", () => {
  let ws: ServerWebSocket<{ conversationId?: string }>;
  let orchestrator: ChatOrchestrator;
  let spies: Mock<any>[] = [];

  beforeEach(() => {
    ws = {
      send: mock((_data: string | Uint8Array) => {}),
      data: { conversationId: "conv-id" },
    } as unknown as ServerWebSocket<{ conversationId?: string }>;
    orchestrator = new ChatOrchestrator({ ws, conversationId: "conv-id" });

    // Setup spies
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
      spyOn(db, "updateMessage").mockImplementation(
        async (id, content) =>
          ({
            id,
            content,
            conversationId: "conv-id",
            role: "assistant",
            createdAt: new Date(),
          }) as const,
      ),
    );
    spies.push(
      spyOn(db, "updateConversation").mockImplementation(
        async (id, data) =>
          ({
            id,
            title: data.title || "New Title",
            createdAt: new Date(),
            updatedAt: new Date(),
          }) as const,
      ),
    );
    spies.push(
      spyOn(db, "getConversationWithMessages").mockImplementation(
        async (id) =>
          ({
            id,
            title: "New chat 12/23/2025",
            messages: [
              {
                id: 1,
                role: "user" as const,
                content: "Hello",
                conversationId: id,
                createdAt: new Date(),
              },
            ],
            createdAt: new Date(),
            updatedAt: new Date(),
          }) as const,
      ),
    );

    spies.push(
      spyOn(titleGen, "generateConversationTitle").mockImplementation(
        async () => "Generated Title",
      ),
    );

    spies.push(
      spyOn(ChatAgent.prototype, "generateResponse").mockImplementation(async function* (
        _content: string,
      ) {
        yield { type: "text" as const, content: "Hello " };
        yield { type: "text" as const, content: "world!" };
      }),
    );
  });

  afterEach(() => {
    for (const spy of spies) {
      spy.mockRestore();
    }
    spies = [];
  });

  test("processUserMessage should trigger title generation and AI response", async () => {
    await orchestrator.processUserMessage("Hello agent");

    // We can't easily wait for the background tasks unless we change the implementation
    // or use a helper to wait for tasks in the tracker.
    // For now, let's just wait a bit or mock the tracker.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(db.getConversationWithMessages).toHaveBeenCalledWith("conv-id");
    expect(titleGen.generateConversationTitle).toHaveBeenCalledWith("Hello agent");
    expect(db.updateConversation).toHaveBeenCalled();
    expect(db.addMessage).toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalled();
  });

  test("should handle AI response streaming", async () => {
    // Access private method for testing
    const privateOrchestrator = orchestrator as unknown as {
      streamAIResponse: (content: string) => Promise<void>;
    };
    await privateOrchestrator.streamAIResponse("Hello");

    expect(db.addMessage).toHaveBeenCalledWith("conv-id", "assistant", "🤔 Thinking...");
    expect(db.updateMessage).toHaveBeenCalled();
    // 2 chunks + final cleanup = at least 3 calls
    const updateMessageMock = db.updateMessage as Mock<typeof db.updateMessage>;
    expect(updateMessageMock.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Check if chunks were sent via WS
    const sendMock = ws.send as Mock<typeof ws.send>;
    const sentEvents = sendMock.mock.calls.map(
      (c) => JSON.parse(c[0] as string) as EventMessage<AIResponseChunkPayload>,
    );
    const chunkEvents = sentEvents.filter((e) => e.event === "ai_response_chunk");
    expect(chunkEvents).toHaveLength(2);
    expect(chunkEvents[0]!.payload.delta).toBe("Hello ");
    expect(chunkEvents[1]!.payload.delta).toBe("world!");
  });
});
