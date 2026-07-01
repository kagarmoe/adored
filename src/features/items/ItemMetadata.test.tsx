// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemMetadata } from "./ItemMetadata";

const empty = {
  id: "i",
  brand: null,
  style: null,
  color: null,
  material: null,
  category: null,
  notes: null,
};

describe("ItemMetadata", () => {
  it("shows an affirming add-prompt + an 'Add details' CTA when empty (not 'No details added yet', not 'Tell its story')", () => {
    render(<ItemMetadata item={empty as any} editHref="/collections/c/items/1/edit" />);
    expect(screen.queryByText(/no details added yet/i)).not.toBeInTheDocument();
    // The CTA invites adding metadata — it is NOT the distinct Story feature.
    expect(screen.queryByRole("link", { name: /tell its story/i })).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: "Add details" });
    expect(cta).toHaveAttribute("href", "/collections/c/items/1/edit");
    // Affirming framing line stays.
    expect(screen.getByText(/every piece has a story/i)).toBeInTheDocument();
  });

  it("renders the fields as chips when metadata is present", () => {
    render(<ItemMetadata item={{ ...empty, brand: "Acme", notes: "loved" } as any} editHref="/x" />);
    // Brand renders as a chip: "Brand: Acme".
    expect(screen.getByText(/Acme/)).toBeInTheDocument();
    expect(screen.getByText("loved")).toBeInTheDocument();
    expect(screen.queryByText(/no details added yet/i)).not.toBeInTheDocument();
  });
});
