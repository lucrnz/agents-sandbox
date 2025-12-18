import { useState } from "react";
import { Button } from "@/frontend/components/ui/button";
import { Card } from "@/frontend/components/ui/card";
import type { ConversationsList, Conversation } from "@/shared/websocket-schemas";

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
  return (
    <div className="bg-card flex h-full w-64 flex-col border-r">
      <div className="border-b p-4">
        <Button onClick={onNewConversation} className="w-full justify-center" variant="default">
          New Conversation
        </Button>
      </div>

      <div className="custom-scrollbar flex-1 overflow-y-auto p-2">
        <h3 className="text-muted-foreground mb-2 px-2 text-sm font-semibold">
          Recent Conversations
        </h3>
        {conversations.length === 0 ? (
          <p className="text-muted-foreground px-2 py-4 text-center text-sm">
            No conversations yet
          </p>
        ) : (
          conversations.map((conversation) => (
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
          ))
        )}
      </div>
    </div>
  );
}
