import type { ServerWebSocket } from "bun";
import { registry, type CommandDef } from "@/shared/command-system";
import {
  AnswerAgentQuestion,
  CreateProject,
  DeleteProject,
  DeleteProjectPath,
  ExportProject,
  GetConversations,
  GetProjectFiles,
  GetProjects,
  LoadConversation,
  ReadProjectFile,
  ReserveConversation,
  SelectProjectForConversation,
  SendMessage,
  SetPermissionMode,
  StopGeneration,
  SuggestAnswer,
} from "@/shared/commands";

import {
  getOrCreateConversation,
  getConversation,
  getConversationWithMessages,
  getConversationsWithMessages,
  addMessage,
  getMessages,
  ensureDefaultProject,
  getConversationProject,
  setConversationProject,
  setConversationPermissionMode,
} from "@/backend/db";
import { ChatOrchestrator } from "@/backend/services/chat-orchestrator";
import { bigModel } from "@/backend/agent/model-config";
import { streamText } from "ai";
import { createEventMessage } from "@/shared/command-system";
import { SuggestAnswerChunkEvent, AgentStatusUpdateEvent } from "@/shared/commands";
import { ActiveGenerationRegistry } from "@/backend/services/active-generation-registry";
import { projectService, questionRegistry } from "@/backend/services/coder-runtime";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:command-handlers");

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
  const { content, conversationId: reqConvId, selectedTools } = payload;
  const { ws } = context;

  let conversation = null;

  if (reqConvId) {
    conversation = await getConversation(reqConvId);
    if (!conversation) {
      throw new Error("Conversation not found");
    }
  } else {
    const targetConversationId = context.conversationId;
    conversation = await getOrCreateConversation(targetConversationId);
  }

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

commandHandlers.register(LoadConversation, async (payload, context) => {
  const { conversationId } = payload;
  const { ws } = context;

  if (conversationId) {
    const conv = await getConversationWithMessages(conversationId);
    if (!conv) throw new Error("Conversation not found");

    ws.data.conversationId = conv.id;

    return {
      conversationId: conv.id,
      title: conv.title,
      messages: conv.messages.map((m) => ({
        ...m,
        role: m.role as "user" | "assistant",
        createdAt: m?.createdAt?.toISOString() || new Date().toISOString(),
      })),
    };
  }

  const newConv = await getOrCreateConversation();
  if (!newConv) throw new Error("Failed to create conversation");

  ws.data.conversationId = newConv.id;

  return {
    conversationId: newConv.id,
    title: newConv.title,
    messages: [],
  };
});

commandHandlers.register(ReserveConversation, async (_payload, context) => {
  const { ws } = context;
  const newConv = await getOrCreateConversation();
  if (!newConv) throw new Error("Failed to reserve conversation");

  ws.data.conversationId = newConv.id;

  return {
    conversationId: newConv.id,
    title: newConv.title,
  };
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
    logger.error({ error }, "Suggest answer generation failed");
    throw new Error("Failed to generate suggested answer");
  }
});

commandHandlers.register(StopGeneration, async (payload, context) => {
  const { conversationId } = payload;
  const { ws } = context;

  logger.info({ conversationId }, "Stopping generation for conversation");

  // Emit stopping phase immediately
  const stoppingEvent = createEventMessage(AgentStatusUpdateEvent.name, {
    conversationId,
    phase: "stopping",
    timestamp: new Date().toISOString(),
  });
  ws.send(JSON.stringify(stoppingEvent));

  const result = ActiveGenerationRegistry.abort(conversationId);

  if (result.aborted) {
    logger.info({ conversationId }, "Successfully stopped generation");
    return {
      stopped: true,
      partialContent: result.partialContent,
    };
  }

  logger.info({ conversationId }, "No active generation found for conversation");
  return {
    stopped: false,
    partialContent: undefined,
  };
});

// ============================================================================
// Projects
// ============================================================================

commandHandlers.register(CreateProject, async (payload) => {
  const project = await projectService.createProject({
    name: payload.name,
    description: payload.description,
  });

  if (!project) {
    throw new Error("Failed to create project");
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      description: project.description ?? null,
      updatedAt: project.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    },
  };
});

commandHandlers.register(GetProjects, async () => {
  const projects = await projectService.listProjects();
  return {
    projects: projects.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description ?? null,
      updatedAt: p.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    })),
  };
});

commandHandlers.register(GetProjectFiles, async (payload) => {
  const files = await projectService.listFiles(payload.projectId);
  return {
    projectId: payload.projectId,
    files: files.map((f) => ({
      path: f.path,
      size: f.size,
      mimeType: f.mimeType ?? null,
      updatedAt: f.updatedAt?.toISOString?.() ?? new Date().toISOString(),
    })),
  };
});

commandHandlers.register(ReadProjectFile, async (payload) => {
  const file = await projectService.readFileAsText(payload.projectId, payload.path);
  return {
    projectId: payload.projectId,
    path: file.path,
    content: file.content,
    mimeType: file.mimeType,
  };
});

commandHandlers.register(DeleteProject, async (payload) => {
  await projectService.deleteProject(payload.projectId);
  return { deleted: true };
});

commandHandlers.register(DeleteProjectPath, async (payload) => {
  const deletedCount = await projectService.deletePath(
    payload.projectId,
    payload.path,
    payload.kind,
  );
  return { deleted: true, deletedCount };
});

commandHandlers.register(ExportProject, async (payload) => {
  const exported = await projectService.exportProject(payload.projectId, payload.format);
  const base64 = Buffer.from(exported.bytes).toString("base64");
  return {
    filename: exported.filename,
    mimeType: exported.mimeType,
    base64,
  };
});

commandHandlers.register(SelectProjectForConversation, async (payload) => {
  const existing = await getConversationProject(payload.conversationId);
  const mode = (existing?.permissionMode as "ask" | "yolo") || "ask";

  const saved = await setConversationProject({
    conversationId: payload.conversationId,
    projectId: payload.projectId,
    permissionMode: mode,
  });

  if (!saved) {
    throw new Error("Failed to select project for conversation");
  }

  return {
    conversationId: saved.conversationId,
    projectId: saved.projectId,
    permissionMode: saved.permissionMode as "ask" | "yolo",
  };
});

commandHandlers.register(SetPermissionMode, async (payload) => {
  const existing = await getConversationProject(payload.conversationId);
  if (!existing) {
    const def = await ensureDefaultProject();
    if (!def) {
      throw new Error("Failed to ensure default project exists");
    }
    await setConversationProject({
      conversationId: payload.conversationId,
      projectId: def.id,
      permissionMode: payload.permissionMode,
    });
  }

  const updated = await setConversationPermissionMode({
    conversationId: payload.conversationId,
    permissionMode: payload.permissionMode,
  });

  if (!updated) {
    throw new Error("Failed to set permission mode");
  }

  return {
    conversationId: updated.conversationId,
    projectId: updated.projectId,
    permissionMode: updated.permissionMode as "ask" | "yolo",
  };
});

// ============================================================================
// Agent Questions (blocking)
// ============================================================================

commandHandlers.register(AnswerAgentQuestion, async (payload, context) => {
  const conversationId = context.conversationId;
  if (!conversationId) {
    throw new Error("Conversation ID is required to answer agent questions");
  }

  if (conversationId !== payload.conversationId) {
    throw new Error("Conversation mismatch for agent question response");
  }

  questionRegistry.answer({
    questionId: payload.questionId,
    selectedOptionId: payload.selectedOptionId,
    inputValue: payload.inputValue,
    conversationId: payload.conversationId,
  });
  return { acknowledged: true };
});
