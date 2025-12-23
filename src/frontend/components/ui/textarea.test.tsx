/// <reference lib="dom" />

import { test, expect, describe, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { Textarea } from "./textarea";

describe("Textarea component", () => {
  test("renders correctly", () => {
    const { getByRole } = render(<Textarea placeholder="Enter text" />);
    const textarea = getByRole("textbox");
    expect(textarea).toBeInTheDocument();
    expect(textarea).toHaveAttribute("placeholder", "Enter text");
  });

  test("accepts value and placeholder", () => {
    const { getByRole } = render(<Textarea defaultValue="Hello" placeholder="Enter text" />);
    const textarea = getByRole("textbox") as HTMLTextAreaElement;
    expect(textarea.value).toBe("Hello");
    expect(textarea.placeholder).toBe("Enter text");
  });

  test("can be disabled", () => {
    const { getByRole } = render(<Textarea disabled />);
    const textarea = getByRole("textbox");
    expect(textarea).toBeDisabled();
  });

  test("applies custom className", () => {
    const { getByRole } = render(<Textarea className="custom-textarea" />);
    const textarea = getByRole("textbox");
    expect(textarea).toHaveClass("custom-textarea");
  });
});
