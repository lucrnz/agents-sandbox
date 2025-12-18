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
  AgentToolStartEvent,
  AgentToolCompleteEvent,
  AgentToolErrorEvent,
  ChatAgentErrorEvent,
} from "../shared/commands";
import {
  getOrCreateConversation,
  getConversationWithMessages,
  getConversationsWithMessages,
  addMessage,
  updateMessage,
  updateConversation,
} from "./db";
import { ChatAgent, generateConversationTitle } from "./agent/chat-agent";
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

      // Create initial message with thinking status
      const aiMessage = await addMessage(conversation.id, "assistant", "🤔 Thinking...");

      console.log("[COMMAND_HANDLER] Created initial message:", aiMessage?.id);

      // Check if the message was created successfully
      if (!aiMessage || !aiMessage.id) {
        throw new Error("Failed to create assistant message");
      }

      // Create a new ChatAgent instance with callbacks for tool events
      const agent = new ChatAgent({
        onToolCall: (toolName, args) => {
          console.log(`[COMMAND_HANDLER] Tool call detected: ${toolName}`, args);

          if (toolName === "agentic_fetch") {
            const statusMessage = generateStatusMessage(args || null);

            // Emit tool start event
            const startEvent = createEventMessage(AgentToolStartEvent.name, {
              conversationId: conversation.id,
              toolName,
              description: statusMessage,
              timestamp: new Date().toISOString(),
            });

            ws.send(JSON.stringify(startEvent));
            console.log(`[COMMAND_HANDLER] Emitted agent_tool_start event for ${toolName}`);
          }
        },
        onToolResult: (toolName, result, error) => {
          console.log(
            `[COMMAND_HANDLER] Tool result for ${toolName}:`,
            error ? "ERROR" : "SUCCESS",
          );

          if (error) {
            // Emit tool error event
            const errorEvent = createEventMessage(AgentToolErrorEvent.name, {
              conversationId: conversation.id,
              toolName,
              error: error.message,
              timestamp: new Date().toISOString(),
            });

            ws.send(JSON.stringify(errorEvent));
            console.log(`[COMMAND_HANDLER] Emitted agent_tool_error event for ${toolName}`);
          } else {
            // Emit tool complete event
            const completeEvent = createEventMessage(AgentToolCompleteEvent.name, {
              conversationId: conversation.id,
              toolName,
              result,
              timestamp: new Date().toISOString(),
            });

            ws.send(JSON.stringify(completeEvent));
            console.log(`[COMMAND_HANDLER] Emitted agent_tool_complete event for ${toolName}`);
          }
        },
        onCriticalError: (error, originalError) => {
          console.log(`[COMMAND_HANDLER] Critical ChatAgent error detected:`, error.message);

          // Emit ChatAgentError event
          const criticalErrorEvent = createEventMessage(ChatAgentErrorEvent.name, {
            conversationId: conversation.id,
            error: error.message,
            originalError,
            canRetry: true,
            timestamp: new Date().toISOString(),
          });

          ws.send(JSON.stringify(criticalErrorEvent));
          console.log(`[COMMAND_HANDLER] Emitted chat_agent_error event`);
        },
      });

      console.log("[COMMAND_HANDLER] Created ChatAgent with callbacks");

      // Stream response from the agent
      const stream = agent.generateResponse(content);
      console.log("[COMMAND_HANDLER] Starting AI response stream...");

      let updateCount = 0;
      for await (const chunk of stream) {
        fullResponse += chunk;

        // Update message periodically
        updateCount++;
        const shouldUpdate = aiMessage.id && (updateCount % 10 === 0 || updateCount === 1);

        if (shouldUpdate) {
          try {
            await updateMessage(aiMessage.id, fullResponse);
          } catch (error) {
            console.error("[COMMAND_HANDLER] Error updating message:", error);
          }
        }
      }

      console.log("[COMMAND_HANDLER] *** RESPONSE STREAM COMPLETE ***");
      console.log("[COMMAND_HANDLER] Final response length:", fullResponse.length);

      // Final cleanup - update message with complete response
      if (aiMessage.id) {
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
