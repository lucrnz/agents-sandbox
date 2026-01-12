import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams, useLocation } from "wouter";
import { Button } from "@/frontend/components/ui/button";
import {
  ArrowUp,
  Zap,
  Square,
  ChevronDown,
  ChevronRight,
  Brain,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Textarea } from "@/frontend/components/ui/textarea";
import { useWebSocket } from "@/frontend/hooks/useWebSocket";
import ConversationSidebar from "@/frontend/components/conversation-sidebar";
import { MarkdownRenderer } from "@/frontend/components/markdown-renderer";
import { ToolSelector } from "@/frontend/components/tool-selector";
import { ProjectsSidebar } from "@/frontend/components/projects-sidebar";
import { AgentQuestionDialog } from "@/frontend/components/agent-question-dialog";
import { toast } from "sonner";
import {
  SendMessage,
  LoadConversation,
  GetConversations,
  SuggestAnswer,
  StopGeneration,
  AgentQuestionEvent,
  AIResponseEvent,
  AIResponseChunkEvent,
  AIReasoningChunkEvent,
  ConversationUpdatedEvent,
  SystemNotificationEvent,
  AgentStatusUpdateEvent,
  ChatAgentErrorEvent,
  BackgroundTaskErrorEvent,
  SuggestAnswerChunkEvent,
  GenerationStoppedEvent,
  type AgentQuestionPayload,
  type AIResponsePayload,
  type AIResponseChunkPayload,
  type AIReasoningChunkPayload,
  type ConversationUpdatedPayload,
  type SystemNotificationPayload,
  type AgentStatusUpdatePayload,
  type ChatAgentErrorPayload,
  type BackgroundTaskErrorPayload,
  type SuggestAnswerChunkPayload,
  type GenerationStoppedPayload,
  type ToolName,
  type Conversation,
  type AgentPhase,
} from "@/shared/commands";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/frontend/components/ui/dialog";

// Random greetings for the landing page
const GREETINGS = [
  "What can I help you with?",
  "Let's Grok",
  "Grok & Coffee",
  "Ready to explore?",
  "What's on your mind?",
  "Let's figure this out together",
  "Ask me anything",
  "Curious about something?",
  "What shall we discover today?",
  "Ready when you are",
  "Let's dive in",
  "How can I assist?",
  "What would you like to know?",
  "Let's chat",
  "Fire away!",
  "I'm all ears",
  "What's the plan?",
  "Let's make something happen",
  "Thinking cap on",
  "What's the puzzle?",
  "Let's solve this",
  "Your move",
  "What's cooking?",
  "Ready to roll",
  "What brings you here?",
];

interface Message {
  id?: number;
  sender: "user" | "assistant" | "system";
  text: string;
  reasoning?: string;
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

export default function ChatPage() {
  const [, navigate] = useLocation();
  const params = useParams<{ conversationId?: string }>();
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputMessage, setInputMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState<AgentPhase>("thinking");
  const [loadingMessage, setLoadingMessage] = useState<string | undefined>();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string>();
  const [currentConversationTitle, setCurrentConversationTitle] = useState("New Chat");
  const [lastFailedMessage, setLastFailedMessage] = useState<string>("");
  const [hasAgentError, setHasAgentError] = useState(false);
  const [selectedTools, setSelectedTools] = useState<ToolName[]>([]);
  const [expandedReasoning, setExpandedReasoning] = useState<Set<number>>(new Set());
  const [pendingQuestion, setPendingQuestion] = useState<AgentQuestionPayload | undefined>();

  // Random greeting - memoized to stay consistent during session
  const greeting = useMemo(() => GREETINGS[Math.floor(Math.random() * GREETINGS.length)], []);

  // Auto-answer state
  const [isAutoAnswerMode, setIsAutoAnswerMode] = useState(false);
  const [autoAnswerInstructions, setAutoAnswerInstructions] = useState("");
  const [isGeneratingSuggestion, setIsGeneratingSuggestion] = useState(false);
  const [isInstructionsDialogOpen, setIsInstructionsDialogOpen] = useState(false);
  const [instructionsInput, setInstructionsInput] = useState("");
  const autoAnswerTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isStartingAutoAnswerRef = useRef(false);
  const isGeneratingSuggestionRef = useRef(false);

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
      // Switch phase to generating as soon as we get text chunks
      setLoadingPhase("generating");

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

    const unsubAIReasoningChunk = on<AIReasoningChunkPayload>(AIReasoningChunkEvent, (payload) => {
      // Keep phase as thinking while reasoning
      setLoadingPhase("thinking");

      setMessages((prev) => {
        const existingIndex = prev.findIndex((m) => m.id === payload.messageId);
        if (existingIndex !== -1) {
          const newMessages = [...prev];
          const existingMessage = newMessages[existingIndex];
          if (existingMessage) {
            // Clear "🤔 Thinking..." placeholder when we start getting reasoning
            const currentText =
              existingMessage.text === "🤔 Thinking..." ? "" : existingMessage.text;
            newMessages[existingIndex] = {
              ...existingMessage,
              text: currentText,
              reasoning: (existingMessage.reasoning || "") + payload.delta,
              timestamp: payload.timestamp,
            };
            return newMessages;
          }
        }

        // First reasoning chunk for this message
        const newMessage: Message = {
          id: payload.messageId,
          sender: "assistant",
          text: "",
          reasoning: payload.delta,
          timestamp: payload.timestamp,
        };
        return [...prev, newMessage];
      });
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

    // Agent status updates (real-time feedback)
    const unsubAgentStatusUpdate = on<AgentStatusUpdatePayload>(
      AgentStatusUpdateEvent,
      (payload) => {
        if (payload.conversationId === currentConversationId) {
          setLoadingPhase(payload.phase);
          setLoadingMessage(payload.message);
          setIsLoading(true);
        }
      },
    );

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

    const unsubBackgroundTaskError = on<BackgroundTaskErrorPayload>(
      BackgroundTaskErrorEvent,
      (payload) => {
        if (payload.conversationId === currentConversationId) {
          toast.error(payload.message);
          // Special case: if ai_response failed, we need to stop loading
          if (payload.taskType === "ai_response") {
            setIsLoading(false);
          }
        }
      },
    );

    const unsubSuggestAnswerChunk = on<SuggestAnswerChunkPayload>(
      SuggestAnswerChunkEvent,
      (payload) => {
        // Only stream chunks if we're in auto-answer mode and generating
        if (
          payload.conversationId === currentConversationId &&
          isAutoAnswerMode &&
          isGeneratingSuggestion
        ) {
          setInputMessage((prev) => prev + payload.delta);
        }
      },
    );

    const unsubGenerationStopped = on<GenerationStoppedPayload>(
      GenerationStoppedEvent,
      (payload) => {
        if (payload.conversationId === currentConversationId) {
          // Update the message with the stopped content
          setMessages((prev) => {
            const existingIndex = prev.findIndex((m) => m.id === payload.messageId);
            if (existingIndex !== -1) {
              const newMessages = [...prev];
              const existingMessage = newMessages[existingIndex];
              if (existingMessage) {
                newMessages[existingIndex] = {
                  ...existingMessage,
                  text: payload.partialContent,
                  timestamp: payload.timestamp,
                };
                return newMessages;
              }
            }
            return prev;
          });
          setIsLoading(false);
        }
      },
    );

    const unsubAgentQuestion = on<AgentQuestionPayload>(AgentQuestionEvent, (payload) => {
      if (payload.conversationId === currentConversationId) {
        setPendingQuestion(payload);
      }
    });

    return () => {
      unsubAIResponse();
      unsubAIResponseChunk();
      unsubAIReasoningChunk();
      unsubConversationUpdated();
      unsubSystemNotification();
      unsubAgentStatusUpdate();
      unsubChatAgentError();
      unsubBackgroundTaskError();
      unsubSuggestAnswerChunk();
      unsubGenerationStopped();
      unsubAgentQuestion();
    };
  }, [on, currentConversationId, isAutoAnswerMode, isGeneratingSuggestion]);

  // ============================================================================
  // Load conversations on connect
  // ============================================================================

  useEffect(() => {
    if (isConnected) {
      loadConversationsList();
    }
  }, [isConnected]);

  // ============================================================================
  // Dynamic page title
  // ============================================================================

  useEffect(() => {
    if (
      currentConversationTitle &&
      currentConversationTitle !== "New Chat" &&
      messages.length > 0
    ) {
      document.title = `${currentConversationTitle} - Super Chat`;
    } else {
      document.title = "Super Chat";
    }
  }, [currentConversationTitle, messages.length]);

  // ============================================================================
  // Auto-scroll (throttled during streaming)
  // ============================================================================

  const lastScrollTimeRef = useRef<number>(0);
  const scrollThrottleMs = 250;

  useEffect(() => {
    const now = Date.now();
    const timeSinceLastScroll = now - lastScrollTimeRef.current;

    // Scroll immediately if:
    // 1. Response finished generating (isLoading just became false)
    // 2. Enough time has passed since last scroll (throttle during streaming)
    if (!isLoading || timeSinceLastScroll >= scrollThrottleMs) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      lastScrollTimeRef.current = now;
    }
  }, [messages, isLoading]);

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

  const loadConversationsList = useCallback(async () => {
    try {
      const result = await send(GetConversations, {});
      setConversations(result.conversations);
    } catch (error) {
      console.error("Failed to load conversations:", error);
    }
  }, [send]);

  const handleSendMessage = useCallback(
    async (messageContent?: string) => {
      // Use provided message content or fall back to inputMessage state
      const contentToSend = messageContent ?? inputMessage;
      if (!contentToSend.trim() || !isConnected) return;

      // Store the message in case we need to retry
      const finalMessageContent = contentToSend;
      setLastFailedMessage("");

      const userMessage: Message = {
        sender: "user",
        text: finalMessageContent,
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage]);
      // Only clear input if we're using the inputMessage state (not when a message is provided)
      if (!messageContent) {
        setInputMessage("");
      }
      setLoadingPhase("thinking");
      setLoadingMessage(undefined);
      setIsLoading(true);
      setHasAgentError(false);

      try {
        const result = await send(SendMessage, {
          content: finalMessageContent,
          conversationId: currentConversationId,
          selectedTools,
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
        setLastFailedMessage(finalMessageContent);
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
    },
    [inputMessage, isConnected, currentConversationId, selectedTools, send, loadConversationsList],
  );

  const handleNewConversation = useCallback(async () => {
    try {
      const result = await send(LoadConversation, {});
      setCurrentConversationId(result.conversationId);
      setCurrentConversationTitle(result.title);
      setMessages([]);
    } catch (error) {
      console.error("Failed to create conversation:", error);
    }
  }, [send]);

  const handleLoadConversation = useCallback(
    async (conversationId?: string) => {
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
        // Navigate to conversation URL if not already there
        if (conversationId && window.location.pathname !== `/c/${conversationId}`) {
          navigate(`/c/${conversationId}`);
        }
      } catch (error) {
        console.error("Failed to load conversation:", error);
      }
    },
    [send, navigate],
  );

  // Load conversation from URL parameter
  useEffect(() => {
    if (isConnected && params.conversationId && params.conversationId !== currentConversationId) {
      handleLoadConversation(params.conversationId);
    }
  }, [isConnected, params.conversationId, currentConversationId, handleLoadConversation]);

  const handleRetryMessage = useCallback(async () => {
    if (!lastFailedMessage.trim()) return;

    const userMessage: Message = {
      sender: "user",
      text: lastFailedMessage,
      timestamp: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setLastFailedMessage("");
    setLoadingPhase("thinking");
    setLoadingMessage(undefined);
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
  }, [lastFailedMessage, currentConversationId, send]);

  const handleStopGeneration = useCallback(async () => {
    if (!currentConversationId || !isLoading) return;

    try {
      setLoadingPhase("stopping");
      const result = await send(StopGeneration, {
        conversationId: currentConversationId,
      });

      if (result.stopped) {
        console.log("Generation stopped successfully");
        // The GenerationStoppedEvent will handle updating the UI
      } else {
        console.log("No active generation to stop");
        setIsLoading(false);
      }
    } catch (error) {
      console.error("Failed to stop generation:", error);
      setIsLoading(false);
    }
  }, [currentConversationId, isLoading, send]);

  // ============================================================================
  // Auto-Answer Functions
  // ============================================================================

  const generateSuggestedAnswer = useCallback(
    async (instructionsOverride?: string) => {
      console.log("[AutoAnswer] generateSuggestedAnswer called", {
        currentConversationId,
        isAutoAnswerMode,
        isStarting: isStartingAutoAnswerRef.current,
        refCurrent: isGeneratingSuggestionRef.current,
      });

      // Allow execution if we're starting or if auto-answer mode is active
      if (!currentConversationId || (!isAutoAnswerMode && !isStartingAutoAnswerRef.current)) {
        console.log("[AutoAnswer] bailing out: precondition failed");
        return;
      }

      // Use override if provided (for initial call), otherwise use state
      const instructionsToUse = instructionsOverride ?? autoAnswerInstructions;

      if (isGeneratingSuggestionRef.current) {
        console.log("[AutoAnswer] bailing out: already generating (ref is true)");
        return;
      }

      try {
        console.log("[AutoAnswer] Starting generation...");
        isGeneratingSuggestionRef.current = true;
        setIsGeneratingSuggestion(true);
        // Clear input to prepare for streaming
        setInputMessage("");

        const result = await send(SuggestAnswer, {
          conversationId: currentConversationId,
          instructions: instructionsToUse,
        });

        // Reset the starting flag after first successful generation
        // Note: We need to capture the starting state BEFORE resetting since the
        // closure may have stale isAutoAnswerMode value when started via startAutoAnswerMode
        const wasStarting = isStartingAutoAnswerRef.current;
        isStartingAutoAnswerRef.current = false;

        // The result contains the full suggested answer
        // Check wasStarting to handle the case where isAutoAnswerMode hasn't propagated yet
        if (result.suggestedAnswer && (isAutoAnswerMode || wasStarting)) {
          console.log("[AutoAnswer] Generation complete, sending message...");
          // The chunks have been streaming to inputMessage for visual feedback
          // Now send the complete result directly to ensure the full message is sent
          await handleSendMessage(result.suggestedAnswer);
          console.log("[AutoAnswer] Message sent, clearing input");
          setInputMessage("");

          // Trigger next iteration immediately when ready (via response effect)
        } else {
          console.log("[AutoAnswer] Result ignored:", {
            hasSuggestedAnswer: !!result.suggestedAnswer,
            isAutoAnswerMode,
            wasStarting,
          });
        }
      } catch (error) {
        console.error("Error generating suggested answer:", error);
        toast.error("Failed to generate auto-answer. Disabling auto-answer mode.");
        setIsAutoAnswerMode(false);
        isStartingAutoAnswerRef.current = false;
      } finally {
        console.log("[AutoAnswer] Finally block, resetting ref");
        setIsGeneratingSuggestion(false);
        isGeneratingSuggestionRef.current = false;
      }
    },
    [currentConversationId, isAutoAnswerMode, autoAnswerInstructions, send, handleSendMessage],
  );

  const startAutoAnswerMode = useCallback(
    (instructions: string) => {
      console.log("[AutoAnswer] startAutoAnswerMode called");
      setAutoAnswerInstructions(instructions);
      setIsAutoAnswerMode(true);
      // Set flag to allow immediate execution before state propagates
      isStartingAutoAnswerRef.current = true;
      // Pass instructions directly to avoid state timing issue
      generateSuggestedAnswer(instructions);
    },
    [generateSuggestedAnswer],
  );

  const stopAutoAnswerMode = useCallback(() => {
    setIsAutoAnswerMode(false);
    setIsGeneratingSuggestion(false);
    isStartingAutoAnswerRef.current = false;
    isGeneratingSuggestionRef.current = false;

    if (autoAnswerTimeoutRef.current) {
      clearTimeout(autoAnswerTimeoutRef.current);
      autoAnswerTimeoutRef.current = null;
    }
  }, []);

  // Response-triggered continuation
  useEffect(() => {
    if (isAutoAnswerMode && !isLoading && messages.length > 0 && !isGeneratingSuggestion) {
      const lastMessage = messages[messages.length - 1];

      if (lastMessage?.sender === "assistant") {
        // Trigger immediately without delay
        generateSuggestedAnswer();
      }
    }

    return () => {
      if (autoAnswerTimeoutRef.current) {
        clearTimeout(autoAnswerTimeoutRef.current);
      }
    };
  }, [messages, isLoading, isAutoAnswerMode, isGeneratingSuggestion, generateSuggestedAnswer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoAnswerTimeoutRef.current) {
        clearTimeout(autoAnswerTimeoutRef.current);
      }
    };
  }, []);

  // ============================================================================
  // Status Display
  // ============================================================================

  const toggleReasoningExpanded = useCallback((messageId: number) => {
    setExpandedReasoning((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(messageId)) {
        newSet.delete(messageId);
      } else {
        newSet.add(messageId);
      }
      return newSet;
    });
  }, []);

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
      <ConversationSidebar
        conversations={conversations}
        currentConversationId={currentConversationId}
        onLoadConversation={handleLoadConversation}
        onNewConversation={handleNewConversation}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <header className="bg-card flex shrink-0 items-center justify-between border-b px-4 py-5 shadow-sm">
          <h1 className="text-foreground text-xl font-bold">
            {messages.length > 0 && currentConversationTitle !== "New Chat"
              ? `${currentConversationTitle} - Super Chat`
              : "Super Chat"}
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
            {messages.length === 0 ? (
              /* Centered landing with greeting */
              <div className="flex flex-1 flex-col items-center justify-center p-6">
                <h2 className="text-foreground mb-8 text-3xl font-semibold md:text-4xl">
                  {greeting}
                </h2>
                <div className="w-full max-w-2xl">
                  <div className="flex items-end gap-2">
                    <ToolSelector
                      selectedTools={selectedTools}
                      onToolsChange={setSelectedTools}
                      disabled={!isConnected || isLoading || isAutoAnswerMode}
                    />
                    <Textarea
                      ref={textareaRef}
                      value={inputMessage}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message..."
                      disabled={!isConnected || isLoading || isAutoAnswerMode}
                      className="max-h-[120px] min-h-[40px] flex-1 resize-none"
                      rows={1}
                    />
                    {isLoading ? (
                      <Button
                        onClick={handleStopGeneration}
                        disabled={!isConnected}
                        variant="destructive"
                        className="h-10 w-10 rounded-full p-2"
                        aria-label="Stop"
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleSendMessage()}
                        disabled={!isConnected || !inputMessage.trim() || isAutoAnswerMode}
                        className="h-10 w-10 rounded-full p-2"
                        aria-label="Send"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              /* Chat messages view */
              <>
                <div className="custom-scrollbar flex-1 space-y-4 overflow-y-auto p-4">
                  {messages.map((message, index) => (
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
                          <>
                            {/* Reasoning section - collapsible */}
                            {message.reasoning && (
                              <div className="mb-3">
                                <button
                                  onClick={() => message.id && toggleReasoningExpanded(message.id)}
                                  className="text-muted-foreground hover:text-foreground mb-2 flex items-center gap-1 text-sm transition-colors"
                                >
                                  {message.id && expandedReasoning.has(message.id) ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                  <Brain className="h-4 w-4" />
                                  <span>
                                    Thinking
                                    {isLoading &&
                                      messages[messages.length - 1]?.id === message.id &&
                                      !message.text &&
                                      "..."}
                                  </span>
                                </button>
                                {message.id && expandedReasoning.has(message.id) && (
                                  <div className="border-muted-foreground/30 text-muted-foreground ml-5 border-l-2 pl-3 text-sm">
                                    <MarkdownRenderer content={message.reasoning} />
                                  </div>
                                )}
                              </div>
                            )}
                            {/* Main response */}
                            {message.text === "🤔 Thinking..." ? (
                              <div className="text-muted-foreground flex animate-pulse items-center gap-2">
                                <Brain className="h-4 w-4" />
                                <span className="text-sm font-medium">Thinking...</span>
                              </div>
                            ) : (
                              message.text && <MarkdownRenderer content={message.text} />
                            )}
                            {/* Show placeholder if no content yet */}
                            {!message.text && !message.reasoning && (
                              <div className="text-muted-foreground flex animate-pulse items-center gap-2">
                                <Brain className="h-4 w-4" />
                                <span className="text-sm font-medium">Thinking...</span>
                              </div>
                            )}
                          </>
                        ) : (
                          <>
                            <MarkdownRenderer content={message.text} />
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
                  ))}
                  {isLoading && (
                    <div className="flex justify-center py-2">
                      <div className="bg-muted/50 border-muted-foreground/10 flex items-center gap-2.5 rounded-full border px-4 py-1.5 shadow-sm backdrop-blur-sm">
                        {loadingPhase === "thinking" ? (
                          <Brain className="text-primary h-3.5 w-3.5 animate-pulse" />
                        ) : loadingPhase === "generating" ? (
                          <Sparkles className="text-primary h-3.5 w-3.5 animate-pulse" />
                        ) : loadingPhase === "stopping" ? (
                          <Square className="text-destructive h-3.5 w-3.5 animate-pulse" />
                        ) : (
                          <Loader2 className="text-primary h-3.5 w-3.5 animate-spin" />
                        )}
                        <span className="text-muted-foreground text-xs font-medium">
                          {loadingPhase === "thinking"
                            ? "Thinking..."
                            : loadingPhase === "generating"
                              ? "Generating..."
                              : loadingPhase === "stopping"
                                ? "Stopping..."
                                : loadingPhase === "tool_use"
                                  ? loadingMessage || "Using tools..."
                                  : "Processing..."}
                        </span>
                      </div>
                    </div>
                  )}
                  <div ref={messagesEndRef} />
                </div>

                <div className="bg-card border-t p-3">
                  {/* Auto-answer status banner */}
                  {isAutoAnswerMode && (
                    <div className="bg-muted mb-2 flex items-center justify-between rounded-md px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4" />
                        <span className="text-sm font-medium">
                          Auto-answer mode active
                          {isGeneratingSuggestion && " (generating response...)"}
                        </span>
                      </div>
                      <Button
                        onClick={stopAutoAnswerMode}
                        variant="destructive"
                        size="sm"
                        className="h-7 px-2 text-xs"
                      >
                        <Square className="mr-1 h-3 w-3" />
                        Stop
                      </Button>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    {/* Auto-answer toggle button */}
                    {!isAutoAnswerMode ? (
                      <Button
                        onClick={() => setIsInstructionsDialogOpen(true)}
                        disabled={!isConnected || isLoading || messages.length === 0}
                        variant="outline"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        title="Enable auto-answer mode"
                      >
                        <Zap className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={stopAutoAnswerMode}
                        disabled={!isConnected}
                        variant="destructive"
                        size="icon"
                        className="h-10 w-10 shrink-0"
                        title="Stop auto-answer mode"
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    )}

                    <ToolSelector
                      selectedTools={selectedTools}
                      onToolsChange={setSelectedTools}
                      disabled={!isConnected || isLoading || isAutoAnswerMode}
                    />
                    <Textarea
                      ref={textareaRef}
                      value={inputMessage}
                      onChange={handleInputChange}
                      onKeyDown={handleKeyDown}
                      placeholder="Type your message..."
                      disabled={!isConnected || isLoading || isAutoAnswerMode}
                      className="max-h-[120px] min-h-[40px] flex-1 resize-none"
                      rows={1}
                    />
                    {isLoading ? (
                      <Button
                        onClick={handleStopGeneration}
                        disabled={!isConnected || isAutoAnswerMode}
                        variant="destructive"
                        className="h-10 w-10 rounded-full p-2"
                        aria-label="Stop"
                      >
                        <Square className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleSendMessage()}
                        disabled={!isConnected || !inputMessage.trim() || isAutoAnswerMode}
                        className="h-10 w-10 rounded-full p-2"
                        aria-label="Send"
                      >
                        <ArrowUp className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ProjectsSidebar
        isConnected={isConnected}
        conversationId={currentConversationId}
        send={send}
      />

      <AgentQuestionDialog
        question={pendingQuestion}
        send={send}
        onAnswered={() => setPendingQuestion(undefined)}
      />

      {/* Auto-answer instructions dialog */}
      <Dialog open={isInstructionsDialogOpen} onOpenChange={setIsInstructionsDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Auto-Answer Mode</DialogTitle>
            <DialogDescription>
              Enter instructions for how the AI should respond on your behalf. The AI will
              automatically generate and send responses based on these instructions until you stop
              the mode.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              value={instructionsInput}
              onChange={(e) => setInstructionsInput(e.target.value)}
              placeholder="e.g., Respond as a curious interviewer who asks follow-up questions to learn more about the topic."
              className="min-h-[120px] resize-none"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsInstructionsDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (instructionsInput.trim()) {
                  startAutoAnswerMode(instructionsInput.trim());
                  setIsInstructionsDialogOpen(false);
                  setInstructionsInput("");
                }
              }}
              disabled={!instructionsInput.trim()}
            >
              Start Auto-Answer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
