import type { LanguageModel } from "ai";
import { ToolLoopAgent, stepCountIs } from "ai";
import { mkdir, rm } from "fs/promises";
import { join, resolve, relative, isAbsolute } from "path";
import { randomUUID } from "crypto";
import { tmpdir as getOsTmpDir } from "os";

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
  tools: Record<string, any>;
  maxSteps?: number;
  onToolCall?: (toolName: string, args: any) => void;
  onToolResult?: (toolName: string, result: any, error?: Error) => void;
}

/**
 * Create a temporary workspace for sub-agent
 */
export async function createSubAgentWorkspace(): Promise<SubAgentWorkspace> {
  const tmpDir = process.env.TMPDIR || getOsTmpDir();
  const sessionId = randomUUID();
  const actualPath = join(tmpDir, `agents-sandbox-${sessionId}`);

  console.log(`[SUB_AGENT] Creating workspace: ${actualPath}`);

  try {
    await mkdir(actualPath, { recursive: true });

    return {
      virtualPath: "/home/agent",
      actualPath,
    };
  } catch (error) {
    console.error("[SUB_AGENT] Failed to create workspace:", error);
    throw new Error(
      `Failed to create sub-agent workspace: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

/**
 * Clean up sub-agent workspace
 */
export async function cleanupSubAgentWorkspace(workspace: SubAgentWorkspace): Promise<void> {
  console.log(`[SUB_AGENT] Cleaning up workspace: ${workspace.actualPath}`);

  try {
    await rm(workspace.actualPath, { recursive: true, force: true });
    console.log("[SUB_AGENT] Workspace cleaned up successfully");
  } catch (error) {
    console.error("[SUB_AGENT] Failed to clean up workspace:", error);
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

  // If the path is absolute, it must start with the virtual path
  if (isAbsolute(virtualPath)) {
    if (!virtualPath.startsWith(basePath)) {
      throw new Error(`❌ Forbidden request: Path outside allowed workspace ${basePath}`);
    }

    // Extract relative path from virtual path
    const relativePath = virtualPath.slice(basePath.length);
    return resolve(basePathActual, relativePath);
  }

  // If relative path, resolve relative to virtual workspace
  return resolve(basePathActual, virtualPath);
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
  private agent!: ToolLoopAgent<never, any, any>;
  private workspace: SubAgentWorkspace | null = null;
  private config: SubAgentConfig;

  constructor(config: SubAgentConfig) {
    this.config = config;
  }

  /**
   * Execute sub-agent with automatic workspace cleanup
   */
  async execute(prompt: string): Promise<string> {
    console.log("[SUB_AGENT] Starting execution");

    // Create workspace
    this.workspace = await createSubAgentWorkspace();

    try {
      // Build system prompt with environment info
      const instructions = this.buildSystemPrompt();

      // Initialize agent
      this.agent = new ToolLoopAgent({
        model: this.config.model,
        instructions: instructions,
        tools: this.config.tools,
        stopWhen: stepCountIs(this.config.maxSteps || 10),
        onStepFinish: async (stepResult) => {
          // Check for tool calls
          if (stepResult.staticToolCalls && stepResult.staticToolCalls.length > 0) {
            for (const toolCall of stepResult.staticToolCalls) {
              console.log(`[SUB_AGENT] Tool call: ${toolCall.toolName}`, toolCall.input);
              if (this.config.onToolCall) {
                this.config.onToolCall(toolCall.toolName, toolCall.input);
              }
            }
          }

          // Check for tool results
          if (stepResult.staticToolResults && stepResult.staticToolResults.length > 0) {
            for (const toolResult of stepResult.staticToolResults) {
              console.log(`[SUB_AGENT] Tool result: ${toolResult.toolName}`);
              if (this.config.onToolResult) {
                this.config.onToolResult(toolResult.toolName, toolResult.output, undefined);
              }
            }
          }
        },
      });

      // Execute agent
      console.log("[SUB_AGENT] Executing agent with prompt:", prompt.substring(0, 100));
      const result = await this.agent.generate({ prompt });

      console.log("[SUB_AGENT] Execution completed");
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
