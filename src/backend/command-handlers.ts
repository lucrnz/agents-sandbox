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
  updateConversation,
} from "./db";

// ============================================================================
// Command Handler Type
// ============================================================================

type CommandContext = {
  ws: ServerWebSocket<{ conversationId?: string }>;
  conversationId?: string;
};

type CommandHandler<TReq, TRes> = (
  payload: TReq,
  context: CommandContext
) => Promise<TRes>;

// ============================================================================
// Command Handler Registry
// ============================================================================

class CommandHandlerRegistry {
  private handlers = new Map<string, CommandHandler<any, any>>();

  register<TReq, TRes>(
    command: CommandDef<TReq, TRes>,
    handler: CommandHandler<TReq, TRes>
  ): void {
    this.handlers.set(command.name, handler);
  }

  async execute(
    commandName: string,
    payload: unknown,
    context: CommandContext
  ): Promise<unknown> {
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
  const conversationWithMessages = await getConversationWithMessages(
    conversation.id
  );
  if (
    conversationWithMessages &&
    conversationWithMessages.messages.length === 1
  ) {
    try {
      const { createOpenRouter } = await import("@openrouter/ai-sdk-provider");
      const { generateText } = await import("ai");

      const openrouter = createOpenRouter({
        apiKey: process.env.OPENROUTER_API_KEY,
      });

      const titleResult = await generateText({
        model: openrouter("google/gemma-2-9b-it"),
        prompt: `Generate a very short title (max 3 words) for: "${content}". Respond with ONLY the title, nothing else.`,
      });

      const title = titleResult.text.trim().replace(/^["']|["']$/g, "");
      await updateConversation(conversation.id, { title });

      // Emit event
      const event = createEventMessage(ConversationUpdatedEvent.name, {
        conversationId: conversation.id,
        title,
      });
      ws.send(JSON.stringify(event));
    } catch (error) {
      const title =
        content.length > 50 ? content.substring(0, 47) + "..." : content;
      await updateConversation(conversation.id, { title });

      const event = createEventMessage(ConversationUpdatedEvent.name, {
        conversationId: conversation.id,
        title,
      });
      ws.send(JSON.stringify(event));
    }
  }

  // Generate AI response in background
  (async () => {
    try {
      const { xai } = await import("@ai-sdk/xai");
      const { generateText } = await import("ai");

      const result = await generateText({
        model: xai("grok-4-1-fast-reasoning"),
        prompt: content,
      });

      const aiMessage = await addMessage(
        conversation.id,
        "assistant",
        result.text
      );

      // Emit AI response event
      const event = createEventMessage(AIResponseEvent.name, {
        messageId: aiMessage?.id,
        conversationId: conversation.id,
        content: result.text,
        timestamp: new Date().toISOString(),
      });
      ws.send(JSON.stringify(event));
    } catch (error) {
      console.error("AI generation failed:", error);
      // Could emit an error event here
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
