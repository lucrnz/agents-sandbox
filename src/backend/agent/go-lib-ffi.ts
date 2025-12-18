import { dlopen, FFIType, suffix, CString } from "bun:ffi";
import path from "path";
import fs from "fs";

// Define FFI interface for the Go library
interface GoLibFFISymbols {
  CleanHTML: (html: CString) => CString;
  ConvertHTMLToMarkdown: (html: CString) => CString;
  ParseSearchResults: (html: CString, maxResults: number) => CString;
  FreeString: (str: CString) => void;
  GetLibraryVersion: () => CString;
}

interface GoLibFFI {
  symbols: GoLibFFISymbols;
}

// Search result interface (matches Go's JSON output)
interface GoSearchResult {
  Title: string;
  Link: string;
  Snippet: string;
  Position: number;
}

// Transformed SearchResult for TypeScript (camelCase)
export interface SearchResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

// Library path detection
function getLibraryPath(): string | null {
  const possiblePaths = [
    // Development paths
    path.join(process.cwd(), "go-lib-ffi", `libgo-lib-ffi.${suffix}`),
    path.join(process.cwd(), "src", "backend", "agent", `libgo-lib-ffi.${suffix}`),
    // Production paths
    path.join(__dirname, `libgo-lib-ffi.${suffix}`),
    path.join(__dirname, `go-lib-ffi.${suffix === "dll" ? "dll" : suffix}`),
  ];

  for (const libPath of possiblePaths) {
    if (fs.existsSync(libPath)) {
      return libPath;
    }
  }

  return null;
}

// FFI wrapper class for go-lib-ffi
export class GoLibFFIWrapper {
  private lib: GoLibFFI | null = null;
  private isLoaded = false;

  constructor() {
    this.loadLibrary();
  }

  private loadLibrary(): void {
    try {
      const libPath = getLibraryPath();
      if (!libPath) {
        console.warn("[GO_LIB_FFI] Library not found at expected paths");
        return;
      }

      console.log(`[GO_LIB_FFI] Loading library from: ${libPath}`);

      this.lib = dlopen(libPath, {
        CleanHTML: {
          args: [FFIType.cstring],
          returns: FFIType.cstring,
        },
        ConvertHTMLToMarkdown: {
          args: [FFIType.cstring],
          returns: FFIType.cstring,
        },
        ParseSearchResults: {
          args: [FFIType.cstring, FFIType.i32],
          returns: FFIType.cstring,
        },
        FreeString: {
          args: [FFIType.cstring],
          returns: FFIType.void,
        },
        GetLibraryVersion: {
          args: [],
          returns: FFIType.cstring,
        },
      });

      this.isLoaded = true;
      console.log("[GO_LIB_FFI] Library loaded successfully");

      // Log version for debugging
      const version = this.getVersion();
      console.log(`[GO_LIB_FFI] Library version: ${version}`);
    } catch (error) {
      console.warn("[GO_LIB_FFI] Failed to load library:", error);
      this.isLoaded = false;
    }
  }

  public isAvailable(): boolean {
    return this.isLoaded && this.lib !== null;
  }

  public cleanHTML(html: string): string {
    if (!this.isAvailable()) {
      throw new Error("Go library not available");
    }

    try {
      // Encode string as buffer for FFI
      const buffer = Buffer.from(html + "\0"); // Add null terminator
      const resultPtr = (this.lib!.symbols.CleanHTML as any)(buffer);
      const result = resultPtr ? resultPtr.toString() : "";
      // Free the pointer (ignore errors if already freed)
      try {
        (this.lib!.symbols.FreeString as any)(resultPtr);
      } catch (e) {
        // Ignore errors from FreeString
      }
      return result;
    } catch (error) {
      console.error("[GO_LIB_FFI] Error in cleanHTML:", error);
      throw error;
    }
  }

  public convertToMarkdown(html: string): string {
    if (!this.isAvailable()) {
      throw new Error("Go library not available");
    }

    try {
      const buffer = Buffer.from(html + "\0");
      const resultPtr = (this.lib!.symbols.ConvertHTMLToMarkdown as any)(buffer);
      const result = resultPtr ? resultPtr.toString() : "";
      // Free the pointer (ignore errors if already freed)
      try {
        (this.lib!.symbols.FreeString as any)(resultPtr);
      } catch (e) {
        // Ignore errors from FreeString
      }
      return result;
    } catch (error) {
      console.error("[GO_LIB_FFI] Error in convertToMarkdown:", error);
      throw error;
    }
  }

  public parseSearchResults(html: string, maxResults: number = 20): SearchResult[] {
    if (!this.isAvailable()) {
      throw new Error("Go library not available");
    }

    try {
      const buffer = Buffer.from(html + "\0");
      const resultPtr = (this.lib!.symbols.ParseSearchResults as any)(buffer, maxResults);
      const result = resultPtr ? resultPtr.toString() : "[]";
      // Free the pointer (ignore errors if already freed)
      try {
        (this.lib!.symbols.FreeString as any)(resultPtr);
      } catch (e) {
        // Ignore errors from FreeString
      }

      // Handle null or undefined result
      if (!result || result.trim() === "") {
        console.warn("[GO_LIB_FFI] ParseSearchResults returned empty string");
        return [];
      }

      let goResults: GoSearchResult[];
      try {
        goResults = JSON.parse(result);
      } catch (parseError) {
        console.error("[GO_LIB_FFI] Failed to parse JSON:", parseError);
        console.error("[GO_LIB_FFI] Raw result:", result);
        return [];
      }

      // Ensure we have an array
      if (!Array.isArray(goResults)) {
        console.warn("[GO_LIB_FFI] ParseSearchResults did not return an array");
        return [];
      }

      // Transform from Go format (Title, Link, Snippet, Position) to TS format (title, link, snippet, position)
      return goResults.map((r) => ({
        title: r.Title || "",
        link: r.Link || "",
        snippet: r.Snippet || "",
        position: r.Position || 0,
      }));
    } catch (error) {
      console.error("[GO_LIB_FFI] Error in parseSearchResults:", error);
      throw error;
    }
  }

  public getVersion(): string {
    if (!this.isAvailable()) {
      return "not loaded";
    }

    try {
      const resultPtr = (this.lib!.symbols.GetLibraryVersion as any)();
      // GetLibraryVersion returns a pointer that needs to be freed
      const result = resultPtr ? resultPtr.toString() : "unknown";
      // Free the pointer (ignore errors if already freed)
      try {
        (this.lib!.symbols.FreeString as any)(resultPtr);
      } catch (e) {
        // Ignore errors from FreeString
      }
      return result;
    } catch (error) {
      console.error("[GO_LIB_FFI] Error getting version:", error);
      return "unknown";
    }
  }

  public getLibraryPath(): string | null {
    return getLibraryPath();
  }
}

// Singleton instance
let goLibInstance: GoLibFFIWrapper | null = null;

export function getGoLibFFI(): GoLibFFIWrapper | null {
  if (!goLibInstance) {
    goLibInstance = new GoLibFFIWrapper();
  }

  if (goLibInstance.isAvailable()) {
    return goLibInstance;
  }

  return null;
}
