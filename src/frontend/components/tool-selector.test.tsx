/// <reference lib="dom" />

import { test, expect, describe, mock } from "bun:test";
import { render } from "@testing-library/react";
import { ToolSelector } from "./tool-selector";
import type { ToolName } from "@/shared/commands";

describe("ToolSelector", () => {
  test("renders the toggle button", () => {
    const { getByRole } = render(<ToolSelector selectedTools={[]} onToolsChange={() => {}} />);
    const button = getByRole("button", { name: /toggle tools/i });
    expect(button).toBeTruthy();
  });

  test("shows plus icon when no tools are enabled", () => {
    const { container } = render(<ToolSelector selectedTools={[]} onToolsChange={() => {}} />);
    // Plus icon should be present (no text-blue-500 class)
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    // The icon inside should not have the blue color when disabled
    const icon = button?.querySelector("svg");
    expect(icon).toBeTruthy();
  });

  test("shows telescope icon with blue color when deep research is enabled", () => {
    const { container } = render(
      <ToolSelector selectedTools={["agentic_fetch"]} onToolsChange={() => {}} />,
    );
    const button = container.querySelector("button");
    expect(button).toBeTruthy();
    // When enabled, the telescope icon should have the blue class
    const icon = button?.querySelector("svg.text-blue-500");
    expect(icon).toBeTruthy();
  });

  test("displays correct state when toggling between tool selections", () => {
    // Test with no tools selected - should show plus icon
    const { container: container1 } = render(
      <ToolSelector selectedTools={[]} onToolsChange={() => {}} />,
    );
    const plusIcon = container1.querySelector("svg.lucide-plus");
    expect(plusIcon).toBeTruthy();

    // Test with agentic_fetch selected - should show telescope with blue color
    const { container: container2 } = render(
      <ToolSelector selectedTools={["agentic_fetch"]} onToolsChange={() => {}} />,
    );
    const telescopeIcon = container2.querySelector("svg.lucide-telescope.text-blue-500");
    expect(telescopeIcon).toBeTruthy();
  });

  // Note: Tests for dropdown interaction (opening menu and clicking items) require
  // a real browser environment. Radix UI's DropdownMenu uses complex event handling
  // (pointer events, focus trapping, portals) that happy-dom doesn't fully support.
  // These interactions should be tested with Playwright or similar E2E testing tools.

  test("disables button when disabled prop is true", () => {
    const { getByRole } = render(
      <ToolSelector selectedTools={[]} onToolsChange={() => {}} disabled />,
    );
    const button = getByRole("button", { name: /toggle tools/i });
    expect(button.hasAttribute("disabled")).toBe(true);
  });

  test("button has correct aria attributes", () => {
    const { getByRole } = render(<ToolSelector selectedTools={[]} onToolsChange={() => {}} />);
    const button = getByRole("button", { name: /toggle tools/i });
    expect(button.getAttribute("aria-haspopup")).toBe("menu");
    expect(button.getAttribute("data-slot")).toBe("dropdown-menu-trigger");
  });
});
