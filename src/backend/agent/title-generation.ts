import { xai } from "@ai-sdk/xai";
import { generateText } from "ai";
import { MODEL_CONFIG, type ModelName } from "./model-config.js";

/**
 * Generate conversation title using small model
 */
export async function generateConversationTitle(content: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: xai("grok-4-1-fast-reasoning"), // Use Grok for titles
      prompt: `Generate a concise title (max 5 words) for this conversation:

"${content}"

Requirements:
- Maximum 5 words
- Captures main topic
- Professional but friendly tone
- No quotes or special characters

Title:`,
      maxRetries: 2,
    });

    return text.trim();
  } catch (error) {
    console.error("Title generation failed:", error);
    // Fallback to truncated content
    const title = content.length > 50 ? content.substring(0, 47) + "..." : content;
    return title;
  }
}

/**
 * Infer page title from URL using small model
 */
export async function inferPageTitle(url: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: xai("grok-4-1-fast-reasoning"), // Use Grok for quick inference
      prompt: `Given this URL, infer the most likely page title. Be concise and professional.

URL: ${url}

Return only the title, no explanation or additional text.

Title:`,
      maxRetries: 1,
    });

    return text.trim().replace(/["']+/g, ""); // Clean quotes
  } catch (error) {
    console.error("Title inference failed for", url, ":", error);
    // Fallback: extract domain and path
    try {
      const urlObj = new URL(url);
      const domain = urlObj.hostname.replace("www.", "");
      const path = urlObj.pathname.split("/").filter(Boolean).pop();
      return path ? `${domain}: ${path}` : domain;
    } catch {
      return url.split("/")[2] || url; // Last resort
    }
  }
}

/**
 * Extract search keywords from user query
 */
export function extractSearchKeywords(query: string): string[] {
  // Simple keyword extraction - in real app would use NLP
  const stopWords = [
    "what",
    "how",
    "where",
    "when",
    "why",
    "which",
    "who",
    "the",
    "a",
    "an",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "with",
    "by",
    "from",
    "about",
    "search",
    "find",
    "look",
    "looking",
    "help",
    "me",
  ];

  return query
    .toLowerCase()
    .replace(/[^\w\s]/g, " ") // Keep only letters and spaces
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopWords.includes(word))
    .slice(0, 5); // Max 5 keywords
}
