/// <reference lib="dom" />

import { test, expect, describe } from "bun:test";
import { cn } from "./utils";

describe("cn utility function", () => {
  test("merges multiple class strings", () => {
    const result = cn("foo", "bar", "baz");
    expect(result).toBe("foo bar baz");
  });

  test("handles conditional classes", () => {
    const isActive = true;
    const isDisabled = false;
    const result = cn("base", isActive && "active", isDisabled && "disabled");
    expect(result).toBe("base active");
  });

  test("merges conflicting Tailwind classes correctly", () => {
    const result = cn("px-2 py-1", "px-4");
    // tailwind-merge should keep px-4 and remove px-2
    expect(result).toContain("px-4");
    expect(result).not.toContain("px-2");
  });

  test("handles undefined and null values", () => {
    const result = cn("foo", undefined, null, "bar");
    expect(result).toBe("foo bar");
  });

  test("handles empty strings", () => {
    const result = cn("foo", "", "bar");
    expect(result).toBe("foo bar");
  });

  test("handles arrays of classes", () => {
    const result = cn(["foo", "bar"], "baz");
    expect(result).toBe("foo bar baz");
  });

  test("handles objects with boolean values", () => {
    const result = cn({
      foo: true,
      bar: false,
      baz: true,
    });
    expect(result).toBe("foo baz");
  });

  test("combines all input types", () => {
    const result = cn(
      "base",
      ["array1", "array2"],
      {
        conditional: true,
        skipped: false,
      },
      "string",
      undefined,
      null,
    );
    expect(result).toContain("base");
    expect(result).toContain("array1");
    expect(result).toContain("array2");
    expect(result).toContain("conditional");
    expect(result).toContain("string");
    expect(result).not.toContain("skipped");
  });
});
