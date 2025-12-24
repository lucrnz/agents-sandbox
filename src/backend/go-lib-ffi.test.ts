import { test, expect, describe, mock, beforeEach } from "bun:test";
import { GoLibFFIWrapper, getGoLibFFI } from "./go-lib-ffi";

// Mock bun:ffi
mock.module("bun:ffi", () => ({
  dlopen: mock((path: string, symbols: any) => ({
    symbols: {
      CleanHTML: mock(() => 123), // pointer
      ConvertHTMLToMarkdown: mock(() => 456), // pointer
      ParseSearchResults: mock(() => 789), // pointer
      StripMarkdown: mock(() => 101), // pointer
      FreeString: mock(() => {}),
      GetLibraryVersion: mock(() => 202), // pointer
    },
  })),
  FFIType: {
    cstring: "cstring",
    i32: "i32",
    void: "void",
  },
  suffix: "dylib",
  CString: class {
    constructor(public ptr: number) {}
    toString() {
      if (this.ptr === 123) return "cleaned html";
      if (this.ptr === 456) return "markdown";
      if (this.ptr === 789)
        return JSON.stringify([{ Title: "T1", Link: "L1", Snippet: "S1", Position: 1 }]);
      if (this.ptr === 101) return "stripped markdown";
      if (this.ptr === 202) return "1.0.0";
      return "";
    }
  },
}));

// Mock fs and path
mock.module("fs", () => ({
  default: {
    existsSync: mock((p: string) => p.includes("libgo-lib-ffi")),
  },
}));

describe("GoLibFFI", () => {
  let wrapper: GoLibFFIWrapper;

  beforeEach(() => {
    wrapper = new GoLibFFIWrapper();
  });

  test("should load library if path exists", () => {
    expect(wrapper.isAvailable()).toBe(true);
  });

  test("cleanHTML should return cleaned content", () => {
    const result = wrapper.cleanHTML("<html></html>");
    expect(result).toBe("cleaned html");
  });

  test("convertToMarkdown should return markdown", () => {
    const result = wrapper.convertToMarkdown("<html></html>");
    expect(result).toBe("markdown");
  });

  test("parseSearchResults should return parsed results", () => {
    const results = wrapper.parseSearchResults("html", 10);
    expect(results).toHaveLength(1);
    expect(results[0]).toEqual({
      title: "T1",
      link: "L1",
      snippet: "S1",
      position: 1,
    });
  });

  test("stripMarkdown should return stripped content", () => {
    const result = wrapper.stripMarkdown("# Title");
    expect(result).toBe("stripped markdown");
  });

  test("getVersion should return version string", () => {
    const version = wrapper.getVersion();
    expect(version).toBe("1.0.0");
  });

  test("getGoLibFFI should return a singleton instance", () => {
    const inst1 = getGoLibFFI();
    const inst2 = getGoLibFFI();
    expect(inst1).toBe(inst2);
    expect(inst1).not.toBeNull();
  });
});
