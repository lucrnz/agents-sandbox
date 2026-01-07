import type { ServerWebSocket } from "bun";
import { createEventMessage } from "@/shared/command-system";
import {
  AIResponseEvent,
  AIResponseChunkEvent,
  ConversationUpdatedEvent,
  AgentStatusUpdateEvent,
  ChatAgentErrorEvent,
  type ToolName,
} from "@/shared/commands";
import {
  addMessage,
  updateMessage,
  updateConversation,
  getConversationWithMessages,
} from "@/backend/db";
import { ChatAgent } from "@/backend/agent/chat-agent";
import { generateStatusMessage } from "@/backend/agent/deep-research.js";
import { generateConversationTitle } from "@/backend/agent/title-generation.js";
import { DEFAULT_CONVERSATION_TITLE_PREFIX } from "@/backend/agent/config.js";
import { BackgroundTaskTracker } from "./background-task-tracker";

export type ChatOrchestratorContext = {
  ws: ServerWebSocket<{ conversationId?: string }>;
  conversationId: string;
  selectedTools?: ToolName[];
};

export class ChatOrchestrator {
  private ws: ServerWebSocket<{ conversationId?: string }>;
  private conversationId: string;
  private selectedTools?: ToolName[];
  private taskTracker: BackgroundTaskTracker;

  constructor(context: ChatOrchestratorContext) {
    this.ws = context.ws;
    this.conversationId = context.conversationId;
    this.selectedTools = context.selectedTools;
    this.taskTracker = new BackgroundTaskTracker();
  }

  /**
   * Orchestrates the entire user message processing flow
   */
  async processUserMessage(content: string) {
    // 1. Title generation (if applicable)
    // We track this background task for observability and error handling
    this.taskTracker.track(
      "title_generation",
      this.conversationId,
      this.generateTitleIfNeeded(content),
      this.ws,
    );

    // 2. AI Response generation
    // This is also tracked as a background task
    this.taskTracker.track(
      "ai_response",
      this.conversationId,
      this.streamAIResponse(content),
      this.ws,
    );
  }

  /**
   * Generates a conversation title if this is the first message
   */
  private async generateTitleIfNeeded(content: string) {
    const conversationWithMessages = await getConversationWithMessages(this.conversationId);
    if (!conversationWithMessages) return;

    const messageCount = conversationWithMessages.messages.length;
    // Check if it's a default title - this is more reliable than just message count
    const isDefaultTitle = conversationWithMessages.title.startsWith(
      DEFAULT_CONVERSATION_TITLE_PREFIX,
    );

    // If it's a default title and we have 1 or 2 messages (user + optional thinking message)
    if (isDefaultTitle && messageCount >= 1 && messageCount <= 2) {
      let title: string;
      try {
        title = await generateConversationTitle(content);
      } catch (error) {
        title = content.length > 50 ? content.substring(0, 47) + "..." : content;
      }

      await updateConversation(this.conversationId, { title });

      // Emit event
      const event = createEventMessage(ConversationUpdatedEvent.name, {
        conversationId: this.conversationId,
        title,
      });
      this.ws.send(JSON.stringify(event));
    }
  }

  /**
   * Handles the AI agent interaction and streaming response
   */
  private async streamAIResponse(content: string) {
    try {
      console.log("[CHAT_ORCHESTRATOR] Starting AI response flow");

      let fullResponse = "";

      // Create initial message with thinking status
      const aiMessage = await addMessage(this.conversationId, "assistant", "🤔 Thinking...");

      if (!aiMessage || !aiMessage.id) {
        throw new Error("Failed to create assistant message");
      }

      // Create a new ChatAgent instance with callbacks for tool events
      const agent = new ChatAgent({
        enabledTools: this.selectedTools,
        onToolCall: (toolName, args) => {
          let statusMessage = "";

          // Generate friendly status messages for known tools
          if (toolName === "deep_research") {
            statusMessage = generateStatusMessage(args || null);
          } else if (toolName === "web_search") {
            statusMessage = args?.query ? `Searching for: "${args.query}"` : "Searching web...";
          } else if (toolName === "web_fetch") {
            statusMessage = args?.url ? `Fetching: ${args.url}` : "Fetching url...";
          } else if (toolName === "view") {
            statusMessage = args?.path ? `Reading file: ${args.path}` : "Reading file...";
          } else if (toolName === "grep") {
            statusMessage = args?.pattern
              ? `Searching for "${args.pattern}" in file...`
              : "Searching in file...";
          }

          this.emitEvent(AgentStatusUpdateEvent.name, {
            conversationId: this.conversationId,
            status: statusMessage,
            timestamp: new Date().toISOString(),
          });
        },
        onToolResult: (toolName, result, error) => {
          // We don't report tool results to the user as per requirements
        },
        onCriticalError: (error, originalError) => {
          const errorId = crypto.randomUUID();
          console.error(
            `[CHAT_ORCHESTRATOR] Critical Agent Error (ID: ${errorId}):`,
            originalError || error,
          );

          this.emitEvent(ChatAgentErrorEvent.name, {
            conversationId: this.conversationId,
            error: "The AI agent encountered a critical error.",
            originalError: `Error ID: ${errorId}`,
            canRetry: true,
            timestamp: new Date().toISOString(),
          });
        },
      });

      // Stream response from the agent
      const stream = agent.generateResponse(content);

      let updateCount = 0;
      for await (const chunk of stream) {
        fullResponse += chunk;
        updateCount++;

        // Emit chunk to client for real-time streaming
        this.emitEvent(AIResponseChunkEvent.name, {
          messageId: aiMessage.id,
          conversationId: this.conversationId,
          delta: chunk,
          timestamp: new Date().toISOString(),
        });

        // Update message periodically (every 10 chunks or first chunk)
        if (updateCount % 10 === 0 || updateCount === 1) {
          await updateMessage(aiMessage.id, fullResponse).catch((err) =>
            console.error("[CHAT_ORCHESTRATOR] Error updating message:", err),
          );
        }
      }

      // Final cleanup - update message with complete response
      await updateMessage(aiMessage.id, fullResponse);

      // Emit AI response event
      this.emitEvent(AIResponseEvent.name, {
        messageId: aiMessage.id,
        conversationId: this.conversationId,
        content: fullResponse,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error("[CHAT_ORCHESTRATOR] AI Generation Error:", error);
      await this.handleError(error);
    }
  }

  /**
   * Helper to emit WebSocket events
   */
  private emitEvent(eventName: string, payload: any) {
    const event = createEventMessage(eventName, payload);
    this.ws.send(JSON.stringify(event));
  }

  /**
   * Handles errors by adding an error message and notifying the client
   */
  private async handleError(error: any) {
    try {
      const errorMessage =
        "❌ Sorry, I encountered an error while processing your request. Please try again.";
      const dbMessage = await addMessage(this.conversationId, "assistant", errorMessage);

      if (dbMessage && dbMessage.id) {
        this.emitEvent(AIResponseEvent.name, {
          messageId: dbMessage.id,
          conversationId: this.conversationId,
          content: errorMessage,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (dbError) {
      console.error("[CHAT_ORCHESTRATOR] Database error during error handling:", dbError);
    }
  }
}
