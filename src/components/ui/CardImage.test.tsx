// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardImage } from "./CardImage";

describe("CardImage", () => {
  it("renders the photo when src is provided", () => {
    render(<CardImage src="/api/collections/c/items/i/photos/p/file" alt="Bag" fallback={<span>B</span>} />);
    expect(screen.getByRole("img", { name: "Bag" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/i/photos/p/file",
    );
  });

  it("renders the fallback when there is no src", () => {
    render(<CardImage alt="Bag" fallback={<span data-testid="fb">B</span>} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("fb")).toBeInTheDocument();
  });

  it("falls back to the calm initial when the photo fails to load (no broken glyph)", () => {
    render(<CardImage src="/api/collections/c/items/i/photos/p/file" alt="Bag" fallback={<span data-testid="fb">B</span>} />);
    fireEvent.error(screen.getByRole("img", { name: "Bag" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("fb")).toBeInTheDocument();
  });
});
