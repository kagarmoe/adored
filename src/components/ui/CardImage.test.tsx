// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CardImage } from "./CardImage";

const A = "/api/photo-files/a?collectionId=c&itemId=i1";
const B = "/api/photo-files/b?collectionId=c&itemId=i2";

describe("CardImage", () => {
  it("renders the photo when src is provided", () => {
    render(<CardImage src={A} alt="Bag" fallback={<span>B</span>} />);
    expect(screen.getByRole("img", { name: "Bag" })).toHaveAttribute("src", A);
  });

  it("renders the fallback when there is no src", () => {
    render(<CardImage alt="Bag" fallback={<span data-testid="fb">B</span>} />);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("fb")).toBeInTheDocument();
  });

  it("retries a photo once before falling back, so one dropped request on a phone is not a lost photo", () => {
    render(<CardImage src={A} alt="Bag" fallback={<span data-testid="fb">B</span>} />);
    fireEvent.error(screen.getByRole("img", { name: "Bag" }));
    // First failure: a fresh request for the same photo, not the initial.
    expect(screen.getByRole("img", { name: "Bag" })).toHaveAttribute("src", A);
    expect(screen.queryByTestId("fb")).not.toBeInTheDocument();
  });

  it("falls back to the calm initial when the photo keeps failing (no broken glyph)", () => {
    render(<CardImage src={A} alt="Bag" fallback={<span data-testid="fb">B</span>} />);
    fireEvent.error(screen.getByRole("img", { name: "Bag" }));
    fireEvent.error(screen.getByRole("img", { name: "Bag" }));
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByTestId("fb")).toBeInTheDocument();
  });

  // purses-d87z: the sort reuses one CardImage slot for every piece (compare keys "a"/"b",
  // one ItemCard in feelings). A failure must belong to its photo, not to the slot.
  it("a failed photo does not blank the next photo shown in the same slot", () => {
    const { rerender } = render(<CardImage src={A} alt="First" fallback={<span data-testid="fb">F</span>} />);
    fireEvent.error(screen.getByRole("img", { name: "First" }));
    fireEvent.error(screen.getByRole("img", { name: "First" }));
    expect(screen.getByTestId("fb")).toBeInTheDocument();

    rerender(<CardImage src={B} alt="Second" fallback={<span data-testid="fb">S</span>} />);
    expect(screen.getByRole("img", { name: "Second" })).toHaveAttribute("src", B);
    expect(screen.queryByTestId("fb")).not.toBeInTheDocument();
  });
});
