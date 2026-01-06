import { ToolLoopAgent, stepCountIs } from "ai";
import { bigModel } from "./model-config.js";
import { createDeepResearchTool } from "./deep-research.js";
import type { ToolName } from "@/shared/commands";

/**
 * Simple ChatAgent configuration with agentic fetch tool
 */
export class ChatAgent {
  private agent: ToolLoopAgent<never, any, any>;
  private params?: {
    onToolCall?: (toolName: string, args: any) => void;
    onToolResult?: (toolName: string, result: any, error?: Error) => void;
    onCriticalError?: (error: Error, originalError?: string) => void;
  };

  constructor(params?: {
    enabledTools?: ToolName[];
    onToolCall?: (toolName: string, args: any) => void;
    onToolResult?: (toolName: string, result: any, error?: Error) => void;
    onCriticalError?: (error: Error, originalError?: string) => void;
  }) {
    // Store params for use in error handling
    this.params = params;

    // Build tools object based on enabledTools
    const tools: Record<string, any> = {};

    // Include deep_research tool if enabledTools is undefined (backward compatibility) or explicitly enabled
    if (!params?.enabledTools || params.enabledTools.includes("deep_research")) {
      tools.deep_research = createDeepResearchTool({
        onSubAgentToolCall: params?.onToolCall,
        onSubAgentToolResult: params?.onToolResult,
      });
    }

    console.log("[CHAT_AGENT] Initializing with tools:", Object.keys(tools));

    this.agent = new ToolLoopAgent({
      model: bigModel,
      instructions: `You are a helpful AI assistant. Be conversational, thoughtful, and provide detailed responses when appropriate.

Current Date: ${new Date().toDateString()}

- Always be friendly and professional
- Do NOT use emojis in your responses
- Maintain a professional, assistant-like tone at all times
- Ask clarifying questions when needed
- Provide helpful, accurate information
- When you don't know something, admit it honestly
- Try to be concise but thorough in your responses
${tools.deep_research ? "- When you need current information from the web, use the deep_research tool to search or fetch content" : ""}`,

      // Tools object - conditionally includes deep_research
      tools,

      // Stop conditions - reasonable default
      stopWhen: stepCountIs(10),

      // Track tool execution for real-time status updates
      onStepFinish: async (stepResult) => {
        // Check for tool calls (tool execution starting)
        if (stepResult.staticToolCalls && stepResult.staticToolCalls.length > 0) {
          for (const toolCall of stepResult.staticToolCalls) {
            console.log(`[CHAT_AGENT] Tool call detected: ${toolCall.toolName}`, toolCall.input);
            if (params?.onToolCall) {
              params.onToolCall(toolCall.toolName, toolCall.input);
            }
          }
        }

        // Check for tool results (tool execution completed)
        if (stepResult.staticToolResults && stepResult.staticToolResults.length > 0) {
          for (const toolResult of stepResult.staticToolResults) {
            console.log(`[CHAT_AGENT] Tool result: ${toolResult.toolName}`);
            if (params?.onToolResult) {
              params.onToolResult(toolResult.toolName, toolResult.output, undefined);
            }
          }
        }
      },
    });
  }

  /**
   * Generate a response to the user's message
   * @param prompt The user's message
   * @returns Stream of text chunks
   */
  async *generateResponse(prompt: string): AsyncGenerator<string, void, unknown> {
    console.log(
      "[CHAT_AGENT] generateResponse called with:",
      prompt.substring(0, 100) + (prompt.length > 100 ? "..." : ""),
    );
    try {
      const result = await this.agent.stream({ prompt });

      // AI SDK handles tool execution automatically with onInputStart callbacks
      // Just stream the response text
      for await (const chunk of result.textStream) {
        yield chunk;
      }
    } catch (error) {
      console.error("[CHAT_AGENT] Error generating response:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const originalError = error instanceof Error ? error.stack : String(error);

      // Notify about critical error via callback
      if (this.params?.onCriticalError) {
        this.params.onCriticalError(
          new Error("Failed to generate AI response: " + errorMessage),
          originalError,
        );
      }

      // Still yield a friendly error message to the stream
      yield "❌ Sorry, I encountered an error while generating a response. Please try again.";
    }
  }

  /**
   * Generate a complete response (non-streaming)
   * @param prompt The user's message
   * @returns Complete text response
   */
  async generateCompleteResponse(prompt: string): Promise<string> {
    try {
      const result = await this.agent.generate({ prompt });
      return result.text;
    } catch (error) {
      console.error("Error generating response:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      const originalError = error instanceof Error ? error.stack : String(error);

      // Notify about critical error via callback
      if (this.params?.onCriticalError) {
        this.params.onCriticalError(
          new Error("Failed to generate AI response: " + errorMessage),
          originalError,
        );
      }

      return "❌ Sorry, I encountered an error while generating a response. Please try again.";
    }
  }
}
