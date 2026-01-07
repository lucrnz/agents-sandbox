import type { ServerWebSocket } from "bun";
import { registry, type CommandDef } from "@/shared/command-system";
import { SendMessage, LoadConversation, GetConversations, SuggestAnswer } from "@/shared/commands";
import {
  getOrCreateConversation,
  getConversationWithMessages,
  getConversationsWithMessages,
  addMessage,
  getMessages,
} from "@/backend/db";
import { ChatOrchestrator } from "@/backend/services/chat-orchestrator";
import { bigModel } from "@/backend/agent/model-config";
import { streamText } from "ai";
import { createEventMessage } from "@/shared/command-system";
import { SuggestAnswerChunkEvent } from "@/shared/commands";

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
    return result;
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
  const { content, conversationId: reqConvId, selectedTools } = payload;
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

  // Use orchestrator for the rest of the flow
  const orchestrator = new ChatOrchestrator({
    ws,
    conversationId: conversation.id,
    selectedTools,
  });

  // Start processing in background (orchestrator handles its own fire-and-forget)
  orchestrator.processUserMessage(content);

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

commandHandlers.register(SuggestAnswer, async (payload, context) => {
  const { conversationId, instructions } = payload;
  const { ws } = context;

  // Fetch conversation history
  const messages = await getMessages(conversationId);

  if (messages.length === 0) {
    throw new Error("Cannot suggest answer for empty conversation");
  }

  // Format messages for the AI
  const formattedHistory = messages.map((msg) => ({
    role: msg.role as "user" | "assistant",
    content: msg.content,
  }));

  // Construct the meta-prompt
  const systemPrompt = `You are to suggest a response for the user to send.
The user has provided these instructions for how you should respond: ${instructions}

Based on the conversation history and the last message from the assistant,
suggest a response that the user could send. The response should follow the user's instructions.

IMPORTANT: Only provide the suggested response text, nothing else.
Do not include any explanations, meta-commentary, or additional text.
Just the suggested message itself.`;

  const aiMessages = [{ role: "system" as const, content: systemPrompt }, ...formattedHistory];

  let fullResponse = "";

  try {
    // Stream the response
    const result = streamText({
      model: bigModel,
      messages: aiMessages,
      temperature: 0.7,
    });

    // Consume the stream and send chunks
    for await (const chunk of result.textStream) {
      fullResponse += chunk;

      // Emit chunk to client
      const event = createEventMessage(SuggestAnswerChunkEvent.name, {
        conversationId,
        delta: chunk,
        timestamp: new Date().toISOString(),
      });
      ws.send(JSON.stringify(event));
    }

    return {
      suggestedAnswer: fullResponse,
    };
  } catch (error) {
    console.error("[SUGGEST_ANSWER] Error generating suggestion:", error);
    throw new Error("Failed to generate suggested answer");
  }
});
