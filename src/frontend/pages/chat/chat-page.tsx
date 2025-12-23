import { useState, useEffect, useRef } from "react";
import { Button } from "@/frontend/components/ui/button";
import { ArrowUp } from "lucide-react";
import { Textarea } from "@/frontend/components/ui/textarea";
import { useWebSocket } from "@/frontend/hooks/useWebSocket";
import ConversationSidebar from "@/frontend/components/conversation-sidebar";
import { MarkdownRenderer } from "@/frontend/components/markdown-renderer";
import { useDevMode } from "@/frontend/contexts/dev-mode-context";
import {
  SendMessage,
  LoadConversation,
  GetConversations,
  AIResponseEvent,
  AIResponseChunkEvent,
  ConversationUpdatedEvent,
  SystemNotificationEvent,
  AgentToolStartEvent,
  AgentToolCompleteEvent,
  AgentToolErrorEvent,
  ChatAgentErrorEvent,
  type AIResponsePayload,
  type AIResponseChunkPayload,
  type ConversationUpdatedPayload,
  type SystemNotificationPayload,
  type AgentToolStartPayload,
  type AgentToolCompletePayload,
  type AgentToolErrorPayload,
  type ChatAgentErrorPayload,
} from "@/shared/commands";

interface Message {
  id?: number;
  sender: "user" | "assistant" | "system";
  text: string;
  timestamp: string;
  toolInfo?: {
    toolName: string;
    status: "start" | "complete" | "error";
    description?: string;
    error?: string;
  };
  agentError?: {
    error: string;
    canRetry: boolean;
  };
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
  const [loadingStatus, setLoadingStatus] = useState<"Thinking..." | "Generating...">(
    "Thinking...",
  );
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>();
  const [currentConversationTitle, setCurrentConversationTitle] = useState("New Chat");
  const [hasSelectedConversation, setHasSelectedConversation] = useState(false);
  const [lastFailedMessage, setLastFailedMessage] = useState<string>("");
  const [hasAgentError, setHasAgentError] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { connectionState, send, on, reconnect } = useWebSocket({
    url: `${window.location.protocol === "https:" ? "wss:" : "ws:"}//${
      window.location.host
    }/chat-ws`,
  });

  const { allowSendingMessages } = useDevMode();

  const isConnected = connectionState === "connected";

  // ============================================================================
  // Event Handlers
  // ============================================================================

  useEffect(() => {
    const unsubAIResponse = on<AIResponsePayload>(AIResponseEvent, (payload) => {
      setMessages((prev) => {
        // Find if we already have this message (from chunks)
        const existingIndex = prev.findIndex((m) => m.id === payload.messageId);
        if (existingIndex !== -1) {
          const newMessages = [...prev];
          const existingMessage = newMessages[existingIndex];
          if (existingMessage) {
            newMessages[existingIndex] = {
              ...existingMessage,
              text: payload.content, // Ensure final content is exactly as sent
              timestamp: payload.timestamp,
            };
            return newMessages;
          }
        }

        // If not found (shouldn't really happen with chunks), add it
        const newMessage: Message = {
          id: payload.messageId,
          sender: "assistant",
          text: payload.content,
          timestamp: payload.timestamp,
        };
        return [...prev, newMessage];
      });
      setIsLoading(false);
    });

    const unsubAIResponseChunk = on<AIResponseChunkPayload>(AIResponseChunkEvent, (payload) => {
      // Switch status to generating as soon as we get chunks
      setLoadingStatus("Generating...");

      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === payload.messageId);
        if (existingIndex !== -1) {
          const newMessages = [...prev];
          const existingMessage = newMessages[existingIndex];
          if (existingMessage) {
            newMessages[existingIndex] = {
              ...existingMessage,
              text:
                existingMessage.text === "🤔 Thinking..."
                  ? payload.delta
                  : existingMessage.text + payload.delta,
              timestamp: payload.timestamp,
            };
            return newMessages;
          }
        }

        // First chunk for this message
        const newMessage: Message = {
          id: payload.messageId,
          sender: "assistant",
          text: payload.delta,
          timestamp: payload.timestamp,
        };
        return [...prev, newMessage];
      });
      // We keep isLoading true while chunks are coming
    });

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

    // Agent tool event handlers (for future use)
    const unsubAgentToolStart = on<AgentToolStartPayload>(AgentToolStartEvent, (payload) => {
      if (payload.conversationId === currentConversationId) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            text: `🔧 Using tool: ${payload.toolName}${payload.description ? ` - ${payload.description}` : ""}`,
            timestamp: payload.timestamp,
            toolInfo: {
              toolName: payload.toolName,
              status: "start",
              description: payload.description,
            },
          },
        ]);
      }
    });

    const unsubAgentToolComplete = on<AgentToolCompletePayload>(
      AgentToolCompleteEvent,
      (payload) => {
        if (payload.conversationId === currentConversationId) {
          setMessages((prev) => [
            ...prev,
            {
              sender: "system",
              text: `✅ Completed: ${payload.toolName}`,
              timestamp: payload.timestamp,
              toolInfo: {
                toolName: payload.toolName,
                status: "complete",
              },
            },
          ]);
        }
      },
    );

    const unsubAgentToolError = on<AgentToolErrorPayload>(AgentToolErrorEvent, (payload) => {
      if (payload.conversationId === currentConversationId) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            text: `❌ Error in ${payload.toolName}: ${payload.error}`,
            timestamp: payload.timestamp,
            toolInfo: {
              toolName: payload.toolName,
              status: "error",
              error: payload.error,
            },
          },
        ]);
      }
    });

    const unsubChatAgentError = on<ChatAgentErrorPayload>(ChatAgentErrorEvent, (payload) => {
      if (payload.conversationId === currentConversationId) {
        setMessages((prev) => [
          ...prev,
          {
            sender: "system",
            text: `❌ Critical Error: ${payload.error}`,
            timestamp: payload.timestamp,
            agentError: {
              error: payload.error,
              canRetry: payload.canRetry,
            },
          },
        ]);
        setIsLoading(false);
        setHasAgentError(true);
      }
    });

    return () => {
      unsubAIResponse();
      unsubAIResponseChunk();
      unsubConversationUpdated();
      unsubSystemNotification();
      unsubAgentToolStart();
      unsubAgentToolComplete();
      unsubAgentToolError();
      unsubChatAgentError();
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
      textareaRef.current.style.height = "auto";
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

    // Store the message in case we need to retry
    const messageContent = inputMessage;
    setLastFailedMessage("");

    const userMessage: Message = {
      sender: "user",
      text: messageContent,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputMessage("");
    setLoadingStatus("Thinking...");
    setIsLoading(true);
    setHasAgentError(false);

    try {
      const result = await send(SendMessage, {
        content: messageContent,
        conversationId: currentConversationId,
      });

      // Update the user message with its actual ID from the database
      setMessages((prev) => {
        const lastMessageIndex = prev.length - 1;
        const lastMessage = prev[lastMessageIndex];
        if (lastMessage && lastMessage.sender === "user") {
          const newMessages = [...prev];
          newMessages[lastMessageIndex] = {
            ...lastMessage,
            id: result.messageId,
          };
          return newMessages;
        }
        return prev;
      });

      // Update conversation ID if this was first message
      if (!currentConversationId) {
        setCurrentConversationId(result.conversationId);
        // Refresh sidebar to show the new (placeholder) thread immediately
        loadConversationsList();
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      setIsLoading(false);
      setLastFailedMessage(messageContent);
      setHasAgentError(true);
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          text: `❌ Error: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: new Date().toISOString(),
          agentError: {
            error: error instanceof Error ? error.message : "Unknown error",
            canRetry: true,
          },
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
          id: msg.id,
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

  const handleRetryMessage = async () => {
    if (!lastFailedMessage.trim()) return;

    const userMessage: Message = {
      sender: "user",
      text: lastFailedMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLastFailedMessage("");
    setLoadingStatus("Thinking...");
    setIsLoading(true);
    setHasAgentError(false);

    try {
      const result = await send(SendMessage, {
        content: lastFailedMessage,
        conversationId: currentConversationId,
      });

      // Update the user message with its actual ID from the database
      setMessages((prev) => {
        const lastMessageIndex = prev.length - 1;
        const lastMessage = prev[lastMessageIndex];
        if (lastMessage && lastMessage.sender === "user") {
          const newMessages = [...prev];
          newMessages[lastMessageIndex] = {
            ...lastMessage,
            id: result.messageId,
          };
          return newMessages;
        }
        return prev;
      });

      // Update conversation ID if this was first message
      if (!currentConversationId) {
        setCurrentConversationId(result.conversationId);
      }
    } catch (error) {
      console.error("Failed to retry message:", error);
      setIsLoading(false);
      setMessages((prev) => [
        ...prev,
        {
          sender: "system",
          text: `❌ Retry failed: ${error instanceof Error ? error.message : "Unknown error"}`,
          timestamp: new Date().toISOString(),
          agentError: {
            error: error instanceof Error ? error.message : "Unknown error",
            canRetry: true,
          },
        },
      ]);
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
    <div className="bg-background flex h-screen">
      {hasSelectedConversation && (
        <ConversationSidebar
          conversations={conversations}
          currentConversationId={currentConversationId}
          onLoadConversation={handleLoadConversation}
          onNewConversation={handleNewConversation}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="bg-card flex shrink-0 items-center justify-between border-b px-4 py-5 shadow-sm">
          <h1 className="text-foreground text-xl font-bold">
            {currentConversationTitle} - AI Chat
          </h1>
          <div className="flex items-center gap-2">
            <span
              data-status={status.status}
              className="h-2 w-2 rounded-full data-[status=connected]:bg-green-500 data-[status=connecting]:bg-yellow-500 data-[status=disconnected]:bg-gray-500 data-[status=failed]:bg-red-500 data-[status=reconnecting]:bg-orange-500 data-[status=connected]:dark:bg-green-600 data-[status=connecting]:dark:bg-yellow-600 data-[status=disconnected]:dark:bg-gray-600 data-[status=failed]:dark:bg-red-600 data-[status=reconnecting]:dark:bg-orange-600"
            ></span>
            <span className="text-muted-foreground text-sm">{status.text}</span>
          </div>
        </header>

        {connectionState === "failed" && (
          <div className="bg-destructive/10 border-destructive/20 mx-4 mt-4 flex shrink-0 items-center justify-between rounded-lg border p-4">
            <p className="text-destructive">Connection failed</p>
            <Button onClick={reconnect} variant="outline" size="sm">
              Retry Connection
            </Button>
          </div>
        )}

        <div className="min-h-0 flex-1 overflow-hidden p-4">
          <div className="flex h-full flex-col rounded-xl border border-neutral-600/50 px-1 py-2 shadow-md dark:border-neutral-500/50">
            {!hasSelectedConversation ? (
              <div className="custom-scrollbar flex-1 overflow-y-auto p-6">
                <div className="mx-auto max-w-4xl">
                  <h2 className="text-foreground mb-6 text-2xl font-bold">Choose a conversation</h2>

                  <div className="mb-8">
                    <Button
                      onClick={handleNewConversation}
                      className="w-full px-6 py-3 text-lg sm:w-auto"
                      size="lg"
                      disabled={!isConnected}
                    >
                      + New Chat
                    </Button>
                  </div>

                  {conversations.length > 0 ? (
                    <div>
                      <h3 className="text-muted-foreground mb-4 text-lg font-semibold">
                        Recent conversations
                      </h3>
                      <div className="space-y-3">
                        {conversations.map((conversation) => (
                          <div
                            key={conversation.id}
                            onClick={() => handleLoadConversation(conversation.id)}
                            className="bg-card border-border hover:bg-muted/50 cursor-pointer rounded-lg border p-4 transition-colors"
                          >
                            <h4 className="text-foreground truncate font-medium">
                              {conversation.title}
                            </h4>
                            <p className="text-muted-foreground mt-1 text-sm">
                              {new Date(conversation.updatedAt).toLocaleString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="py-12 text-center">
                      <p className="text-muted-foreground">No previous conversations found.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <>
                <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center">
                      <p className="text-muted-foreground">Start a conversation with AI...</p>
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
                              ? "text-foreground max-w-xs rounded-lg bg-gray-200/60 p-3 md:max-w-md lg:max-w-lg xl:max-w-xl dark:bg-neutral-700/50"
                              : message.sender === "assistant"
                                ? "text-foreground max-w-2xl p-4 xl:max-w-3xl"
                                : message.toolInfo
                                  ? `max-w-xs rounded-lg p-3 md:max-w-md lg:max-w-lg xl:max-w-xl ${
                                      message.toolInfo.status === "error"
                                        ? "border-l-4 border-red-500 bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100"
                                        : message.toolInfo.status === "complete"
                                          ? "border-l-4 border-green-500 bg-green-100 text-green-900 dark:bg-green-900/30 dark:text-green-100"
                                          : "border-l-4 border-blue-500 bg-blue-100 text-blue-900 dark:bg-blue-900/30 dark:text-blue-100"
                                    }`
                                  : message.agentError
                                    ? "border-l-4 border-red-500 bg-red-100 text-red-900 dark:bg-red-900/30 dark:text-red-100"
                                    : "bg-muted/70 text-muted-foreground max-w-xs rounded-lg p-3 md:max-w-md lg:max-w-lg xl:max-w-xl"
                          }`}
                        >
                          {message.sender === "assistant" ? (
                            <MarkdownRenderer content={message.text} />
                          ) : (
                            <>
                              <p className="whitespace-pre-wrap">{message.text}</p>
                              {message.agentError && message.agentError.canRetry && (
                                <div className="mt-2 flex gap-2">
                                  <Button
                                    onClick={handleRetryMessage}
                                    size="sm"
                                    variant="outline"
                                    className="text-xs"
                                  >
                                    Try Again
                                  </Button>
                                </div>
                              )}
                            </>
                          )}
                          <p
                            className={`mt-1 text-xs ${
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
                      <div className="text-foreground max-w-2xl p-4 xl:max-w-3xl">
                        <p>{loadingStatus}</p>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="bg-card border-t p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      ref={textareaRef}
                      value={inputMessage}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message..."
                      disabled={!isConnected || isLoading}
                      className="max-h-[120px] min-h-[40px] flex-1 resize-none"
                      rows={1}
                    />
                    <Button
                      onClick={handleSendMessage}
                      disabled={
                        !allowSendingMessages && (!isConnected || isLoading || !inputMessage.trim())
                      }
                      className="h-10 w-10 rounded-full p-2"
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
