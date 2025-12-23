/// <reference lib="dom" />

import { test, expect, describe, mock } from "bun:test";
import { render, act } from "@testing-library/react";
import { Checkbox } from "./checkbox";

describe("Checkbox component", () => {
  test("renders correctly", () => {
    const { getByRole } = render(<Checkbox id="test-checkbox" />);
    const checkbox = getByRole("checkbox");
    expect(checkbox).toBeInTheDocument();
  });

  test("applies custom className", () => {
    const { getByRole } = render(<Checkbox className="custom-class" />);
    const checkbox = getByRole("checkbox");
    expect(checkbox).toHaveClass("custom-class");
  });

  test("can be checked and unchecked", async () => {
    const onCheckedChange = mock((checked: boolean | "indeterminate") => {});
    const { getByRole } = render(<Checkbox onCheckedChange={onCheckedChange} />);
    const checkbox = getByRole("checkbox");

    expect(checkbox).toHaveAttribute("data-state", "unchecked");

    await act(async () => {
      await checkbox.click();
    });
    expect(onCheckedChange).toHaveBeenCalledWith(true);
    expect(checkbox).toHaveAttribute("data-state", "checked");

    await act(async () => {
      await checkbox.click();
    });
    expect(onCheckedChange).toHaveBeenCalledWith(false);
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });

  test("is disabled when disabled prop is true", () => {
    const { getByRole } = render(<Checkbox disabled />);
    const checkbox = getByRole("checkbox");
    expect(checkbox).toBeDisabled();
    expect(checkbox).toHaveAttribute("disabled");
  });

  test("does not change state when disabled and clicked", async () => {
    const onCheckedChange = mock(() => {});
    const { getByRole } = render(<Checkbox disabled onCheckedChange={onCheckedChange} />);
    const checkbox = getByRole("checkbox");

    await act(async () => {
      await checkbox.click();
    });
    expect(onCheckedChange).not.toHaveBeenCalled();
    expect(checkbox).toHaveAttribute("data-state", "unchecked");
  });

  test("forwards additional props", () => {
    const { getByTestId } = render(<Checkbox data-testid="test-checkbox" aria-label="Label" />);
    const checkbox = getByTestId("test-checkbox");
    expect(checkbox).toHaveAttribute("aria-label", "Label");
  });

  test("renders indicator when checked", () => {
    const { container } = render(<Checkbox checked />);
    const indicator = container.querySelector('[data-slot="checkbox-indicator"]');
    // Radix indicator only renders when checked
    expect(indicator).toBeInTheDocument();
  });
});
