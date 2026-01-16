/// <reference lib="dom" />

import { test, expect, describe, mock, beforeEach } from "bun:test";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { act } from "react";
import {
  AgentStatusUpdateEvent,
  GetConversations,
  LoadConversation,
  ReserveConversation,
  SendMessage,
  StopGeneration,
} from "@/shared/commands";

let params: { conversationId?: string } = {};
const navigateMock = mock((_path: string) => {});
const reconnectMock = mock(() => {});
const handlers = new Map<string, (payload: unknown) => void>();

let loadConversationResponse = {
  conversationId: "conv-id",
  title: "Chat",
  messages: [] as { id: number; role: "user" | "assistant"; content: string; createdAt: string }[],
};
let reserveConversationResponse = {
  conversationId: "reserved-id",
  title: "New chat",
};
let sendMessageResponse = {
  messageId: 1,
  conversationId: "conv-id",
  timestamp: new Date().toISOString(),
};

const sendMock = mock(async (command: { name: string }, payload?: { content?: string }) => {
  switch (command.name) {
    case GetConversations.name:
      return { conversations: [] };
    case LoadConversation.name:
      return loadConversationResponse;
    case ReserveConversation.name:
      return reserveConversationResponse;
    case SendMessage.name:
      return sendMessageResponse;
    case StopGeneration.name:
      return { stopped: true };
    default:
      throw new Error(
        `Unhandled command: ${command.name} with payload: ${JSON.stringify(payload)}`,
      );
  }
});

mock.module("wouter", () => ({
  useParams: () => params,
  useLocation: () => ["/", navigateMock],
}));

mock.module("@/frontend/hooks/useWebSocket", () => ({
  useWebSocket: () => ({
    connectionState: "connected",
    send: sendMock,
    on: (event: { name: string }, handler: (payload: unknown) => void) => {
      handlers.set(event.name, handler);
      return () => handlers.delete(event.name);
    },
    reconnect: reconnectMock,
  }),
}));

const { default: ChatPage } = await import("./chat-page");

describe("ChatPage new conversation dialog", () => {
  beforeEach(() => {
    params = {};
    sendMock.mockClear();
    navigateMock.mockClear();
    reconnectMock.mockClear();
    handlers.clear();
    if (!Element.prototype.scrollIntoView) {
      Element.prototype.scrollIntoView = () => {};
    }
    loadConversationResponse = {
      conversationId: "conv-id",
      title: "Chat",
      messages: [],
    };
    reserveConversationResponse = {
      conversationId: "reserved-id",
      title: "New chat",
    };
    sendMessageResponse = {
      messageId: 1,
      conversationId: "conv-id",
      timestamp: new Date().toISOString(),
    };
  });

  test("opens dialog when generation is in progress", async () => {
    params = { conversationId: "conv-id" };
    loadConversationResponse = {
      conversationId: "conv-id",
      title: "Chat",
      messages: [
        {
          id: 1,
          role: "assistant",
          content: "Ready",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const { getByText } = render(<ChatPage />);

    await waitFor(() => {
      expect(getByText("Ready")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(handlers.has(AgentStatusUpdateEvent.name)).toBe(true);
    });

    await act(async () => {
      handlers.get(AgentStatusUpdateEvent.name)?.({
        conversationId: "conv-id",
        phase: "thinking",
        timestamp: new Date().toISOString(),
      });
    });

    await act(async () => {
      await getByText("New Conversation").click();
    });

    expect(getByText("Start a new conversation?")).toBeInTheDocument();
    expect(
      getByText("This will stop the current generation and start a new conversation."),
    ).toBeInTheDocument();
  });

  test("opens dialog when a thinking placeholder exists", async () => {
    params = { conversationId: "conv-id" };
    loadConversationResponse = {
      conversationId: "conv-id",
      title: "Chat",
      messages: [
        {
          id: 1,
          role: "assistant",
          content: "🤔 Thinking...",
          createdAt: new Date().toISOString(),
        },
      ],
    };

    const { getByText } = render(<ChatPage />);

    await waitFor(() => {
      expect(getByText("Thinking...")).toBeInTheDocument();
    });

    await act(async () => {
      await getByText("New Conversation").click();
    });

    expect(getByText("Start a new conversation?")).toBeInTheDocument();
  });
});
