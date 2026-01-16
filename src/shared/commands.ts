import { z } from "zod";
import { registry } from "./command-system";

// ============================================================================
// Shared Schemas
// ============================================================================

export const ToolNameSchema = z.enum(["deep_research", "filesystem", "container"]);
export type ToolName = z.infer<typeof ToolNameSchema>;

const MessageSchema = z.object({
  id: z.number(),
  role: z.enum(["user", "assistant"]),
  content: z.string(),
  createdAt: z.string().datetime(),
});

const ConversationSchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.string().datetime(),
});

export const ProjectPermissionModeSchema = z.enum(["ask", "yolo"]);
export type ProjectPermissionMode = z.infer<typeof ProjectPermissionModeSchema>;

const ProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  updatedAt: z.string().datetime(),
});

const ProjectFileSchema = z.object({
  path: z.string(),
  size: z.number().int().nonnegative(),
  mimeType: z.string().nullable().optional(),
  updatedAt: z.string().datetime(),
});

// ============================================================================
// Commands (Request/Response)
// ============================================================================

export const SendMessage = registry.command(
  "send_message",
  z.object({
    content: z.string().min(1, "Message cannot be empty"),
    conversationId: z.string().optional(),
    selectedTools: z.array(ToolNameSchema).optional(),
  }),
  z.object({
    messageId: z.number(),
    conversationId: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const LoadConversation = registry.command(
  "load_conversation",
  z.object({
    conversationId: z.string().optional(),
  }),
  z.object({
    conversationId: z.string(),
    title: z.string(),
    messages: z.array(MessageSchema),
  }),
);

export const ReserveConversation = registry.command(
  "reserve_conversation",
  z.object({}),
  z.object({
    conversationId: z.string(),
    title: z.string(),
  }),
);

export const GetConversations = registry.command(
  "get_conversations",
  z.object({}),
  z.object({
    conversations: z.array(ConversationSchema),
  }),
);

export const SuggestAnswer = registry.command(
  "suggest_answer",
  z.object({
    conversationId: z.string().min(1, "Conversation ID is required"),
    instructions: z.string().min(1, "Instructions cannot be empty"),
  }),
  z.object({
    suggestedAnswer: z.string(),
  }),
);

export const StopGeneration = registry.command(
  "stop_generation",
  z.object({
    conversationId: z.string().min(1, "Conversation ID is required"),
  }),
  z.object({
    stopped: z.boolean(),
    partialContent: z.string().optional(),
  }),
);

// ============================================================================
// Projects (CRUD + binding to conversations)
// ============================================================================

export const CreateProject = registry.command(
  "create_project",
  z.object({
    name: z.string().min(1, "Project name is required"),
    description: z.string().optional(),
  }),
  z.object({
    project: ProjectSchema,
  }),
);

export const GetProjects = registry.command(
  "get_projects",
  z.object({}),
  z.object({
    projects: z.array(ProjectSchema),
  }),
);

export const GetProjectFiles = registry.command(
  "get_project_files",
  z.object({
    projectId: z.string().min(1, "Project ID is required"),
  }),
  z.object({
    projectId: z.string(),
    files: z.array(ProjectFileSchema),
  }),
);

export const ReadProjectFile = registry.command(
  "read_project_file",
  z.object({
    projectId: z.string().min(1, "Project ID is required"),
    path: z.string().min(1, "File path is required"),
  }),
  z.object({
    projectId: z.string(),
    path: z.string(),
    content: z.string(),
    mimeType: z.string().optional(),
  }),
);

export const DeleteProject = registry.command(
  "delete_project",
  z.object({
    projectId: z.string().min(1, "Project ID is required"),
  }),
  z.object({
    deleted: z.boolean(),
  }),
);

export const ExportProject = registry.command(
  "export_project",
  z.object({
    projectId: z.string().min(1, "Project ID is required"),
    format: z.enum(["zip", "tar.gz"]),
  }),
  z.object({
    filename: z.string(),
    mimeType: z.string(),
    base64: z.string(),
  }),
);

export const SelectProjectForConversation = registry.command(
  "select_project",
  z.object({
    conversationId: z.string().min(1, "Conversation ID is required"),
    projectId: z.string().min(1, "Project ID is required"),
  }),
  z.object({
    conversationId: z.string(),
    projectId: z.string(),
    permissionMode: ProjectPermissionModeSchema,
  }),
);

export const SetPermissionMode = registry.command(
  "set_permission_mode",
  z.object({
    conversationId: z.string().min(1, "Conversation ID is required"),
    permissionMode: ProjectPermissionModeSchema,
  }),
  z.object({
    conversationId: z.string(),
    projectId: z.string(),
    permissionMode: ProjectPermissionModeSchema,
  }),
);

// ============================================================================
// Events (Server → Client notifications)
// ============================================================================

export const AIResponseEvent = registry.event(
  "ai_response",
  z.object({
    messageId: z.number(),
    conversationId: z.string(),
    content: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const AIResponseChunkEvent = registry.event(
  "ai_response_chunk",
  z.object({
    messageId: z.number(),
    conversationId: z.string(),
    delta: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const AIReasoningChunkEvent = registry.event(
  "ai_reasoning_chunk",
  z.object({
    messageId: z.number(),
    conversationId: z.string(),
    delta: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const ConversationUpdatedEvent = registry.event(
  "conversation_updated",
  z.object({
    conversationId: z.string(),
    title: z.string(),
  }),
);

export const SystemNotificationEvent = registry.event(
  "system_notification",
  z.object({
    level: z.enum(["info", "warning", "error"]),
    message: z.string(),
  }),
);

// ============================================================================
// Agent Status Events
// ============================================================================

/**
 * Agent processing phases for proper UI state management
 */
export const AgentPhaseSchema = z.enum([
  "thinking", // AI is reasoning/thinking (may or may not have visible content)
  "generating", // AI is generating the response text
  "tool_use", // AI is using a tool (deep_research, etc.)
  "stopping", // Generation is being stopped
]);
export type AgentPhase = z.infer<typeof AgentPhaseSchema>;

export const AgentStatusUpdateEvent = registry.event(
  "agent_status_update",
  z.object({
    conversationId: z.string(),
    phase: AgentPhaseSchema,
    /** Human-readable status message (e.g., tool name, search query) */
    message: z.string().optional(),
    timestamp: z.string().datetime(),
  }),
);

export const ChatAgentErrorEvent = registry.event(
  "chat_agent_error",
  z.object({
    conversationId: z.string(),
    error: z.string(),
    originalError: z.string().optional(),
    canRetry: z.boolean().default(true),
    timestamp: z.string().datetime(),
  }),
);

export const BackgroundTaskErrorEvent = registry.event(
  "background_task_error",
  z.object({
    conversationId: z.string(),
    taskType: z.enum(["title_generation", "ai_response"]),
    message: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const SuggestAnswerChunkEvent = registry.event(
  "suggest_answer_chunk",
  z.object({
    conversationId: z.string(),
    delta: z.string(),
    timestamp: z.string().datetime(),
  }),
);

export const GenerationStoppedEvent = registry.event(
  "generation_stopped",
  z.object({
    conversationId: z.string(),
    messageId: z.number().optional(),
    partialContent: z.string(),
    timestamp: z.string().datetime(),
  }),
);

// ============================================================================
// Agent Questions (blocking)
// ============================================================================

export const AgentQuestionEvent = registry.event(
  "agent_question",
  z.object({
    questionId: z.string(),
    conversationId: z.string(),
    type: z.enum(["permission", "choice", "input"]),
    title: z.string(),
    message: z.string(),
    options: z
      .array(
        z.object({
          id: z.string(),
          label: z.string(),
          inputField: z.object({ placeholder: z.string() }).optional(),
        }),
      )
      .optional(),
    timestamp: z.string().datetime(),
  }),
);

export const AnswerAgentQuestion = registry.command(
  "answer_agent_question",
  z.object({
    questionId: z.string(),
    conversationId: z.string(),
    selectedOptionId: z.string(),
    inputValue: z.string().optional(),
  }),
  z.object({
    acknowledged: z.boolean(),
  }),
);

// ============================================================================
// Type Exports
// ============================================================================

export type Message = z.infer<typeof MessageSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;

export type SendMessageRequest = z.infer<typeof SendMessage.requestSchema>;
export type SendMessageResponse = z.infer<typeof SendMessage.responseSchema>;

export type LoadConversationRequest = z.infer<typeof LoadConversation.requestSchema>;
export type LoadConversationResponse = z.infer<typeof LoadConversation.responseSchema>;

export type GetConversationsRequest = z.infer<typeof GetConversations.requestSchema>;
export type GetConversationsResponse = z.infer<typeof GetConversations.responseSchema>;

export type AIResponsePayload = z.infer<typeof AIResponseEvent.payloadSchema>;
export type AIResponseChunkPayload = z.infer<typeof AIResponseChunkEvent.payloadSchema>;
export type AIReasoningChunkPayload = z.infer<typeof AIReasoningChunkEvent.payloadSchema>;
export type ConversationUpdatedPayload = z.infer<typeof ConversationUpdatedEvent.payloadSchema>;
export type SystemNotificationPayload = z.infer<typeof SystemNotificationEvent.payloadSchema>;

export type AgentStatusUpdatePayload = z.infer<typeof AgentStatusUpdateEvent.payloadSchema>;
export type ChatAgentErrorPayload = z.infer<typeof ChatAgentErrorEvent.payloadSchema>;
export type BackgroundTaskErrorPayload = z.infer<typeof BackgroundTaskErrorEvent.payloadSchema>;
export type SuggestAnswerChunkPayload = z.infer<typeof SuggestAnswerChunkEvent.payloadSchema>;

export type StopGenerationRequest = z.infer<typeof StopGeneration.requestSchema>;
export type StopGenerationResponse = z.infer<typeof StopGeneration.responseSchema>;
export type GenerationStoppedPayload = z.infer<typeof GenerationStoppedEvent.payloadSchema>;

export type Project = z.infer<typeof ProjectSchema>;
export type ProjectFile = z.infer<typeof ProjectFileSchema>;
export type CreateProjectRequest = z.infer<typeof CreateProject.requestSchema>;
export type CreateProjectResponse = z.infer<typeof CreateProject.responseSchema>;
export type GetProjectsResponse = z.infer<typeof GetProjects.responseSchema>;
export type GetProjectFilesResponse = z.infer<typeof GetProjectFiles.responseSchema>;
export type ReadProjectFileResponse = z.infer<typeof ReadProjectFile.responseSchema>;
export type ExportProjectResponse = z.infer<typeof ExportProject.responseSchema>;
export type SelectProjectForConversationResponse = z.infer<
  typeof SelectProjectForConversation.responseSchema
>;
export type SetPermissionModeResponse = z.infer<typeof SetPermissionMode.responseSchema>;
export type AgentQuestionPayload = z.infer<typeof AgentQuestionEvent.payloadSchema>;
export type AnswerAgentQuestionRequest = z.infer<typeof AnswerAgentQuestion.requestSchema>;
