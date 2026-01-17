import type { ServerWebSocket } from "bun";
import { createEventMessage } from "@/shared/command-system";
import {
  AIResponseEvent,
  AIResponseChunkEvent,
  AIReasoningChunkEvent,
  ConversationUpdatedEvent,
  AgentStatusUpdateEvent,
  ChatAgentErrorEvent,
  GenerationStoppedEvent,
  type ToolName,
} from "@/shared/commands";
import type { ToolCallCallback } from "@/shared/tool-types";
import {
  addMessage,
  updateMessage,
  updateConversation,
  getConversationWithMessages,
  ensureDefaultProject,
  getConversationProject,
  setConversationProject,
  listProjects,
  createProject,
} from "@/backend/db";
import { ChatAgent } from "@/backend/agent/chat-agent";
import { CoderAgent } from "@/backend/agent/coder-agent";
import { generateStatusMessage } from "@/backend/agent/deep-research.js";
import { generateConversationTitle } from "@/backend/agent/title-generation.js";
import { DEFAULT_CONVERSATION_TITLE_PREFIX } from "@/backend/agent/config.js";
import { BackgroundTaskTracker } from "./background-task-tracker";
import { ActiveGenerationRegistry } from "./active-generation-registry";
import { getDockerManager, questionRegistry } from "./coder-runtime";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:chat-orchestrator");

export type ChatOrchestratorContext = {
  ws: ServerWebSocket<{ conversationId?: string }>;
  conversationId: string;
  selectedTools?: ToolName[];
};

export class ChatOrchestrator {
  private readonly ws: ServerWebSocket<{ conversationId?: string }>;
  private readonly conversationId: string;
  private readonly selectedTools?: ToolName[];
  private readonly taskTracker: BackgroundTaskTracker;

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
    this.taskTracker
      .track("title_generation", this.conversationId, this.generateTitleIfNeeded(content), this.ws)
      .catch((error) => logger.error({ error }, "Title generation task failed"));

    // 2. AI Response generation
    // This is also tracked as a background task
    this.taskTracker
      .track("ai_response", this.conversationId, this.streamAIResponse(content), this.ws)
      .catch((error) => logger.error({ error }, "AI response task failed"));
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
    // Create AbortController for this generation
    const abortController = new AbortController();
    ActiveGenerationRegistry.register(this.conversationId, abortController);

    try {
      logger.info("Starting AI response flow");

      let fullResponse = "";

      // Create initial message with thinking status
      const aiMessage = await addMessage(this.conversationId, "assistant", "🤔 Thinking...");

      if (!aiMessage || !aiMessage.id) {
        throw new Error("Failed to create assistant message");
      }

      // Register the message ID with the generation registry
      ActiveGenerationRegistry.setMessageId(this.conversationId, aiMessage.id);

      // Emit initial thinking phase
      this.emitEvent(AgentStatusUpdateEvent.name, {
        conversationId: this.conversationId,
        phase: "thinking",
        timestamp: new Date().toISOString(),
      });

      // Create a new ChatAgent instance with callbacks for tool events
      const enabled = this.selectedTools ?? [];
      const isCoderAgent = enabled.includes("filesystem") || enabled.includes("container");

      const toolSummaries: string[] = [];

      const formatToolSummary = (toolName: string, args: unknown): string | null => {
        const safeArgs = args as Record<string, unknown> | null | undefined;

        if (toolName === "write_file" || toolName === "edit_file") {
          const path = typeof safeArgs?.path === "string" ? safeArgs.path : "unknown file";
          return `Updated ${path}`;
        }
        if (toolName === "read_file") {
          const path = typeof safeArgs?.path === "string" ? safeArgs.path : "project file";
          return `Read ${path}`;
        }
        if (toolName === "list_files") {
          return "Listed project files";
        }
        if (toolName === "grep") {
          const pattern = typeof safeArgs?.pattern === "string" ? safeArgs.pattern : "pattern";
          return `Searched for "${pattern}"`;
        }
        if (toolName === "bash") {
          const command = typeof safeArgs?.command === "string" ? safeArgs.command : "command";
          return `Ran command: ${command}`;
        }
        if (toolName === "deep_research") {
          const deepResearchArgs = safeArgs as { prompt?: string; url?: string } | null;
          const label = deepResearchArgs?.prompt || deepResearchArgs?.url;
          return label ? `Researched: ${label}` : "Ran deep research";
        }
        if (toolName === "ask_question") {
          return null;
        }

        return `Used tool: ${toolName}`;
      };

      const onToolCall: ToolCallCallback = (toolName, args) => {
        let statusMessage = "";

        if (toolName === "deep_research") {
          const deepResearchArgs = args as { prompt: string; url?: string } | null;
          statusMessage = generateStatusMessage(deepResearchArgs);
        } else if (toolName === "bash") {
          statusMessage = "Running a container command...";
        } else if (toolName === "write_file" || toolName === "edit_file") {
          statusMessage = "Editing project files...";
        } else if (toolName === "read_file" || toolName === "list_files" || toolName === "grep") {
          statusMessage = "Reading project files...";
        } else if (toolName === "ask_question") {
          statusMessage = "Waiting for your answer...";
        }

        const summary = formatToolSummary(toolName, args);
        if (summary && !toolSummaries.includes(summary)) {
          toolSummaries.push(summary);
        }

        this.emitEvent(AgentStatusUpdateEvent.name, {
          conversationId: this.conversationId,
          phase: "tool_use",
          message: statusMessage,
          timestamp: new Date().toISOString(),
        });
      };

      const onToolResult = () => {
        this.emitEvent(AgentStatusUpdateEvent.name, {
          conversationId: this.conversationId,
          phase: "thinking",
          timestamp: new Date().toISOString(),
        });
      };

      const onCriticalError = (error: Error, originalError?: string) => {
        const errorId = crypto.randomUUID();
        logger.error({ error, errorId, originalError }, "Critical agent error");

        this.emitEvent(ChatAgentErrorEvent.name, {
          conversationId: this.conversationId,
          error: "The AI agent encountered a critical error.",
          originalError: `Error ID: ${errorId}`,
          canRetry: true,
          timestamp: new Date().toISOString(),
        });
      };

      const agent: ChatAgent | CoderAgent = isCoderAgent
        ? await this.createCoderAgent({
            enabledTools: enabled,
            onToolCall,
            onToolResult,
            onCriticalError,
          })
        : new ChatAgent({
            enabledTools: enabled,
            onToolCall,
            onToolResult,
            onCriticalError,
          });

      // Stream response from the agent with abort signal
      const stream = agent.generateResponse(content, abortController.signal);

      let updateCount = 0;
      let fullReasoning = "";
      let hasStartedGenerating = false;
      for await (const chunk of stream) {
        // Check if aborted
        if (abortController.signal.aborted) {
          logger.info("Generation aborted, stopping stream");
          break;
        }

        if (chunk.type === "reasoning") {
          // Emit reasoning chunk to client for real-time display
          fullReasoning += chunk.content;
          this.emitEvent(AIReasoningChunkEvent.name, {
            messageId: aiMessage.id,
            conversationId: this.conversationId,
            delta: chunk.content,
            timestamp: new Date().toISOString(),
          });
        } else if (chunk.type === "text") {
          // Emit generating phase on first text chunk
          if (!hasStartedGenerating) {
            hasStartedGenerating = true;
            this.emitEvent(AgentStatusUpdateEvent.name, {
              conversationId: this.conversationId,
              phase: "generating",
              timestamp: new Date().toISOString(),
            });
          }

          fullResponse += chunk.content;
          updateCount++;

          // Update partial content in registry for stop functionality
          ActiveGenerationRegistry.updatePartialContent(this.conversationId, fullResponse);

          // Emit text chunk to client for real-time streaming
          this.emitEvent(AIResponseChunkEvent.name, {
            messageId: aiMessage.id,
            conversationId: this.conversationId,
            delta: chunk.content,
            timestamp: new Date().toISOString(),
          });

          // Update message periodically (every 10 chunks or first chunk)
          if (updateCount % 10 === 0 || updateCount === 1) {
            await updateMessage(aiMessage.id, fullResponse).catch((err) =>
              logger.error({ error: err }, "Error updating message"),
            );
          }
        }
      }

      // Check if aborted - handle differently
      if (abortController.signal.aborted) {
        logger.info("Finalizing aborted generation");
        // Update message with partial content + stopped indicator
        const stoppedContent = fullResponse + "\n\n*[Generation stopped by user]*";
        await updateMessage(aiMessage.id, stoppedContent);

        // Emit stopped event
        this.emitEvent(GenerationStoppedEvent.name, {
          conversationId: this.conversationId,
          messageId: aiMessage.id,
          partialContent: stoppedContent,
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Final cleanup - update message with complete response
      if (!fullResponse.trim() && toolSummaries.length > 0) {
        const summaryLines = toolSummaries.slice(0, 4).map((item) => `- ${item}`);
        fullResponse = summaryLines.join("\n");
      }

      await updateMessage(aiMessage.id, fullResponse);

      // Emit AI response event
      this.emitEvent(AIResponseEvent.name, {
        messageId: aiMessage.id,
        conversationId: this.conversationId,
        content: fullResponse,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      // Check if this was an abort - if so, exit gracefully
      if (
        abortController.signal.aborted ||
        (error instanceof Error && error.name === "AbortError")
      ) {
        logger.info("Generation aborted (caught in error handler)");
        return;
      }

      logger.error({ error }, "AI generation error");
      await this.handleError(error);
    } finally {
      // Mark generation as complete
      ActiveGenerationRegistry.complete(this.conversationId);
    }
  }

  private async createCoderAgent(input: {
    enabledTools: ToolName[];
    onToolCall: ToolCallCallback;
    onToolResult: () => void;
    onCriticalError: (error: Error, originalError?: string) => void;
  }) {
    const existing = await getConversationProject(this.conversationId);
    let projectId = existing?.projectId;
    let permissionMode = (existing?.permissionMode as "ask" | "yolo") || "ask";

    if (!projectId) {
      // Fetch existing projects to let user choose
      const projects = await listProjects();

      const options: Array<{
        id: string;
        label: string;
        inputField?: { placeholder: string };
      }> = projects.map((p) => ({
        id: p.id,
        label: p.name,
      }));

      options.push({
        id: "create_new",
        label: "Create new project",
        inputField: { placeholder: "Project name (optional)" },
      });

      // Emit status update so user knows we are waiting
      this.emitEvent(AgentStatusUpdateEvent.name, {
        conversationId: this.conversationId,
        phase: "tool_use",
        message: "Waiting for project selection...",
        timestamp: new Date().toISOString(),
      });

      const { answer } = await questionRegistry.ask({
        conversationId: this.conversationId,
        question: {
          type: "choice",
          title: "Select Project",
          message:
            "No project is linked to this conversation. Which project would you like to use for files and container operations?",
          options,
        },
        emit: (eventName: string, payload: unknown) => this.emitEvent(eventName, payload),
      });

      if (answer.selectedOptionId === "create_new") {
        const name = answer.inputValue?.trim() || `Project ${new Date().toLocaleDateString()}`;
        const newProj = await createProject({ name });
        projectId = newProj.id;
      } else {
        projectId = answer.selectedOptionId;
      }

      const saved = await setConversationProject({
        conversationId: this.conversationId,
        projectId,
        permissionMode,
      });

      if (!saved) {
        throw new Error("Failed to set conversation project");
      }

      projectId = saved.projectId;
      permissionMode = saved.permissionMode as "ask" | "yolo";
    }

    const dockerManager = input.enabledTools.includes("container") ? getDockerManager() : undefined;

    return new CoderAgent({
      enabledTools: input.enabledTools,
      context: {
        conversationId: this.conversationId,
        projectId,
        permissionMode,
      },
      dockerManager,
      askUser: async (question) => {
        const { answer } = await questionRegistry.ask({
          conversationId: this.conversationId,
          question,
          emit: (eventName: string, payload: unknown) => this.emitEvent(eventName, payload),
        });
        return answer;
      },
      onToolCall: input.onToolCall,
      onToolResult: input.onToolResult,
      onCriticalError: input.onCriticalError,
    });
  }

  /**
   * Helper to emit WebSocket events
   */
  private emitEvent(eventName: string, payload: unknown) {
    const event = createEventMessage(eventName, payload);
    this.ws.send(JSON.stringify(event));
  }

  /**
   * Handles errors by adding an error message and notifying the client
   */
  private async handleError(error: unknown) {
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
      logger.error({ error: dbError }, "Database error during error handling");
    }
  }
}
