/// <reference lib="dom" />

import { test, expect, describe } from "bun:test";
import { render } from "@testing-library/react";
import { Label } from "./label";

describe("Label component", () => {
  test("renders correctly with text", () => {
    const { getByText } = render(<Label>Username</Label>);
    expect(getByText("Username")).toBeInTheDocument();
  });

  test("applies custom className", () => {
    const { getByText } = render(<Label className="custom-label">Username</Label>);
    expect(getByText("Username")).toHaveClass("custom-label");
  });

  test("associates with input via htmlFor", () => {
    const { getByText } = render(
      <>
        <Label htmlFor="test-input">Label</Label>
        <input id="test-input" />
      </>,
    );
    const label = getByText("Label");
    expect(label).toHaveAttribute("for", "test-input");
  });
});
