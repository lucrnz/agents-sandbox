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
      // Use streaming for real-time feel
      let fullResponse = "";
      let isUsingAgenticFetch = false;
      let currentStatus = "";

      const responseStream = chatAgent.generateResponse(content);

      // Create initial message
      const aiMessage = await addMessage(
        conversation.id,
        "assistant",
        isUsingAgenticFetch ? "🔍 Searching the web..." : "...",
      );

      // Check if the message was created successfully
      if (!aiMessage || !aiMessage.id) {
        throw new Error("Failed to create assistant message");
      }

      // Stream response with status updates
      for await (const chunk of responseStream) {
        fullResponse += chunk;

        // Detect if this chunk contains tool-related content
        const chunkLower = chunk.toLowerCase();
        const wasUsingTool = isUsingAgenticFetch;
        isUsingAgenticFetch =
          chunkLower.includes("searching for") ||
          chunkLower.includes("fetched content from") ||
          (chunkLower.includes("found") && chunkLower.includes("search results"));

        // Update status if agentic fetch usage changes
        if (!wasUsingTool && isUsingAgenticFetch) {
          currentStatus = "🔍 Searching the web...";
          console.log("[COMMAND_HANDLER] Detected agentic fetch usage - updating status");
        } else if (wasUsingTool && !isUsingAgenticFetch) {
          currentStatus = "📄 Analyzing web content...";
          console.log("[COMMAND_HANDLER] Agentic fetch completed - updating status");
        } else if (currentStatus && !isUsingAgenticFetch && fullResponse.length > 50) {
          currentStatus = "";
          console.log("[COMMAND_HANDLER] Clearing status after sufficient content");
        }

        // Send real-time message updates
        if (aiMessage.id) {
          if (currentStatus) {
            await updateMessage(aiMessage.id, currentStatus + "\n\n" + fullResponse);
          } else {
            await updateMessage(aiMessage.id, fullResponse);
          }
        }
      }

      // Final cleanup - ensure we have proper status
      if (currentStatus && aiMessage.id) {
        await updateMessage(aiMessage.id, fullResponse);
      }

      // Emit AI response event
      const event = createEventMessage(AIResponseEvent.name, {
        messageId: aiMessage?.id,
        conversationId: conversation.id,
        content: fullResponse,
        timestamp: new Date().toISOString(),
      });
      ws.send(JSON.stringify(event));
    } catch (error) {
      console.error("AI generation failed:", error);
      // Could emit an error event here

      // Add error message to conversation
      const errorMessage = await addMessage(
        conversation.id,
        "assistant",
        "Sorry, I encountered an error while generating a response. Please try again.",
      );

      if (errorMessage && errorMessage.id) {
        const errorEvent = createEventMessage(AIResponseEvent.name, {
          messageId: errorMessage.id,
          conversationId: conversation.id,
          content: "Sorry, I encountered an error while generating a response. Please try again.",
          timestamp: new Date().toISOString(),
        });
        ws.send(JSON.stringify(errorEvent));
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
