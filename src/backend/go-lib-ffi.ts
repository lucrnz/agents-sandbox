import { dlopen, FFIType, suffix, CString } from "bun:ffi";
import path from "path";
import fs from "fs";

// Define FFI interface for the Go library
interface GoLibFFISymbols {
  CleanHTML: (html: CString) => CString;
  ConvertHTMLToMarkdown: (html: CString) => CString;
  ParseSearchResults: (html: CString, maxResults: number) => CString;
  StripMarkdown: (markdown: CString) => CString;
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
function getLibraryPath(): string {
  const possibleFileNames = [`libgo-lib-ffi.${suffix}`, `go-lib-ffi.${suffix}`];

  const possibleDirectories = [
    // Development paths
    path.join(process.cwd(), "go-lib-ffi"),
    path.join(process.cwd(), "src", "backend", "agent"),
    // Production paths
    path.join(__dirname),
  ];

  for (const directory of possibleDirectories) {
    for (const fileName of possibleFileNames) {
      const libPath = path.join(directory, fileName);
      if (fs.existsSync(libPath)) {
        return libPath;
      }
    }
  }

  throw new Error("Library not found");
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
        StripMarkdown: {
          args: [FFIType.cstring],
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

  /**
   * Safely frees a C string pointer returned by the Go library
   */
  private freePtr<P>(ptr: P): void {
    if (ptr && this.lib) {
      try {
        // Cast down the function. I am not sure why this works.
        (this.lib.symbols.FreeString as unknown as (ptr: P) => void)(ptr);
      } catch (e) {
        // Ignore errors from FreeString
        console.error("[GO_LIB_FFI] Error freeing pointer:", e);
      }
    }
  }

  /**
   * Executes an FFI function, converts the result pointer to a string,
   * frees the pointer, and returns the string.
   */
  private withStringResult(fn: () => any, defaultValue: string = ""): string {
    if (!this.isAvailable()) {
      throw new Error("Go library not available");
    }

    try {
      const result = fn();

      if (!result) return defaultValue;

      let stringResult: string;
      let ptrToFree: unknown = null;

      if (typeof result === "string") {
        stringResult = result;
      } else if (typeof result === "object") {
        stringResult = String(result);
        // Bun's cstring return type often returns an object that has a 'ptr' property
        // containing the actual memory address.
        if (result.ptr) {
          ptrToFree = result.ptr;
        }
      } else if (typeof result === "number" || typeof result === "bigint") {
        // @TODO: Research here, for now it throws a typescript error
        // Raw pointer address - use CString to convert and then free
        // @ts-ignore
        stringResult = new CString(result).toString();
        ptrToFree = result;
      } else {
        stringResult = String(result);
        ptrToFree = result;
      }

      if (ptrToFree) {
        this.freePtr(ptrToFree);
      }

      return stringResult;
    } catch (error) {
      // We don't log here to allow methods to provide better context
      throw error;
    }
  }

  public cleanHTML(html: string): string {
    try {
      const buffer = Buffer.from(html + "\0");
      return this.withStringResult(() => (this.lib!.symbols.CleanHTML as any)(buffer));
    } catch (error) {
      console.error("[GO_LIB_FFI] Error in cleanHTML:", error);
      throw error;
    }
  }

  public convertToMarkdown(html: string): string {
    try {
      const buffer = Buffer.from(html + "\0");
      return this.withStringResult(() => (this.lib!.symbols.ConvertHTMLToMarkdown as any)(buffer));
    } catch (error) {
      console.error("[GO_LIB_FFI] Error in convertToMarkdown:", error);
      throw error;
    }
  }

  public parseSearchResults(html: string, maxResults: number = 20): SearchResult[] {
    try {
      const buffer = Buffer.from(html + "\0");
      const result = this.withStringResult(
        () => (this.lib!.symbols.ParseSearchResults as any)(buffer, maxResults),
        "[]",
      );

      // Handle empty result
      if (!result || result.trim() === "" || result === "[]") {
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

      // Transform from Go format to TS format
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

  public stripMarkdown(markdown: string): string {
    try {
      const buffer = Buffer.from(markdown + "\0");
      return this.withStringResult(() => (this.lib!.symbols.StripMarkdown as any)(buffer));
    } catch (error) {
      console.error("[GO_LIB_FFI] Error in stripMarkdown:", error);
      throw error;
    }
  }

  public getVersion(): string {
    if (!this.isAvailable()) {
      return "not loaded";
    }

    try {
      return this.withStringResult(() => (this.lib!.symbols.GetLibraryVersion as any)(), "unknown");
    } catch (error) {
      console.error("[GO_LIB_FFI] Error getting version:", error);
      return "unknown";
    }
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
