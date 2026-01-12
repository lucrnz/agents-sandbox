import { ToolLoopAgent, stepCountIs, tool } from "ai";
import { z } from "zod";
import type { ToolName } from "@/shared/commands";
import { bigModel } from "@/backend/agent/model-config";
import { ProjectService, type ProjectPermissionMode } from "@/backend/services/project-service";
import { DockerManager } from "@/backend/services/docker-manager";

export type AgentQuestionType = "permission" | "choice" | "input";

export type AgentQuestion = {
  type: AgentQuestionType;
  title: string;
  message: string;
  options?: Array<{
    id: string;
    label: string;
    inputField?: { placeholder: string };
  }>;
};

export type AgentQuestionAnswer = {
  selectedOptionId: string;
  inputValue?: string;
};

export type AskUserFn = (question: AgentQuestion) => Promise<AgentQuestionAnswer>;

export type CoderAgentContext = {
  conversationId: string;
  projectId: string;
  permissionMode: ProjectPermissionMode;
};

/**
 * CoderAgent: a loop-capable coding agent with filesystem + container tools.
 *
 * This uses Vercel AI's ToolLoopAgent like the existing ChatAgent, but with
 * tools modeled after opencode-style capabilities.
 */
export class CoderAgent {
  private agent: ToolLoopAgent<never, any, any>;
  private projectService: ProjectService;
  private dockerManager?: DockerManager;
  private askUser: AskUserFn;
  private context: CoderAgentContext;

  private projectAccessGranted = false;
  private syncedToContainer = false;

  constructor(input: {
    enabledTools: ToolName[];
    context: CoderAgentContext;
    askUser: AskUserFn;
    projectService?: ProjectService;
    dockerManager?: DockerManager;
    onToolCall?: (toolName: string, args: any) => void;
    onToolResult?: (toolName: string, result: any, error?: Error) => void;
    onCriticalError?: (error: Error, originalError?: string) => void;
  }) {
    this.context = input.context;
    this.askUser = input.askUser;
    this.projectService = input.projectService ?? new ProjectService();
    this.dockerManager = input.dockerManager;

    const tools: Record<string, any> = {};
    const filesystemEnabled = input.enabledTools.includes("filesystem");
    const containerEnabled = input.enabledTools.includes("container");

    const requireProjectAccess = async () => {
      if (!filesystemEnabled) {
        throw new Error("Filesystem tool is not enabled.");
      }

      if (this.projectAccessGranted) return;
      if (this.context.permissionMode === "yolo") {
        this.projectAccessGranted = true;
        return;
      }

      const ans = await this.askUser({
        type: "permission",
        title: "Project Access",
        message: `Allow the agent to access project files for this conversation? (Project ID: ${this.context.projectId})`,
        options: [
          { id: "allow", label: "Allow" },
          { id: "deny", label: "Deny" },
        ],
      });

      if (ans.selectedOptionId !== "allow") {
        throw new Error("Project access denied by user.");
      }

      this.projectAccessGranted = true;
    };

    const requireWritePermission = async (actionLabel: string) => {
      if (this.context.permissionMode === "yolo") return;

      const ans = await this.askUser({
        type: "permission",
        title: "Permission Required",
        message: actionLabel,
        options: [
          { id: "allow", label: "Allow" },
          { id: "deny", label: "Deny" },
        ],
      });

      if (ans.selectedOptionId !== "allow") {
        throw new Error("Action denied by user.");
      }
    };

    if (filesystemEnabled) {
      tools.list_files = tool({
        description: "List all files in the selected project. Returns paths (project-relative).",
        inputSchema: z.object({}),
        execute: async () => {
          await requireProjectAccess();
          const files = await this.projectService.listFiles(this.context.projectId);
          return files.map((f) => `${f.path} (${f.size} bytes)`).join("\n") || "(no files)";
        },
      });

      tools.read_file = tool({
        description:
          "Read a file from the selected project (project-relative path). Returns the full file content as text.",
        inputSchema: z.object({
          path: z.string().min(1).describe("Project-relative file path"),
        }),
        execute: async ({ path }: { path: string }) => {
          await requireProjectAccess();
          const file = await this.projectService.readFileAsText(this.context.projectId, path);
          return file.content;
        },
      });

      tools.write_file = tool({
        description:
          "Create or overwrite a file in the selected project. Refuses ignored directories like node_modules.",
        inputSchema: z.object({
          path: z.string().min(1).describe("Project-relative file path"),
          content: z.string().describe("Full file contents"),
        }),
        execute: async ({ path, content }: { path: string; content: string }) => {
          await requireProjectAccess();
          await requireWritePermission(`Write file: ${path}`);
          await this.projectService.writeFileFromText(this.context.projectId, path, content);
          return "OK";
        },
      });

      tools.edit_file = tool({
        description: "Edit a file in the selected project using string replacement.",
        inputSchema: z.object({
          path: z.string().min(1).describe("Project-relative file path"),
          oldString: z.string().min(1).describe("Text to replace"),
          newString: z.string().describe("Replacement text"),
          replaceAll: z.boolean().optional().describe("Replace all occurrences (default false)"),
        }),
        execute: async ({
          path,
          oldString,
          newString,
          replaceAll,
        }: {
          path: string;
          oldString: string;
          newString: string;
          replaceAll?: boolean;
        }) => {
          await requireProjectAccess();
          await requireWritePermission(`Edit file: ${path}`);

          const file = await this.projectService.readFileAsText(this.context.projectId, path);
          const occurrences = file.content.split(oldString).length - 1;
          if (occurrences === 0) {
            throw new Error("oldString not found in file.");
          }
          if (!replaceAll && occurrences > 1) {
            throw new Error("oldString found multiple times; set replaceAll=true to proceed.");
          }

          const updated = replaceAll
            ? file.content.split(oldString).join(newString)
            : file.content.replace(oldString, newString);

          await this.projectService.writeFileFromText(this.context.projectId, path, updated);
          return "OK";
        },
      });

      tools.grep = tool({
        description:
          "Search for a case-insensitive text pattern across all project files. Returns matching lines with file and line numbers.",
        inputSchema: z.object({
          pattern: z.string().trim().min(1).describe("Text to search for (case-insensitive)"),
        }),
        execute: async ({ pattern }: { pattern: string }) => {
          await requireProjectAccess();
          const needle = pattern.toLowerCase();
          const files = await this.projectService.listFiles(this.context.projectId);

          const results: string[] = [];
          for (const f of files) {
            const text = new TextDecoder().decode(f.content as unknown as Uint8Array);
            const lines = text.split("\n");
            for (let i = 0; i < lines.length; i++) {
              const line = lines[i] ?? "";
              if (line.toLowerCase().includes(needle)) {
                results.push(`${f.path}:${i + 1}: ${line}`);
              }
            }
          }

          return results.length ? results.join("\n") : `No matches found for "${pattern}"`;
        },
      });
    }

    if (containerEnabled) {
      tools.bash = tool({
        description:
          "Run a bash command inside the per-conversation Ubuntu container in /workspace. Automatically syncs project files into the container before first use.",
        inputSchema: z.object({
          command: z.string().min(1).describe("Shell command to execute"),
          workdir: z
            .string()
            .optional()
            .describe("Working directory inside container (default /workspace)"),
          timeoutMs: z
            .number()
            .int()
            .positive()
            .optional()
            .describe("Timeout in milliseconds (default 120000)"),
          syncProjectToContainer: z
            .boolean()
            .optional()
            .describe(
              "If true, sync project files to container before command (default true on first run)",
            ),
        }),
        execute: async ({
          command,
          workdir,
          timeoutMs,
          syncProjectToContainer,
        }: {
          command: string;
          workdir?: string;
          timeoutMs?: number;
          syncProjectToContainer?: boolean;
        }) => {
          await requireProjectAccess();
          await requireWritePermission(`Run container command:\n\n${command}`);

          if (!this.dockerManager) {
            throw new Error("Docker manager not configured on server.");
          }

          const shouldSync =
            typeof syncProjectToContainer === "boolean"
              ? syncProjectToContainer
              : !this.syncedToContainer;

          if (shouldSync) {
            await this.dockerManager.syncFilesToContainer({
              conversationId: this.context.conversationId,
              projectId: this.context.projectId,
            });
            this.syncedToContainer = true;
          }

          const result = await this.dockerManager.execCommand({
            conversationId: this.context.conversationId,
            command,
            workdir,
            timeoutMs,
          });

          const combined = [
            result.stdout ? `STDOUT:\n${result.stdout}` : "",
            result.stderr ? `STDERR:\n${result.stderr}` : "",
            `EXIT_CODE: ${result.exitCode ?? "unknown"}`,
          ]
            .filter(Boolean)
            .join("\n\n");

          return combined.trim();
        },
      });
    }

    // ask_question is always present for agent-driven UX.
    tools.ask_question = tool({
      description:
        "Ask the user a blocking question (permission/choice/input) and wait for their answer.",
      inputSchema: z.object({
        type: z.enum(["permission", "choice", "input"]),
        title: z.string().min(1),
        message: z.string().min(1),
        options: z
          .array(
            z.object({
              id: z.string().min(1),
              label: z.string().min(1),
              inputField: z.object({ placeholder: z.string() }).optional(),
            }),
          )
          .optional(),
      }),
      execute: async (q: AgentQuestion) => {
        const answer = await this.askUser(q);
        return JSON.stringify(answer);
      },
    });

    this.agent = new ToolLoopAgent({
      model: bigModel,
      instructions: `You are CoderAgent: an autonomous coding assistant.

You can create and edit files in the user's selected project when the "filesystem" tool is enabled.
You can run commands in an ephemeral Ubuntu container when the "container" tool is enabled.

Hard rules:
- Never store ignored directories in the project (node_modules, venv, .venv, bin, etc).
- When you use the container, treat /workspace as the project root.
- When unsure, ask the user using ask_question.

Current Date: ${new Date().toDateString()}
`,
      tools,
      stopWhen: stepCountIs(50),
      onStepFinish: async (stepResult) => {
        if (stepResult.staticToolCalls?.length) {
          for (const c of stepResult.staticToolCalls) {
            input.onToolCall?.(c.toolName, c.input);
          }
        }
        if (stepResult.staticToolResults?.length) {
          for (const r of stepResult.staticToolResults) {
            input.onToolResult?.(r.toolName, r.output, undefined);
          }
        }
      },
    });

    // Keep callbacks for critical error parity with ChatAgent
    // (ToolLoopAgent exceptions are handled in generateResponse).
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const _ = input.onCriticalError;
  }

  static readonly ChunkType = {
    REASONING: "reasoning",
    TEXT: "text",
  } as const;

  async *generateResponse(
    prompt: string,
    abortSignal?: AbortSignal,
  ): AsyncGenerator<{ type: "reasoning" | "text"; content: string }, void, unknown> {
    try {
      const result = await this.agent.stream({ prompt, abortSignal });
      for await (const chunk of result.fullStream) {
        if (abortSignal?.aborted) return;
        if (chunk.type === "reasoning-delta") {
          yield { type: "reasoning", content: chunk.text };
        } else if (chunk.type === "text-delta") {
          yield { type: "text", content: chunk.text };
        }
      }
    } catch (error) {
      if (abortSignal?.aborted || (error instanceof Error && error.name === "AbortError")) {
        return;
      }
      const errorId = crypto.randomUUID();
      // eslint-disable-next-line no-console
      console.error(`[CODER_AGENT] Error ${errorId}:`, error);
      yield {
        type: "text",
        content: `❌ Sorry, I encountered an error while running CoderAgent. (Ref: ${errorId.slice(0, 8)})`,
      };
    }
  }
}
