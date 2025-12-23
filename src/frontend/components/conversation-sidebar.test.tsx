/// <reference lib="dom" />

import { test, expect, describe, mock } from "bun:test";
import { render } from "@testing-library/react";
import ConversationSidebar from "./conversation-sidebar";
import type { Conversation } from "@/shared/commands";

describe("ConversationSidebar component", () => {
  const mockConversations: Conversation[] = [
    {
      id: "conv-1",
      title: "First Conversation",
      updatedAt: "2024-01-15T10:00:00Z",
    },
    {
      id: "conv-2",
      title: "Second Conversation",
      updatedAt: "2024-01-16T14:30:00Z",
    },
    {
      id: "conv-3",
      title: "Third Conversation",
      updatedAt: "2024-01-17T09:15:00Z",
    },
  ];

  test("renders with empty conversation list", () => {
    const onLoadConversation = mock(() => {});
    const onNewConversation = mock(() => {});

    const { getByText } = render(
      <ConversationSidebar
        conversations={[]}
        onLoadConversation={onLoadConversation}
        onNewConversation={onNewConversation}
      />,
    );

    expect(getByText("New Conversation")).toBeInTheDocument();
    expect(getByText("Recent Conversations")).toBeInTheDocument();
    expect(getByText("No conversations yet")).toBeInTheDocument();
  });

  test("renders with populated conversation list", () => {
    const onLoadConversation = mock(() => {});
    const onNewConversation = mock(() => {});

    const { getByText } = render(
      <ConversationSidebar
        conversations={mockConversations}
        onLoadConversation={onLoadConversation}
        onNewConversation={onNewConversation}
      />,
    );

    expect(getByText("New Conversation")).toBeInTheDocument();
    expect(getByText("Recent Conversations")).toBeInTheDocument();
    expect(getByText("First Conversation")).toBeInTheDocument();
    expect(getByText("Second Conversation")).toBeInTheDocument();
    expect(getByText("Third Conversation")).toBeInTheDocument();
  });

  test("calls onNewConversation when New Conversation button is clicked", async () => {
    const onLoadConversation = mock(() => {});
    const onNewConversation = mock(() => {});

    const { getByText } = render(
      <ConversationSidebar
        conversations={mockConversations}
        onLoadConversation={onLoadConversation}
        onNewConversation={onNewConversation}
      />,
    );

    const newButton = getByText("New Conversation");
    await newButton.click();

    expect(onNewConversation).toHaveBeenCalledTimes(1);
    expect(onLoadConversation).not.toHaveBeenCalled();
  });

  test("calls onLoadConversation when a conversation is clicked", async () => {
    const onLoadConversation = mock(() => {});
    const onNewConversation = mock(() => {});

    const { getByText } = render(
      <ConversationSidebar
        conversations={mockConversations}
        onLoadConversation={onLoadConversation}
        onNewConversation={onNewConversation}
      />,
    );

    const firstConversation = getByText("First Conversation").closest("button");
    expect(firstConversation).toBeInTheDocument();

    if (firstConversation) {
      await firstConversation.click();
      expect(onLoadConversation).toHaveBeenCalledTimes(1);
      expect(onLoadConversation).toHaveBeenCalledWith("conv-1");
    }
  });

  test("highlights current conversation", () => {
    const onLoadConversation = mock(() => {});
    const onNewConversation = mock(() => {});

    const { getByText } = render(
      <ConversationSidebar
        conversations={mockConversations}
        currentConversationId="conv-2"
        onLoadConversation={onLoadConversation}
        onNewConversation={onNewConversation}
      />,
    );

    const secondConversation = getByText("Second Conversation").closest("button");
    expect(secondConversation).toBeInTheDocument();
    expect(secondConversation).toHaveClass("bg-primary/10");
  });

  test("displays formatted dates for conversations", () => {
    const onLoadConversation = mock(() => {});
    const onNewConversation = mock(() => {});

    const { getByText } = render(
      <ConversationSidebar
        conversations={mockConversations}
        onLoadConversation={onLoadConversation}
        onNewConversation={onNewConversation}
      />,
    );

    // Check that dates are rendered (format may vary by locale, so we just check they exist)
    const firstConversation = getByText("First Conversation").closest("button");
    expect(firstConversation).toBeInTheDocument();
    // The date should be rendered in the button
    const dateText = firstConversation?.textContent || "";
    // Should contain some date/time formatting
    expect(dateText.length).toBeGreaterThan("First Conversation".length);
  });

  test("handles multiple conversation clicks correctly", async () => {
    const onLoadConversation = mock(() => {});
    const onNewConversation = mock(() => {});

    const { getByText } = render(
      <ConversationSidebar
        conversations={mockConversations}
        onLoadConversation={onLoadConversation}
        onNewConversation={onNewConversation}
      />,
    );

    const secondConversation = getByText("Second Conversation").closest("button");
    const thirdConversation = getByText("Third Conversation").closest("button");

    if (secondConversation && thirdConversation) {
      await secondConversation.click();
      expect(onLoadConversation).toHaveBeenCalledWith("conv-2");

      await thirdConversation.click();
      expect(onLoadConversation).toHaveBeenCalledWith("conv-3");
      expect(onLoadConversation).toHaveBeenCalledTimes(2);
    }
  });

  test("does not highlight any conversation when currentConversationId is undefined", () => {
    const onLoadConversation = mock(() => {});
    const onNewConversation = mock(() => {});

    const { getByText } = render(
      <ConversationSidebar
        conversations={mockConversations}
        onLoadConversation={onLoadConversation}
        onNewConversation={onNewConversation}
      />,
    );

    const firstConversation = getByText("First Conversation").closest("button");
    expect(firstConversation).toBeInTheDocument();
    expect(firstConversation).not.toHaveClass("bg-primary/10");
  });
});
