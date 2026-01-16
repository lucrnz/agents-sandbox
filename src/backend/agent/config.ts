/**
 * Agent Configuration Constants
 * Centralized location for magic numbers and configuration values used by agents and tools.
 */

/**
 * File size threshold for saving to workspace vs returning directly.
 * Pages larger than this will be saved to the virtual /home/agent/ directory.
 */
export const LARGE_PAGE_THRESHOLD = 50 * 1024; // 50KB

/**
 * Maximum number of steps for sub-agent tool loops.
 * Prevents infinite loops and controls execution cost.
 */
export const MAX_SUB_AGENT_STEPS = 10;

/**
 * Default number of search results to fetch from search engines.
 */
export const DEFAULT_SEARCH_RESULTS_COUNT = 10;

/**
 * Browser User Agent for web requests.
 * Used to mimic a real browser and avoid some basic bot detection.
 */
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Timeout for HTTP fetch requests in milliseconds.
 * Prevents hanging requests from blocking agent execution.
 */
export const FETCH_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Maximum response size for fetched content in bytes.
 */
export const MAX_FETCH_BYTES = 2 * 1024 * 1024; // 2MB

/**
 * Maximum retries for AI model calls.
 */
export const AI_MAX_RETRIES = 2;

/**
 * Maximum retries for non-critical AI calls (title inference, etc.).
 */
export const AI_MAX_RETRIES_LOW_PRIORITY = 1;

/**
 * Default title prefix for new conversations.
 * Used for checking if a conversation needs title generation.
 */
export const DEFAULT_CONVERSATION_TITLE_PREFIX = "New chat";
