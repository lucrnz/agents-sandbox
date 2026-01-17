import type { LanguageModel, Tool } from "ai";
import { ToolLoopAgent, stepCountIs } from "ai";
import { mkdir, rm } from "fs/promises";
import { join, resolve, relative, isAbsolute } from "path";
import { randomUUID } from "crypto";
import { tmpdir as getOsTmpDir } from "os";
import { MAX_SUB_AGENT_STEPS } from "./config";
import type { ToolCallCallback, ToolResultCallback } from "@/shared/tool-types";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:sub-agent");

/**
 * Sub-agent workspace configuration
 * Maps virtual path `/home/agent` to actual OS temp directory
 */
export interface SubAgentWorkspace {
  virtualPath: string; // Always "/home/agent"
  actualPath: string; // Actual OS temp directory path
}

/**
 * Sub-agent configuration
 */
export interface SubAgentConfig {
  model: LanguageModel;
  system: string;
  tools: Record<string, Tool>;
  maxSteps?: number;
  onToolCall?: ToolCallCallback;
  onToolResult?: ToolResultCallback;
  onWorkspaceCreated?: (workspace: SubAgentWorkspace) => void;
}

/**
 * Create a temporary workspace for sub-agent
 */
export async function createSubAgentWorkspace(): Promise<SubAgentWorkspace> {
  const tmpDir = process.env.TMPDIR || getOsTmpDir();
  const sessionId = randomUUID();
  const actualPath = join(tmpDir, `agents-sandbox-${sessionId}`);

  logger.info({ actualPath }, "Creating workspace");

  try {
    await mkdir(actualPath, { recursive: true });

    return {
      virtualPath: "/home/agent",
      actualPath,
    };
  } catch (error) {
    logger.error({ error }, "Failed to create workspace");
    throw new Error(
      `Failed to create sub-agent workspace: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Clean up sub-agent workspace
 */
export async function cleanupSubAgentWorkspace(workspace: SubAgentWorkspace): Promise<void> {
  logger.info({ actualPath: workspace.actualPath }, "Cleaning up workspace");

  try {
    await rm(workspace.actualPath, { recursive: true, force: true });
    logger.info("Workspace cleaned up successfully");
  } catch (error) {
    logger.error({ error }, "Failed to clean up workspace");
    // Don't throw - cleanup failures should not break the flow
  }
}

/**
 * Convert virtual path to actual OS path
 * @param virtualPath Virtual path (e.g., "/home/agent/file.md")
 * @param workspace Sub-agent workspace configuration
 * @returns Actual OS path
 * @throws Error if path is outside virtual workspace
 */
export function virtualPathToActual(virtualPath: string, workspace: SubAgentWorkspace): string {
  const { virtualPath: basePath, actualPath: basePathActual } = workspace;
  let resolvedPath: string;

  // If the path is absolute, it must start with the virtual path
  if (isAbsolute(virtualPath)) {
    if (!virtualPath.startsWith(basePath)) {
      throw new Error(`❌ Forbidden request: Path outside allowed workspace ${basePath}`);
    }

    // Extract relative path from virtual path
    let relativePath = virtualPath.slice(basePath.length);

    // Remove leading slash if present to allow resolution relative to basePathActual
    if (relativePath.startsWith("/")) {
      relativePath = relativePath.slice(1);
    }

    resolvedPath = resolve(basePathActual, relativePath);
  } else {
    // If relative path, resolve relative to virtual workspace
    resolvedPath = resolve(basePathActual, virtualPath);
  }

  // Final security check: Ensure the resolved path is still within the actual workspace
  // This blocks traversal attempts like "../../etc/passwd"
  // Note: We check for basePathActual + "/" to prevent prefix collision attacks
  // (e.g., basePathActual="/tmp/agent-1" should not allow "/tmp/agent-1-malicious")
  if (!resolvedPath.startsWith(basePathActual + "/") && resolvedPath !== basePathActual) {
    throw new Error(`❌ Forbidden request: Path traversal detected`);
  }

  return resolvedPath;
}

/**
 * Convert actual OS path to virtual path
 * @param actualPath Actual OS path
 * @param workspace Sub-agent workspace configuration
 * @returns Virtual path
 */
export function actualPathToVirtual(actualPath: string, workspace: SubAgentWorkspace): string {
  const { virtualPath: basePathVirtual, actualPath: basePathActual } = workspace;

  const relativePath = relative(basePathActual, actualPath);
  return join(basePathVirtual, relativePath);
}

/**
 * Sub-agent class with virtual workspace support
 */
export class SubAgent {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private agent!: ToolLoopAgent<never, any, any>;
  private workspace: SubAgentWorkspace | null = null;
  private readonly config: SubAgentConfig;

  constructor(config: SubAgentConfig) {
    this.config = config;
  }

  /**
   * Execute sub-agent with automatic workspace cleanup
   */
  async execute(prompt: string): Promise<string> {
    logger.info("Starting execution");

    // Create workspace
    this.workspace = await createSubAgentWorkspace();

    // Notify caller that workspace is ready
    if (this.config.onWorkspaceCreated) {
      this.config.onWorkspaceCreated(this.workspace);
    }

    try {
      // Build system prompt with environment info
      const instructions = this.buildSystemPrompt();

      // Initialize agent
      this.agent = new ToolLoopAgent({
        model: this.config.model,
        instructions: instructions,
        tools: this.config.tools,
        stopWhen: stepCountIs(this.config.maxSteps || MAX_SUB_AGENT_STEPS),
        onStepFinish: async (stepResult) => {
          // Check for tool calls
          if (stepResult.staticToolCalls && stepResult.staticToolCalls.length > 0) {
            for (const toolCall of stepResult.staticToolCalls) {
              logger.info({ toolName: toolCall.toolName }, "Tool call");
              if (this.config.onToolCall) {
                this.config.onToolCall(toolCall.toolName, toolCall.input);
              }
            }
          }

          // Check for tool results
          if (stepResult.staticToolResults && stepResult.staticToolResults.length > 0) {
            for (const toolResult of stepResult.staticToolResults) {
              logger.info({ toolName: toolResult.toolName }, "Tool result");
              if (this.config.onToolResult) {
                this.config.onToolResult(toolResult.toolName, toolResult.output, undefined);
              }
            }
          }
        },
      });

      // Execute agent
      logger.info({ preview: prompt.substring(0, 100) }, "Executing agent");
      const result = await this.agent.generate({ prompt });

      logger.info("Execution completed");
      return result.text;
    } finally {
      // Clean up workspace even on error
      if (this.workspace) {
        await cleanupSubAgentWorkspace(this.workspace);
        this.workspace = null;
      }
    }
  }

  /**
   * Get current workspace (for tools)
   */
  getWorkspace(): SubAgentWorkspace | null {
    return this.workspace;
  }

  /**
   * Build system prompt with environment info
   */
  private buildSystemPrompt(): string {
    const today = new Date().toDateString();
    return `${this.config.system}

<env>
Current Date: ${today}
Your working directory is: /home/agent

IMPORTANT: You can only read and write files within /home/agent.
All file operations are strictly bounded to this virtual workspace.
Any attempt to access paths outside /home/agent will be rejected with a "forbidden request" error.
</env>`;
  }
}
