import { generateText, Output } from "ai";
import { smallModel } from "./model-config.js";
import z from "zod";
import { getGoLibFFI } from "@/backend/go-lib-ffi.js";

/**
 * Generate conversation title using small model
 */
export async function generateConversationTitle(content: string): Promise<string> {
  try {
    const goLib = getGoLibFFI();
    if (!goLib) {
      throw new Error("Go library not available for title generation");
    }

    const {
      output: { title: rawTitleResult },
    } = await generateText({
      model: smallModel,
      output: Output.object({
        schema: z.object({
          title: z
            .string()
            .describe("The title of the conversation")
            .refine((title) => title.split(" ").length <= 5, {
              message: "Title must be less than or equal to 5 words",
            }),
        }),
      }),
      prompt: `Generate a concise title (max 5 words) for this conversation.
      Rules:
      - Maximum 5 words
      - Captures main topic
      - Professional but friendly tone
      - No quotes or special characters
      - No markdown formatting
      Conversation:
      ${content}`,
      maxRetries: 2,
    });

    const cleanedTitle = goLib.stripMarkdown(rawTitleResult);
    return cleanedTitle.trim();
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
    const goLib = getGoLibFFI();
    if (!goLib) {
      throw new Error("Go library not available for title generation");
    }

    const { text } = await generateText({
      model: smallModel, // Use small model for quick inference
      prompt: `Given this URL, infer the most likely page title. Be concise and professional.

URL: ${url}

Return only the title, no explanation or additional text.

Title:`,
      maxRetries: 1,
    });

    const rawTitleNoQuotes = text.trim().replace(/["']+/g, "");
    const cleanedTitle = goLib.stripMarkdown(rawTitleNoQuotes);
    return cleanedTitle.trim();
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
 * Extract search keywords from user query using the small model
 */
export async function extractSearchKeywords(query: string): Promise<string[]> {
  try {
    const goLib = getGoLibFFI();
    if (!goLib) {
      throw new Error("Go library not available for keyword extraction");
    }

    const { text } = await generateText({
      model: smallModel,
      prompt: `Extract 3-5 most important search keywords from this query. 
      Return them as a space-separated list of single words.
      No punctuation, no special characters, no explanations.
      
      Query: ${query}
      
      Keywords:`,
      maxRetries: 1,
    });

    const keywords = goLib
      .stripMarkdown(text)
      .trim()
      .split(/\s+/)
      .filter((word) => word.length > 0)
      .map((word) => word.toLowerCase().replace(/[^\w]/g, ""))
      .filter((word) => word.length > 1)
      .slice(0, 5);

    if (keywords.length === 0) {
      throw new Error("No keywords found");
    }

    return keywords;
  } catch (error) {
    console.error("Keyword extraction failed:", error);
    // Fallback
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
      "are",
      "is",
      "was",
      "were",
      "am",
    ];

    return query
      .toLowerCase()
      .replace(/[^\w\s]/g, " ") // Keep only letters and spaces
      .split(/\s+/)
      .filter((word) => word.length > 2 && !stopWords.includes(word))
      .slice(0, 5); // Max 5 keywords
  }
}

/**
 * Generate a short, filename-safe description using the small model
 */
export async function generateShortFilenameDescription(content: string): Promise<string> {
  try {
    const goLib = getGoLibFFI();
    if (!goLib) {
      throw new Error("Go library not available for filename description generation");
    }

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
    const cleaned = goLib
      .stripMarkdown(text.trim())
      .trim()
      .replace(/[^a-zA-Z0-9\s]/g, "") // Remove special characters
      .replace(/\s+/g, " ") // Collapse multiple spaces
      .trim();

    // If the model returned something empty or just spaces, use a fallback
    if (!cleaned || cleaned.length === 0) {
      const keywords = await extractSearchKeywords(content);
      return keywords.slice(0, 3).join(" ");
    }

    return cleaned;
  } catch (error) {
    console.error("Filename description generation failed:", error);
    // Fallback to keywords
    const keywords = await extractSearchKeywords(content);
    return keywords.slice(0, 3).join(" ");
  }
}
