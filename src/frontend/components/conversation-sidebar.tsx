import { useState } from "react";
import { Button } from "@/frontend/components/ui/button";
import { Card } from "@/frontend/components/ui/card";
import type { Conversation } from "@/shared/commands";

import { groupConversations } from "@/frontend/lib/date-utils";

interface ConversationSidebarProps {
  conversations: Conversation[];
  currentConversationId?: string;
  onLoadConversation: (conversationId?: string) => void;
  onNewConversation: () => void;
}

export default function ConversationSidebar({
  conversations,
  currentConversationId,
  onLoadConversation,
  onNewConversation,
}: ConversationSidebarProps) {
  const groups = groupConversations(conversations);

  const renderConversation = (conversation: Conversation) => (
    <button
      key={conversation.id}
      onClick={() => onLoadConversation(conversation.id)}
      className={`hover:bg-muted/50 mb-1 w-full rounded-lg p-3 text-left transition-colors ${
        currentConversationId === conversation.id
          ? "bg-primary/10 border-primary border-l-2"
          : "border-l-2 border-transparent"
      }`}
    >
      <h4 className="text-foreground truncate text-sm font-medium">{conversation.title}</h4>
      <p className="text-muted-foreground mt-1 text-xs">
        {new Date(conversation.updatedAt).toLocaleDateString()}{" "}
        {new Date(conversation.updatedAt).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </button>
  );

  return (
    <div className="bg-card flex h-full w-64 flex-col border-r">
      <div className="border-b p-4">
        <Button onClick={onNewConversation} className="w-full justify-center" variant="default">
          New Conversation
        </Button>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
        {conversations.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">
            No conversations yet
          </p>
        ) : (
          <>
            {groups.today.length > 0 && (
              <div className="mb-6">
                <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                  Today
                </h3>
                {groups.today.map(renderConversation)}
              </div>
            )}
            {groups.yesterday.length > 0 && (
              <div className="mb-6">
                <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                  Yesterday
                </h3>
                {groups.yesterday.map(renderConversation)}
              </div>
            )}
            {groups.lastSevenDays.length > 0 && (
              <div className="mb-6">
                <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                  Last 7 Days
                </h3>
                {groups.lastSevenDays.map(renderConversation)}
              </div>
            )}
            {groups.lastThirtyDays.length > 0 && (
              <div className="mb-6">
                <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                  Last 30 Days
                </h3>
                {groups.lastThirtyDays.map(renderConversation)}
              </div>
            )}
            {groups.older.length > 0 && (
              <div className="mb-6">
                <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                  Older Chats
                </h3>
                {groups.older.map(renderConversation)}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
