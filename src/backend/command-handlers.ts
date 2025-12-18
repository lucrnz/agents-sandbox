import type { ServerWebSocket } from "bun";
import {
  registry,
  createCommandResult,
  createCommandError,
  createEventMessage,
  type CommandDef,
} from "../shared/command-system";
import {
  SendMessage,
  LoadConversation,
  GetConversations,
  AIResponseEvent,
  ConversationUpdatedEvent,
} from "../shared/commands";
import {
  getOrCreateConversation,
  getConversationWithMessages,
  getConversationsWithMessages,
  addMessage,
  updateMessage,
  updateConversation,
} from "./db";
import { chatAgent, generateConversationTitle } from "./agent/chat-agent";
import { generateStatusMessage } from "./agent/agentic-fetch.js";

// ============================================================================
// Command Handler Type
// ============================================================================

type CommandContext = {
  ws: ServerWebSocket<{ conversationId?: string }>;
  conversationId?: string;
};

type CommandHandler<TReq, TRes> = (payload: TReq, context: CommandContext) => Promise<TRes>;

// ============================================================================
// Command Handler Registry
// ============================================================================

class CommandHandlerRegistry {
  private handlers = new Map<string, CommandHandler<any, any>>();

  register<TReq, TRes>(command: CommandDef<TReq, TRes>, handler: CommandHandler<TReq, TRes>): void {
    this.handlers.set(command.name, handler);
  }

  async execute(commandName: string, payload: unknown, context: CommandContext): Promise<unknown> {
    const handler = this.handlers.get(commandName);
    if (!handler) {
      throw new Error(`No handler registered for command: ${commandName}`);
    }

    const validated = registry.validateCommandRequest(commandName, payload);
    const result = await handler(validated, context);
    return registry.validateCommandResponse(commandName, result);
  }

  has(commandName: string): boolean {
    return this.handlers.has(commandName);
  }
}

export const commandHandlers = new CommandHandlerRegistry();

// ============================================================================
// Register Handlers
// ============================================================================

commandHandlers.register(SendMessage, async (payload, context) => {
  const { content, conversationId: reqConvId } = payload;
  const { ws } = context;

  const targetConversationId = reqConvId || context.conversationId;
  const conversation = await getOrCreateConversation(targetConversationId);

  if (!conversation) {
    throw new Error("Failed to create conversation");
  }

  // Update WebSocket context
  if (!ws.data.conversationId) {
    ws.data.conversationId = conversation.id;
  }

  // Save user message
  const userMessage = await addMessage(conversation.id, "user", content);

  // Update title if first message
  const conversationWithMessages = await getConversationWithMessages(conversation.id);
  if (conversationWithMessages && conversationWithMessages.messages.length === 1) {
    try {
      const title = await generateConversationTitle(content);
      await updateConversation(conversation.id, { title });

      // Emit event
      const event = createEventMessage(ConversationUpdatedEvent.name, {
        conversationId: conversation.id,
        title,
      });
      ws.send(JSON.stringify(event));
    } catch (error) {
      const title = content.length > 50 ? content.substring(0, 47) + "..." : content;
      await updateConversation(conversation.id, { title });

      const event = createEventMessage(ConversationUpdatedEvent.name, {
        conversationId: conversation.id,
        title,
      });
      ws.send(JSON.stringify(event));
    }
  }

  // Generate AI response in background using ChatAgent
  (async () => {
    try {
      console.log("[COMMAND_HANDLER] *** SEND MESSAGE COMMAND START ***");
      console.log("[COMMAND_HANDLER] User content:", content.substring(0, 100) + "...");

      // Use streaming for real-time feel
      let fullResponse = "";
      let isUsingAgenticFetch = false;
      let currentStatus = "";
      let statusUpdateCount = 0;

      // Create initial message with thinking status
      const aiMessage = await addMessage(conversation.id, "assistant", "🤔 Thinking...");

      console.log("[COMMAND_HANDLER] Created initial message:", aiMessage?.id);

      // Check if the message was created successfully
      if (!aiMessage || !aiMessage.id) {
        throw new Error("Failed to create assistant message");
      }

      console.log("[COMMAND_HANDLER] Starting AI response stream...");

      // Create a separate stream for tool status updates
      const statusStream = chatAgent.generateResponse(content);

      // Stream response with status updates
      console.log("[COMMAND_HANDLER] Starting to process response stream...");
      for await (const chunk of statusStream) {
        fullResponse += chunk;

        console.log(
          `[COMMAND_HANDLER] Received chunk (length: ${chunk.length}):`,
          chunk.substring(0, 50) + "...",
        );

        // Detect if this chunk contains tool-related content
        const chunkLower = chunk.toLowerCase();
        const wasUsingTool = isUsingAgenticFetch;

        // Enhanced detection for any agentic fetch activity
        isUsingAgenticFetch =
          chunkLower.includes("successfully analyzed") ||
          (chunkLower.includes("found") && chunkLower.includes("search results")) ||
          chunkLower.includes("no results found") ||
          chunkLower.includes("search failed") ||
          chunkLower.includes("browsing") ||
          chunkLower.includes("📄") ||
          chunkLower.includes("🔍") ||
          chunkLower.includes("✅") ||
          chunkLower.includes("❌");

        // Update status based on tool usage
        if (!wasUsingTool && isUsingAgenticFetch) {
          // Extract tool input to generate specific status
          const toolInputMatch = chunk.match(/for "(.+)"\./);
          const urlMatch = chunk.match(/analyzed (.+) \(source:/i);

          if (urlMatch) {
            currentStatus = "Browsing webpage...";
            console.log("[COMMAND_HANDLER] *** DETECTED URL ANALYSIS - UPDATING STATUS ***");
          } else if (toolInputMatch) {
            currentStatus = `Searching for ${toolInputMatch[1]}`;
            console.log("[COMMAND_HANDLER] *** DETECTED WEB SEARCH - UPDATING STATUS ***");
          } else {
            currentStatus = "Searching for web...";
            console.log("[COMMAND_HANDLER] *** DETECTED SEARCH - UPDATING STATUS ***");
          }
        } else if (wasUsingTool && !isUsingAgenticFetch && fullResponse.length > 100) {
          currentStatus = "";
          console.log("[COMMAND_HANDLER] *** CLEARING STATUS AFTER TOOL COMPLETION ***");
        }

        // Update message more frequently during tool usage
        statusUpdateCount++;
        const shouldUpdate =
          aiMessage.id &&
          ((isUsingAgenticFetch && statusUpdateCount % 3 === 0) || // Every 3rd chunk during tool use
            (!isUsingAgenticFetch && statusUpdateCount % 20 === 0) || // Every 20th chunk normally
            statusUpdateCount === 1 || // Always first update
            currentStatus !== ""); // When we have status to clear

        if (shouldUpdate) {
          console.log(
            `[COMMAND_HANDLER] Updating message (update #${statusUpdateCount}):`,
            currentStatus || "Adding chunk",
          );

          try {
            if (aiMessage.id) {
              if (currentStatus) {
                await updateMessage(aiMessage.id, currentStatus + "\n\n" + fullResponse);
              } else {
                await updateMessage(aiMessage.id, fullResponse);
              }
            }
          } catch (error) {
            console.error("[COMMAND_HANDLER] Error updating message:", error);
          }
        }
      }

      console.log("[COMMAND_HANDLER] *** RESPONSE STREAM COMPLETE ***");
      console.log("[COMMAND_HANDLER] Final response length:", fullResponse.length);

      // Final cleanup - ensure we have proper final message
      if ((currentStatus || fullResponse.length > 0) && aiMessage.id) {
        console.log("[COMMAND_HANDLER] *** FINAL CLEANUP - UPDATING MESSAGE ***");
        try {
          await updateMessage(aiMessage.id, fullResponse);
        } catch (error) {
          console.error("[COMMAND_HANDLER] Error in final message update:", error);
        }
      }

      // Emit AI response event
      const event = createEventMessage(AIResponseEvent.name, {
        messageId: aiMessage?.id,
        conversationId: conversation.id,
        content: fullResponse,
        timestamp: new Date().toISOString(),
      });

      console.log("[COMMAND_HANDLER] *** SENDING AI RESPONSE EVENT ***");
      ws.send(JSON.stringify(event));
    } catch (error) {
      console.error("[COMMAND_HANDLER] *** AI GENERATION FAILED ***");
      console.error("[COMMAND_HANDLER] Error:", error);

      // Could emit an error event here
      try {
        const errorMessage = await addMessage(
          conversation.id,
          "assistant",
          "❌ Sorry, I encountered an error while processing your request. Please try again.",
        );

        if (errorMessage && errorMessage.id) {
          const errorEvent = createEventMessage(AIResponseEvent.name, {
            messageId: errorMessage.id,
            conversationId: conversation.id,
            content:
              "❌ Sorry, I encountered an error while processing your request. Please try again.",
            timestamp: new Date().toISOString(),
          });
          ws.send(JSON.stringify(errorEvent));
        }
      } catch (dbError) {
        console.error("[COMMAND_HANDLER] Database error during error handling:", dbError);
      }
    }
  })();

  return {
    messageId: userMessage?.id,
    conversationId: conversation.id,
    timestamp: new Date().toISOString(),
  };
});

commandHandlers.register(LoadConversation, async (payload) => {
  const { conversationId } = payload;

  if (conversationId) {
    const conv = await getConversationWithMessages(conversationId);
    if (!conv) throw new Error("Conversation not found");

    return {
      conversationId: conv.id,
      title: conv.title,
      messages: conv.messages.map((m) => ({
        ...m,
        role: m.role as "user" | "assistant",
        createdAt: m?.createdAt?.toISOString() || new Date().toISOString(),
      })),
    };
  } else {
    const newConv = await getOrCreateConversation();
    if (!newConv) throw new Error("Failed to create conversation");

    return {
      conversationId: newConv.id,
      title: newConv.title,
      messages: [],
    };
  }
});

commandHandlers.register(GetConversations, async () => {
  const conversations = await getConversationsWithMessages();

  return {
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      updatedAt: c?.updatedAt?.toISOString(),
    })),
  };
});
