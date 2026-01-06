/// <reference lib="dom" />

import { test, expect, describe, mock } from "bun:test";
import { render } from "@testing-library/react";
import ConversationSidebar from "./conversation-sidebar";
import type { Conversation } from "@/shared/commands";

describe("ConversationSidebar component", () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const lastWeek = new Date(today);
  lastWeek.setDate(today.getDate() - 5);
  const lastMonth = new Date(today);
  lastMonth.setDate(today.getDate() - 15);
  const older = new Date(today);
  older.setDate(today.getDate() - 60);

  const mockConversations: Conversation[] = [
    {
      id: "conv-1",
      title: "Today Conversation",
      updatedAt: today.toISOString(),
    },
    {
      id: "conv-2",
      title: "Yesterday Conversation",
      updatedAt: yesterday.toISOString(),
    },
    {
      id: "conv-3",
      title: "Last Week Conversation",
      updatedAt: lastWeek.toISOString(),
    },
    {
      id: "conv-4",
      title: "Last Month Conversation",
      updatedAt: lastMonth.toISOString(),
    },
    {
      id: "conv-5",
      title: "Older Conversation",
      updatedAt: older.toISOString(),
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

    // Check for headers
    expect(getByText("Today")).toBeInTheDocument();
    expect(getByText("Yesterday")).toBeInTheDocument();
    expect(getByText("Last 7 Days")).toBeInTheDocument();
    expect(getByText("Last 30 Days")).toBeInTheDocument();

    const olderYear = older.getFullYear();
    const currentYear = today.getFullYear();
    if (olderYear === currentYear) {
      expect(getByText("This Year")).toBeInTheDocument();
    } else {
      expect(getByText(olderYear.toString())).toBeInTheDocument();
    }

    // Check for items
    expect(getByText("Today Conversation")).toBeInTheDocument();
    expect(getByText("Yesterday Conversation")).toBeInTheDocument();
    expect(getByText("Last Week Conversation")).toBeInTheDocument();
    expect(getByText("Last Month Conversation")).toBeInTheDocument();
    expect(getByText("Older Conversation")).toBeInTheDocument();
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

    const firstConversation = getByText("Today Conversation").closest("button");
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

    const secondConversation = getByText("Yesterday Conversation").closest("button");
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
    const firstConversation = getByText("Today Conversation").closest("button");
    expect(firstConversation).toBeInTheDocument();
    // The date should be rendered in the button
    const dateText = firstConversation?.textContent || "";
    // Should contain some date/time formatting
    expect(dateText.length).toBeGreaterThan("Today Conversation".length);
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

    const secondConversation = getByText("Yesterday Conversation").closest("button");
    const thirdConversation = getByText("Last Week Conversation").closest("button");

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

    const firstConversation = getByText("Today Conversation").closest("button");
    expect(firstConversation).toBeInTheDocument();
    expect(firstConversation).not.toHaveClass("bg-primary/10");
  });
});
