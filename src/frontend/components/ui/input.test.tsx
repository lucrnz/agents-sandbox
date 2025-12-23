/// <reference lib="dom" />

import { test, expect, describe, mock } from "bun:test";
import { render, fireEvent } from "@testing-library/react";
import { Input } from "./input";

describe("Input component", () => {
  test("renders correctly", () => {
    const { getByRole } = render(<Input placeholder="Enter text" />);
    const input = getByRole("textbox");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("placeholder", "Enter text");
  });

  test("accepts value and placeholder", () => {
    const { getByRole } = render(<Input defaultValue="Hello" placeholder="Enter text" />);
    const input = getByRole("textbox") as HTMLInputElement;
    expect(input.value).toBe("Hello");
    expect(input.placeholder).toBe("Enter text");
  });

  test("can be disabled", () => {
    const { getByRole } = render(<Input disabled />);
    const input = getByRole("textbox");
    expect(input).toBeDisabled();
  });

  test("applies custom className", () => {
    const { getByRole } = render(<Input className="custom-input" />);
    const input = getByRole("textbox");
    expect(input).toHaveClass("custom-input");
  });
});
