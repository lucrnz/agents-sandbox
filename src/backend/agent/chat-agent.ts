import { Experimental_Agent as Agent, stepCountIs } from "ai";
import { xai } from "@ai-sdk/xai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { createAgenticFetchTool } from "./agentic-fetch.js";
import { generateConversationTitle } from "./title-generation.js";

/**
 * Simple ChatAgent configuration with agentic fetch tool
 */
export class ChatAgent {
  private agent: Agent<{ agentic_fetch: ReturnType<typeof createAgenticFetchTool> }>;

  constructor(params?: {
    onToolCall?: (toolName: string, args: any) => void;
    onToolResult?: (toolName: string, result: any, error?: Error) => void;
  }) {
    // Initialize the agent with xAI model (currently using Grok)
    const agenticFetchTool = createAgenticFetchTool();
    console.log("[CHAT_AGENT] Initializing with tools:", { agentic_fetch: !!agenticFetchTool });

    this.agent = new Agent({
      model: xai("grok-4-1-fast-reasoning"),
      system: `You are a helpful AI assistant. Be conversational, thoughtful, and provide detailed responses when appropriate.
      
- Always be friendly and professional
- Ask clarifying questions when needed
- Provide helpful, accurate information
- When you don't know something, admit it honestly
- Try to be concise but thorough in your responses
- When you need current information from the web, use the agentic_fetch tool to search or fetch content`,

      // Tools object - now includes agentic_fetch
      tools: {
        agentic_fetch: agenticFetchTool,
      },

      // Stop conditions - reasonable default
      stopWhen: stepCountIs(10),

      // Track tool execution for real-time status updates
      prepareStep: async ({ steps }) => {
        if (!steps || steps.length === 0) return {};

        const lastStep = steps[steps.length - 1];

        // Check for tool calls (tool execution starting)
        if (lastStep?.toolCalls && lastStep.toolCalls.length > 0) {
          for (const toolCall of lastStep.toolCalls) {
            console.log(`[CHAT_AGENT] Tool call detected: ${toolCall.toolName}`, toolCall.args);
            if (params?.onToolCall) {
              params.onToolCall(toolCall.toolName, toolCall.args);
            }
          }
        }

        // Check for tool results (tool execution completed)
        if (lastStep?.toolResults && lastStep.toolResults.length > 0) {
          for (const toolResult of lastStep.toolResults) {
            console.log(`[CHAT_AGENT] Tool result: ${toolResult.toolName}`, toolResult.result);
            if (params?.onToolResult) {
              params.onToolResult(toolResult.toolName, toolResult.result, toolResult.error);
            }
          }
        }

        return {}; // Continue with default settings
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
      yield "Sorry, I encountered an error while generating a response. Please try again.";
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
      return "Sorry, I encountered an error while generating a response. Please try again.";
    }
  }

  /**
   * Get the chat agent instance (for direct access)
   */
  getAgent() {
    return this.agent;
  }
}

// Export a singleton instance
export const chatAgent = new ChatAgent();

// Export title generation function for command handlers
export { generateConversationTitle };
