import { xai } from "@ai-sdk/xai";
import { mistral } from "@ai-sdk/mistral";
import type { LanguageModel } from "ai";

/**
 * Small Model: Ministral 3B
 * https://docs.mistral.ai/models/ministral-3-3b-25-12
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
export const smallModel: LanguageModel = mistral("ministral-3b-2512");

/**
 * Big Model: xAI Grok 4.1 Fast Reasoning
 *
 * Use for:
 * - Main chat agent conversations
 * - Complex reasoning tasks
 * - Multi-step planning
 * - Advanced tool usage
 * - Any task requiring sophisticated understanding
 */
export const bigModel: LanguageModel = xai("grok-4-1-fast-reasoning");
