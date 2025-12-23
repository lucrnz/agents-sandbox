/// <reference lib="dom" />

import { test, expect, describe, mock } from "bun:test";
import { render } from "@testing-library/react";
import { Button } from "./button";

describe("Button component", () => {
  test("renders with default variant and size", () => {
    const { getByRole } = render(<Button>Click me</Button>);
    const button = getByRole("button");
    expect(button).toHaveTextContent("Click me");
    expect(button).toBeInTheDocument();
  });

  test("renders with different variants", () => {
    const { rerender, getByRole } = render(<Button variant="destructive">Delete</Button>);
    let button = getByRole("button");
    expect(button).toHaveTextContent("Delete");

    rerender(<Button variant="outline">Outline</Button>);
    button = getByRole("button");
    expect(button).toHaveTextContent("Outline");

    rerender(<Button variant="secondary">Secondary</Button>);
    button = getByRole("button");
    expect(button).toHaveTextContent("Secondary");

    rerender(<Button variant="ghost">Ghost</Button>);
    button = getByRole("button");
    expect(button).toHaveTextContent("Ghost");

    rerender(<Button variant="link">Link</Button>);
    button = getByRole("button");
    expect(button).toHaveTextContent("Link");
  });

  test("renders with different sizes", () => {
    const { rerender, getByRole } = render(<Button size="sm">Small</Button>);
    let button = getByRole("button");
    expect(button).toHaveTextContent("Small");

    rerender(<Button size="lg">Large</Button>);
    button = getByRole("button");
    expect(button).toHaveTextContent("Large");

    rerender(<Button size="icon">Icon</Button>);
    button = getByRole("button");
    expect(button).toHaveTextContent("Icon");
  });

  test("calls onClick handler when clicked", async () => {
    const handleClick = mock(() => {});
    const { getByRole } = render(<Button onClick={handleClick}>Click me</Button>);

    const button = getByRole("button");
    await button.click();

    expect(handleClick).toHaveBeenCalledTimes(1);
  });

  test("applies custom className", () => {
    const { getByRole } = render(<Button className="custom-class">Button</Button>);
    const button = getByRole("button");
    expect(button).toHaveClass("custom-class");
  });

  test("is disabled when disabled prop is true", () => {
    const { getByRole } = render(<Button disabled>Disabled</Button>);
    const button = getByRole("button");
    expect(button).toBeDisabled();
  });

  test("does not call onClick when disabled", async () => {
    const handleClick = mock(() => {});
    const { getByRole } = render(
      <Button disabled onClick={handleClick}>
        Disabled
      </Button>,
    );

    const button = getByRole("button");
    await button.click();

    expect(handleClick).not.toHaveBeenCalled();
  });

  test("renders as child component when asChild is true", () => {
    const { getByRole } = render(
      <Button asChild>
        <a href="/test">Link Button</a>
      </Button>,
    );

    const link = getByRole("link");
    expect(link).toHaveTextContent("Link Button");
    expect(link).toHaveAttribute("href", "/test");
  });

  test("passes through additional props", () => {
    const { getByRole } = render(
      <Button data-testid="custom-button" aria-label="Custom button" type="submit">
        Submit
      </Button>,
    );

    const button = getByRole("button");
    expect(button).toHaveAttribute("data-testid", "custom-button");
    expect(button).toHaveAttribute("aria-label", "Custom button");
    expect(button).toHaveAttribute("type", "submit");
  });

  test("combines variant, size, and className correctly", () => {
    const { getByRole } = render(
      <Button variant="outline" size="lg" className="extra-class">
        Combined
      </Button>,
    );

    const button = getByRole("button");
    expect(button).toHaveTextContent("Combined");
    expect(button).toHaveClass("extra-class");
  });
});
