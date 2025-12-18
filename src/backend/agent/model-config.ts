// Model configuration constants
export const MODEL_CONFIG = {
  SMALL_MODEL: "gpt-3.5-turbo", // Fast model for simple tasks
  BIG_MODEL: "gpt-4-turbo-preview", // Powerful model for complex tasks
} as const;

export type ModelName = keyof typeof MODEL_CONFIG;
