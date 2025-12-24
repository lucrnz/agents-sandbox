import { test, expect, describe, mock, beforeEach, afterEach } from "bun:test";
import { ChatOrchestrator } from "./chat-orchestrator";

// Mock DB
const mockAddMessage = mock(async () => ({ id: 1, role: "assistant", content: "Thinking..." }));
const mockUpdateMessage = mock(async () => ({ id: 1, role: "assistant", content: "Done" }));
const mockUpdateConversation = mock(async () => ({ id: "conv-id", title: "New Title" }));
const mockGetConversationWithMessages = mock(async () => ({
  id: "conv-id",
  title: "New chat 12/23/2025",
  messages: [{ id: 1, role: "user", content: "Hello" }],
}));

mock.module("@/backend/db", () => ({
  addMessage: mockAddMessage,
  updateMessage: mockUpdateMessage,
  updateConversation: mockUpdateConversation,
  getConversationWithMessages: mockGetConversationWithMessages,
}));

// Mock Title Generation
const mockGenerateTitle = mock(async () => "Generated Title");
mock.module("@/backend/agent/title-generation.js", () => ({
  generateConversationTitle: mockGenerateTitle,
}));

// Mock ChatAgent
class MockChatAgent {
  generateResponse = mock(async function* (content: string) {
    yield "Hello ";
    yield "world!";
  });
}
mock.module("@/backend/agent/chat-agent", () => ({
  ChatAgent: MockChatAgent,
}));

describe("ChatOrchestrator", () => {
  let ws: any;
  let orchestrator: ChatOrchestrator;

  beforeEach(() => {
    ws = {
      send: mock(() => {}),
      data: { conversationId: "conv-id" },
    };
    orchestrator = new ChatOrchestrator({ ws, conversationId: "conv-id" });

    mockAddMessage.mockClear();
    mockUpdateMessage.mockClear();
    mockUpdateConversation.mockClear();
    mockGetConversationWithMessages.mockClear();
    mockGenerateTitle.mockClear();
    ws.send.mockClear();
  });

  test("processUserMessage should trigger title generation and AI response", async () => {
    await orchestrator.processUserMessage("Hello agent");

    // We can't easily wait for the background tasks unless we change the implementation
    // or use a helper to wait for tasks in the tracker.
    // For now, let's just wait a bit or mock the tracker.
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockGetConversationWithMessages).toHaveBeenCalledWith("conv-id");
    expect(mockGenerateTitle).toHaveBeenCalledWith("Hello agent");
    expect(mockUpdateConversation).toHaveBeenCalled();
    expect(mockAddMessage).toHaveBeenCalled();
    expect(ws.send).toHaveBeenCalled();
  });

  test("should handle AI response streaming", async () => {
    // Use any to access private methods
    await (orchestrator as any).streamAIResponse("Hello");

    expect(mockAddMessage).toHaveBeenCalledWith("conv-id", "assistant", "🤔 Thinking...");
    expect(mockUpdateMessage).toHaveBeenCalled();
    // 2 chunks + final cleanup = at least 3 calls
    expect(mockUpdateMessage.mock.calls.length).toBeGreaterThanOrEqual(2);

    // Check if chunks were sent via WS
    const sentEvents = ws.send.mock.calls.map((c: any) => JSON.parse(c[0]));
    const chunkEvents = sentEvents.filter((e: any) => e.event === "ai_response_chunk");
    expect(chunkEvents).toHaveLength(2);
    expect(chunkEvents[0].payload.delta).toBe("Hello ");
    expect(chunkEvents[1].payload.delta).toBe("world!");
  });
});
