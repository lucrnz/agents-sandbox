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
} from "./db";
import { ChatOrchestrator } from "./services/chat-orchestrator";

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

  // Use orchestrator for the rest of the flow
  const orchestrator = new ChatOrchestrator({
    ws,
    conversationId: conversation.id,
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
