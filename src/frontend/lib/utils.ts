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
