import { useState, useEffect, useRef } from "react";
import { Button } from "@/frontend/components/ui/button";
import { Input } from "@/frontend/components/ui/input";
import { Card } from "@/frontend/components/ui/card";
import { ArrowUp } from "lucide-react";
import { Textarea } from "@/frontend/components/ui/textarea";
import { useWebSocket } from "@/frontend/hooks/useWebSocket";
import ConversationSidebar from "@/frontend/components/conversation-sidebar";
import { MarkdownRenderer } from "@/frontend/components/markdown-renderer";
import {
  SendMessage,
  LoadConversation,
  GetConversations,
  AIResponseEvent,
  ConversationUpdatedEvent,
  SystemNotificationEvent,
  type AIResponsePayload,
  type ConversationUpdatedPayload,
  type SystemNotificationPayload,
} from "@/shared/commands";

interface Message {
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
}

interface Conversation {
  id: string;
  title: string;
  updatedAt: string;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>();
  const [currentConversationTitle, setCurrentConversationTitle] =
    useState("New Chat");
  const [hasSelectedConversation, setHasSelectedConversation] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { connectionState, send, on, reconnect } = useWebSocket({
    url: `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
      window.location.host
    }/chat-ws`,
  });

  const isConnected = connectionState === "connected";

  // ============================================================================
  // Event Handlers
  // ============================================================================

  useEffect(() => {
    const unsubAIResponse = on<AIResponsePayload>(
      AIResponseEvent,
      (payload) => {
        setMessages((prev) => [
          ...prev,
          {
            sender: "assistant",
            text: payload.content,
            timestamp: payload.timestamp,
          },
        ]);
        setIsLoading(false);
      },
    );

    const unsubConversationUpdated = on<ConversationUpdatedPayload>(
      ConversationUpdatedEvent,
      (payload) => {
        if (payload.conversationId === currentConversationId) {
          setCurrentConversationTitle(payload.title);
        }
        // Refresh conversations list
        loadConversationsList();
      },
    );

    const unsubSystemNotification = on<SystemNotificationPayload>(
      SystemNotificationEvent,
      (payload) => {
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            text: payload.message,
            timestamp: new Date().toISOString(),
          },
        ]);
      },
    );

    return () => {
      unsubAIResponse();
      unsubConversationUpdated();
      unsubSystemNotification();
    };
  }, [on, currentConversationId]);

  // ============================================================================
  // Load conversations on connect
  // ============================================================================

  useEffect(() => {
    if (isConnected) {
      loadConversationsList();
    }
  }, [isConnected]);

  // ============================================================================
  // Auto-scroll
  // ============================================================================

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ============================================================================
  // Auto-resize textarea
  // ============================================================================

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInputMessage(e.target.value);
    
    // Auto-resize textarea
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ============================================================================
  // Actions
  // ============================================================================

  const loadConversationsList = async () => {
    try {
      const result = await send(GetConversations, {});
      setConversations(result.conversations);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || !isConnected) return;

    const userMessage: Message = {
      sender: "user",
      text: inputMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setIsLoading(true);

    try {
      const result = await send(SendMessage, {
        content: inputMessage,
        conversationId: currentConversationId,
      });

      // Update conversation ID if this was first message
      if (!currentConversationId) {
        setCurrentConversationId(result.conversationId);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          text: `Error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          timestamp: new Date().toISOString(),
        },
      ]);
    }
  };

  const handleNewConversation = async () => {
    try {
      const result = await send(LoadConversation, {});
      setCurrentConversationId(result.conversationId);
      setCurrentConversationTitle(result.title);
      setMessages([]);
      setHasSelectedConversation(true);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  };

  const handleLoadConversation = async (conversationId?: string) => {
    try {
      const result = await send(LoadConversation, { conversationId });
      setCurrentConversationId(result.conversationId);
      setCurrentConversationTitle(result.title);
      setMessages(
        result.messages.map((msg) => ({
          sender: msg.role,
          text: msg.content,
          timestamp: msg.createdAt,
        })),
      );
      setHasSelectedConversation(true);
    } catch (error) {
      console.error("Failed to load conversation:", error);
    }
  };

  const handleKeyUp = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // ============================================================================
  // Status Display
  // ============================================================================

  const getStatusDisplay = () => {
    switch (connectionState) {
      case "connected":
        return { status: "connected", text: "Connected" };
      case "connecting":
        return { status: "connecting", text: "Connecting..." };
      case "reconnecting":
        return { status: "reconnecting", text: "Reconnecting..." };
      case "failed":
        return { status: "failed", text: "Connection Failed" };
      case "disconnected":
        return { status: "disconnected", text: "Disconnected" };
    }
  };

  const status = getStatusDisplay();

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="flex h-screen bg-background">
      {hasSelectedConversation && (
        <ConversationSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onLoadConversation={handleLoadConversation}
          onNewConversation={handleNewConversation}
        />
      )}

      <div className="flex-1 flex flex-col min-h-0">
        <header className="bg-card shadow-sm border-b px-4 py-5 flex items-center justify-between flex-shrink-0">
          <h1 className="text-xl font-bold text-foreground">
            {currentConversationTitle} - AI Chat
          </h1>
          <div className="flex items-center gap-2">
            <span
              data-status={status.status}
              className="w-2 h-2 rounded-full
                data-[status=connected]:bg-green-500 data-[status=connected]:dark:bg-green-600
                data-[status=connecting]:bg-yellow-500 data-[status=connecting]:dark:bg-yellow-600
                data-[status=reconnecting]:bg-orange-500 data-[status=reconnecting]:dark:bg-orange-600
                data-[status=failed]:bg-red-500 data-[status=failed]:dark:bg-red-600
                data-[status=disconnected]:bg-gray-500 data-[status=disconnected]:dark:bg-gray-600"
            ></span>
            <span className="text-sm text-muted-foreground">{status.text}</span>
          </div>
        </header>

        {connectionState === "failed" && (
          <div className="mx-4 mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-lg flex items-center justify-between flex-shrink-0">
            <p className="text-destructive">Connection failed</p>
            <Button onClick={reconnect} variant="outline" size="sm">
              Retry Connection
            </Button>
          </div>
        )}

        <div className="flex-1 overflow-hidden p-4 min-h-0">
          <div className="h-full flex flex-col py-2 px-1 shadow-md rounded-xl border border-neutral-600/50 dark:border-neutral-500/50">
            {!hasSelectedConversation ? (
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                <div className="max-w-4xl mx-auto">
                  <h2 className="text-2xl font-bold text-foreground mb-6">
                    Choose a conversation
                  </h2>

                  <div className="mb-8">
                    <Button
                      onClick={handleNewConversation}
                      className="w-full sm:w-auto px-6 py-3 text-lg"
                      size="lg"
                      disabled={!isConnected}
                    >
                      + New Chat
                    </Button>
                  </div>

                  {conversations.length > 0 ? (
                    <div>
                      <h3 className="text-lg font-semibold text-muted-foreground mb-4">
                        Recent conversations
                      </h3>
                      <div className="space-y-3">
                        {conversations.map((conversation) => (
                          <div
                            key={conversation.id}
                            onClick={() =>
                              handleLoadConversation(conversation.id)
                            }
                            className="p-4 bg-card border border-border rounded-lg hover:bg-muted/50 cursor-pointer transition-colors"
                          >
                            <h4 className="font-medium text-foreground truncate">
                              {conversation.title}
                            </h4>
                            <p className="text-sm text-muted-foreground mt-1">
                              {new Date(
                                conversation.updatedAt,
                              ).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <p className="text-muted-foreground">
                        No previous conversations found.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-muted-foreground">
                        Start a conversation with AI...
                      </p>
                    </div>
                  ) : (
                    messages.map((message, index) => (
                      <div
                        key={index}
                        className={`${
                          message.sender === "user"
                            ? "flex justify-end"
                            : message.sender === "assistant"
                              ? "flex justify-center"
                              : "flex justify-start"
                        }`}
                      >
                        <div
                          className={`${
                            message.sender === "user"
                              ? "max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg p-3 bg-gray-200/60 dark:bg-neutral-700/50 text-foreground"
                              : message.sender === "assistant"
                                ? "max-w-2xl xl:max-w-3xl p-4 text-foreground"
                                : "max-w-xs md:max-w-md lg:max-w-lg xl:max-w-xl rounded-lg p-3 bg-muted/70 text-muted-foreground"
                          }`}
                        >
                          {message.sender === "assistant" ? (
                            <MarkdownRenderer content={message.text} />
                          ) : (
                            <p className="whitespace-pre-wrap">
                              {message.text}
                            </p>
                          )}
                          <p
                            className={`text-xs mt-1 ${
                              message.sender === "assistant"
                                ? "text-muted-foreground text-center"
                                : "text-muted-foreground text-right"
                            }`}
                          >
                            {new Date(message.timestamp).toLocaleTimeString()}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                  {isLoading && (
                    <div className="flex justify-center">
                      <div className="max-w-2xl xl:max-w-3xl p-4 text-foreground">
                        <p>Thinking...</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="border-t p-3 bg-card">
                  <div className="flex gap-2 items-end">
                    <Textarea
                      ref={textareaRef}
                      value={inputMessage}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message..."
                      disabled={!isConnected || isLoading}
                      className="flex-1 resize-none min-h-[40px] max-h-[120px]"
                      rows={1}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={
                        !isConnected || isLoading || !inputMessage.trim()
                      }
                      className="rounded-full p-2 h-10 w-10"
                      aria-label="Send"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
