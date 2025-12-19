import { generateText } from "ai";
import { smallModel } from "./model-config.js";

/**
 * Generate conversation title using small model
 */
export async function generateConversationTitle(content: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: smallModel,
      prompt: `Generate a concise title (max 5 words) for this conversation:

"${content}"

Requirements:
- Maximum 5 words
- Captures main topic
- Professional but friendly tone
- No quotes or special characters
- Do not use markdown formatting

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
      model: smallModel, // Use small model for quick inference
      prompt: `Given this URL, infer the most likely page title. Be concise and professional. Do not use markdown formatting.

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

/**
 * Generate a short, filename-safe description using the small model
 */
export async function generateShortFilenameDescription(content: string): Promise<string> {
  try {
    const { text } = await generateText({
      model: smallModel,
      prompt: `Create a very short filename-friendly description (max 3-4 words) for this content:

"${content}"

Requirements:
- Max 3-4 words
- Use only letters, numbers, and spaces
- No special characters, quotes, or punctuation
- Do not use markdown formatting
- Be concise and descriptive
- Use common words that capture the essence

Short description:`,
      maxRetries: 1,
    });

    // Clean up the text to be filename-safe
    const cleaned = text
      .trim()
      .replace(/[^a-zA-Z0-9\s]/g, "") // Remove special characters
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();

    // If the model returned something empty or just spaces, use a fallback
    if (!cleaned || cleaned.length === 0) {
      const keywords = extractSearchKeywords(content);
      return keywords.slice(0, 3).join(" ");
    }

    return cleaned;
  } catch (error) {
    console.error("Filename description generation failed:", error);
    // Fallback to keywords
    const keywords = extractSearchKeywords(content);
    return keywords.slice(0, 3).join(" ");
  }
}
