import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function sanitizeUrl(url?: string): string {
  if (!url) return "#";

  const trimmedUrl = url.trim();
  const lowerCaseUrl = trimmedUrl.toLowerCase();

  // Block dangerous protocols
  if (
    lowerCaseUrl.startsWith("javascript:") ||
    lowerCaseUrl.startsWith("data:") ||
    lowerCaseUrl.startsWith("vbscript:")
  ) {
    return "#";
  }

  // If it's an absolute URL, check if the protocol is safe
  if (/^[a-z][a-z0-9+.-]*:/.test(lowerCaseUrl)) {
    const safeProtocols = ["http:", "https:", "mailto:", "tel:"];
    const protocol = lowerCaseUrl.split(":")[0] + ":";
    if (!safeProtocols.includes(protocol)) {
      return "#";
    }
  }

  if (
    lowerCaseUrl.startsWith("file:") ||
    lowerCaseUrl.startsWith("blob:") ||
    lowerCaseUrl.startsWith("chrome:") ||
    lowerCaseUrl.startsWith("about:")
  ) {
    return "#";
  }

  return trimmedUrl;
}

type LogContext = Record<string, unknown>;

type FrontendLogger = {
  debug: (message: string, context?: LogContext) => void;
  info: (message: string, context?: LogContext) => void;
  warn: (message: string, context?: LogContext) => void;
  error: (message: string, error?: unknown, context?: LogContext) => void;
};

type ImportMetaEnv = {
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
};

type ImportMetaWithEnv = ImportMeta & {
  env?: ImportMetaEnv;
};

type GlobalWithProcess = typeof globalThis & {
  process?: {
    env?: {
      NODE_ENV?: string;
    };
  };
};

let errorReporter: ((error: unknown, context: LogContext) => void) | null = null;

export const setFrontendErrorReporter = (
  reporter: (error: unknown, context: LogContext) => void,
) => {
  errorReporter = reporter;
};

const resolveIsDev = () => {
  const metaEnv = (import.meta as ImportMetaWithEnv).env;
  if (typeof metaEnv?.DEV === "boolean") {
    return metaEnv.DEV;
  }

  if (metaEnv?.MODE) {
    return metaEnv.MODE !== "production";
  }

  const processEnv = (globalThis as GlobalWithProcess).process?.env;
  if (processEnv?.NODE_ENV) {
    return processEnv.NODE_ENV !== "production";
  }

  return false;
};

export const createFrontendLogger = (scope: string): FrontendLogger => {
  const isDev = resolveIsDev();
  const prefix = `[${scope}]`;

  const log = (
    level: "debug" | "info" | "warn" | "error",
    message: string,
    context?: LogContext,
    error?: unknown,
  ) => {
    if (isDev) {
      const entry = `${prefix} ${message}`;
      if (error !== undefined) {
        console[level](entry, context ?? {}, error);
        return;
      }
      if (context) {
        console[level](entry, context);
        return;
      }
      console[level](entry);
      return;
    }

    if (level === "error" && errorReporter) {
      const reporterContext: LogContext = { scope, message, ...(context ?? {}) };
      errorReporter(error ?? new Error(message), reporterContext);
    }
  };

  return {
    debug: (message, context) => log("debug", message, context),
    info: (message, context) => log("info", message, context),
    warn: (message, context) => log("warn", message, context),
    error: (message, error, context) => log("error", message, context, error),
  };
};
