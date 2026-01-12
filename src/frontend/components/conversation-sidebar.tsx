import { useState } from "react";
import { Button } from "@/frontend/components/ui/button";
import type { Conversation } from "@/shared/commands";
import { PanelLeftClose, PanelLeft, Plus } from "lucide-react";
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
  const [isCollapsed, setIsCollapsed] = useState(false);
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
    <div
      className={`bg-card flex h-full flex-col border-r transition-all duration-300 ease-in-out ${
        isCollapsed ? "w-14" : "w-64"
      }`}
    >
      {/* Header section */}
      <div
        className={`flex items-center border-b transition-all duration-300 ${
          isCollapsed ? "flex-col gap-2 p-2" : "justify-between p-3"
        }`}
      >
        {isCollapsed ? (
          <>
            <Button
              onClick={() => setIsCollapsed(false)}
              variant="ghost"
              size="icon"
              className="h-10 w-10 transition-transform duration-200 hover:scale-105"
              title="Expand sidebar"
            >
              <PanelLeft className="h-5 w-5" />
            </Button>
            <Button
              onClick={onNewConversation}
              variant="ghost"
              size="icon"
              className="h-10 w-10 transition-transform duration-200 hover:scale-105"
              title="New conversation"
            >
              <Plus className="h-5 w-5" />
            </Button>
          </>
        ) : (
          <>
            <Button
              onClick={onNewConversation}
              className="flex-1 justify-center transition-transform duration-200 hover:scale-[1.02]"
              variant="default"
            >
              New Conversation
            </Button>
            <Button
              onClick={() => setIsCollapsed(true)}
              variant="ghost"
              size="icon"
              className="ml-2 h-9 w-9 shrink-0 transition-transform duration-200 hover:scale-105"
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          </>
        )}
      </div>

      {/* Conversations list - animate opacity */}
      <div
        className={`custom-scrollbar flex-1 overflow-x-hidden overflow-y-auto transition-opacity duration-300 ${
          isCollapsed ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        <div className="p-2">
          {conversations.length === 0 ? (
            <p className="text-muted-foreground px-2 py-4 text-center text-sm">
              No conversations yet
            </p>
          ) : (
            <>
              {groups.today.length > 0 && (
                <div className="animate-in fade-in mb-6 duration-300">
                  <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                    Today
                  </h3>
                  {groups.today.map(renderConversation)}
                </div>
              )}
              {groups.yesterday.length > 0 && (
                <div className="animate-in fade-in mb-6 duration-300">
                  <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                    Yesterday
                  </h3>
                  {groups.yesterday.map(renderConversation)}
                </div>
              )}
              {groups.lastSevenDays.length > 0 && (
                <div className="animate-in fade-in mb-6 duration-300">
                  <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                    Last 7 Days
                  </h3>
                  {groups.lastSevenDays.map(renderConversation)}
                </div>
              )}
              {groups.lastThirtyDays.length > 0 && (
                <div className="animate-in fade-in mb-6 duration-300">
                  <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                    Last 30 Days
                  </h3>
                  {groups.lastThirtyDays.map(renderConversation)}
                </div>
              )}
              {groups.olderGroups.map((group) => (
                <div key={group.title} className="animate-in fade-in mb-6 duration-300">
                  <h3 className="text-muted-foreground mb-2 px-2 text-xs font-semibold tracking-wider uppercase">
                    {group.title}
                  </h3>
                  {group.conversations.map(renderConversation)}
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
