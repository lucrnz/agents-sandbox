import { xai } from "@ai-sdk/xai";
import { openrouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModel } from "ai";

/**
 * Small Model: Mistral Nemo via OpenRouter
 *
 * Use for:
 * - Conversation title generation
 * - Page title inference from URLs
 * - Debug filename generation
 * - Log message generation
 * - Any small text generation tasks
 *
 * Not recommended for complex reasoning or main chat responses.
 */
export const smallModel: LanguageModel = openrouter("mistralai/mistral-nemo");

/**
 * Big Model: xAI Grok 4-1 Fast Reasoning
 *
 * Use for:
 * - Main chat agent conversations
 * - Complex reasoning tasks
 * - Multi-step planning
 * - Advanced tool usage
 * - Any task requiring sophisticated understanding
 */
export const bigModel: LanguageModel = xai("grok-4-1-fast-reasoning");

// Type for importing models
export type { LanguageModel };
