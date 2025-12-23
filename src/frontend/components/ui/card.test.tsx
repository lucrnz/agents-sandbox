/// <reference lib="dom" />

import { test, expect, describe } from "bun:test";
import { render } from "@testing-library/react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "./card";

describe("Card component", () => {
  test("renders all card sub-components correctly", () => {
    const { getByText } = render(
      <Card>
        <CardHeader>
          <CardTitle>Card Title</CardTitle>
          <CardDescription>Card Description</CardDescription>
        </CardHeader>
        <CardContent>Card Content</CardContent>
        <CardFooter>Card Footer</CardFooter>
      </Card>,
    );

    expect(getByText("Card Title")).toBeInTheDocument();
    expect(getByText("Card Description")).toBeInTheDocument();
    expect(getByText("Card Content")).toBeInTheDocument();
    expect(getByText("Card Footer")).toBeInTheDocument();
  });

  test("applies custom className to Card", () => {
    const { container } = render(<Card className="custom-card">Content</Card>);
    expect(container.firstChild).toHaveClass("custom-card");
  });

  test("renders data-slots correctly", () => {
    const { getByText } = render(<CardTitle>Title</CardTitle>);
    const title = getByText("Title");
    expect(title).toHaveAttribute("data-slot", "card-title");
  });
});
