import type { ServerWebSocket } from "bun";
import { createEventMessage } from "../../shared/command-system";
import {
  AIResponseEvent,
  AIResponseChunkEvent,
  ConversationUpdatedEvent,
  AgentToolStartEvent,
  AgentToolCompleteEvent,
  AgentToolErrorEvent,
  ChatAgentErrorEvent,
} from "../../shared/commands";
import { addMessage, updateMessage, updateConversation, getConversationWithMessages } from "../db";
import { ChatAgent } from "../agent/chat-agent";
import { generateStatusMessage } from "../agent/agentic-fetch.js";
import { generateConversationTitle } from "../agent/title-generation.js";

export type ChatOrchestratorContext = {
  ws: ServerWebSocket<{ conversationId?: string }>;
  conversationId: string;
};

export class ChatOrchestrator {
  private ws: ServerWebSocket<{ conversationId?: string }>;
  private conversationId: string;

  constructor(context: ChatOrchestratorContext) {
    this.ws = context.ws;
    this.conversationId = context.conversationId;
  }

  /**
   * Orchestrates the entire user message processing flow
   */
  async processUserMessage(content: string) {
    // 1. Title generation (if applicable)
    // We don't await this to keep the response fast, but it runs in background
    this.generateTitleIfNeeded(content).catch((err) => {
      console.error("[CHAT_ORCHESTRATOR] Title generation failed:", err);
    });

    // 2. AI Response generation
    // This is also fire-and-forget from the perspective of the initial command response
    this.streamAIResponse(content).catch((err) => {
      console.error("[CHAT_ORCHESTRATOR] AI Response streaming failed:", err);
    });
  }

  /**
   * Generates a conversation title if this is the first message
   */
  private async generateTitleIfNeeded(content: string) {
    const conversationWithMessages = await getConversationWithMessages(this.conversationId);

    // If it's the first message (the user message we just added)
    if (conversationWithMessages && conversationWithMessages.messages.length === 1) {
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
        onToolCall: (toolName, args) => {
          if (toolName === "agentic_fetch") {
            const statusMessage = generateStatusMessage(args || null);
            this.emitEvent(AgentToolStartEvent.name, {
              conversationId: this.conversationId,
              toolName,
              description: statusMessage,
              timestamp: new Date().toISOString(),
            });
          }
        },
        onToolResult: (toolName, result, error) => {
          if (error) {
            this.emitEvent(AgentToolErrorEvent.name, {
              conversationId: this.conversationId,
              toolName,
              error: error.message,
              timestamp: new Date().toISOString(),
            });
          } else {
            this.emitEvent(AgentToolCompleteEvent.name, {
              conversationId: this.conversationId,
              toolName,
              result,
              timestamp: new Date().toISOString(),
            });
          }
        },
        onCriticalError: (error, originalError) => {
          this.emitEvent(ChatAgentErrorEvent.name, {
            conversationId: this.conversationId,
            error: error.message,
            originalError,
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
