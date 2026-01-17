import { dlopen, FFIType, suffix, CString, type Pointer } from "bun:ffi";
import path from "path";
import fs from "fs";
import { createLogger } from "@/backend/logger";

const logger = createLogger("backend:go-lib-ffi");

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
    // Production paths
    path.join(__dirname),
    // Local development / integration test paths
    path.join(process.cwd(), "go-lib-ffi"),
    path.join(process.cwd(), "src", "backend"),
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
      logger.info({ libPath }, "Loading Go library");

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
      logger.info("Go library loaded successfully");

      // Log version for debugging
      const version = this.getVersion();
      logger.info({ version }, "Go library version");
    } catch (error) {
      logger.warn({ error }, "Failed to load Go library");
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
        logger.error({ error: e }, "Error freeing pointer");
      }
    }
  }

  /**
   * Executes an FFI function, converts the result pointer to a string,
   * frees the pointer, and returns the string.
   */
  private withStringResult(fn: () => unknown, defaultValue: string = ""): string {
    if (!this.isAvailable()) {
      throw new Error("Go library not available");
    }

    try {
      const result = fn();

      if (!result) return defaultValue;

      let stringResult: string;
      let ptrToFree: unknown = null;

      if (typeof result === "object" && result !== null) {
        const maybePtr = result as { ptr?: unknown };
        stringResult = String(result);
        if (maybePtr.ptr) {
          ptrToFree = maybePtr.ptr;
        }
      } else if (typeof result === "string") {
        stringResult = result;
      } else if (typeof result === "number" || typeof result === "bigint") {
        // Raw pointer address - use CString to convert and then free
        const ptrValue = Number(result);
        stringResult = new CString(ptrValue as unknown as Pointer).toString();
        ptrToFree = ptrValue;
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
      type CleanHTMLFn = (buffer: Buffer) => CString;
      return this.withStringResult(() =>
        (this.lib!.symbols.CleanHTML as unknown as CleanHTMLFn)(buffer),
      );
    } catch (error) {
      logger.error({ error }, "Error in cleanHTML");
      throw error;
    }
  }

  public convertToMarkdown(html: string): string {
    try {
      const buffer = Buffer.from(html + "\0");
      type ConvertFn = (buffer: Buffer) => CString;
      return this.withStringResult(() =>
        (this.lib!.symbols.ConvertHTMLToMarkdown as unknown as ConvertFn)(buffer),
      );
    } catch (error) {
      logger.error({ error }, "Error in convertToMarkdown");
      throw error;
    }
  }

  public parseSearchResults(html: string, maxResults: number = 20): SearchResult[] {
    try {
      const buffer = Buffer.from(html + "\0");
      type ParseFn = (buffer: Buffer, maxResults: number) => CString;
      const result = this.withStringResult(
        () => (this.lib!.symbols.ParseSearchResults as unknown as ParseFn)(buffer, maxResults),
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
        logger.error({ error: parseError, result }, "Failed to parse JSON");
        return [];
      }

      // Ensure we have an array
      if (!Array.isArray(goResults)) {
        logger.warn({ result }, "ParseSearchResults did not return an array");
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
      logger.error({ error }, "Error in parseSearchResults");
      throw error;
    }
  }

  public stripMarkdown(markdown: string): string {
    try {
      const buffer = Buffer.from(markdown + "\0");
      type StripFn = (buffer: Buffer) => CString;
      return this.withStringResult(() =>
        (this.lib!.symbols.StripMarkdown as unknown as StripFn)(buffer),
      );
    } catch (error) {
      logger.error({ error }, "Error in stripMarkdown");
      throw error;
    }
  }

  public getVersion(): string {
    if (!this.isAvailable()) {
      return "not loaded";
    }

    try {
      type VersionFn = () => CString;
      return this.withStringResult(
        () => (this.lib!.symbols.GetLibraryVersion as unknown as VersionFn)(),
        "unknown",
      );
    } catch (error) {
      logger.error({ error }, "Error getting version");
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
