import { afterEach, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { cleanup } from "@testing-library/react";
import * as matchers from "@testing-library/jest-dom/matchers";

expect.extend(matchers);

// Register happy-dom globals - this must happen first
GlobalRegistrator.register();

// Ensure document and document.body exist for React Testing Library
// This is critical - screen queries check for document.body at initialization
if (typeof globalThis !== "undefined") {
  // Force document.body to exist if it doesn't
  if (!globalThis.document?.body && globalThis.document) {
    const body = globalThis.document.createElement("body");
    globalThis.document.appendChild(body);
  }
}

afterEach(() => {
  cleanup();
  // Clear body to prevent DOM accumulation between tests
  if (document?.body) {
    document.body.innerHTML = "";
  }
});
