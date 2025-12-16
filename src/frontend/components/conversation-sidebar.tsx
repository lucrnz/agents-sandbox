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
    <div className="w-64 bg-card border-r flex flex-col h-full">
      <div className="p-4 border-b">
        <Button 
          onClick={onNewConversation}
          className="w-full justify-center"
          variant="default"
        >
          New Conversation
        </Button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-2 custom-scrollbar">
        <h3 className="text-sm font-semibold text-muted-foreground mb-2 px-2">
          Recent Conversations
        </h3>
        {conversations.length === 0 ? (
          <p className="text-sm text-muted-foreground px-2 py-4 text-center">
            No conversations yet
          </p>
        ) : (
          conversations.map((conversation) => (
            <button
              key={conversation.id}
              onClick={() => onLoadConversation(conversation.id)}
              className={`w-full text-left p-3 rounded-lg mb-1 transition-colors hover:bg-muted/50 ${
                currentConversationId === conversation.id
                  ? "bg-primary/10 border-l-2 border-primary"
                  : "border-l-2 border-transparent"
              }`}
            >
              <h4 className="font-medium text-sm text-foreground truncate">
                {conversation.title}
              </h4>
              <p className="text-xs text-muted-foreground mt-1">
                {new Date(conversation.updatedAt).toLocaleDateString()} {new Date(conversation.updatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
              </p>
            </button>
          ))
        )}
      </div>
    </div>
  );
}