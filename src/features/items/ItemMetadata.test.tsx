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

  it("renders a single imperial size chip with all three dims + weight", () => {
    render(
      <ItemMetadata
        item={{ ...empty, height: "9", width: "11", depth: "4", weight: "1.2", unit: "imperial" } as any}
        editHref="/x"
      />,
    );
    expect(screen.getByText("9 × 11 × 4 in · 1.2 lb")).toBeInTheDocument();
  });

  it("labels metric dimensions with cm/kg", () => {
    render(
      <ItemMetadata
        item={{ ...empty, height: "20", width: "28", depth: "10", weight: "0.5", unit: "metric" } as any}
        editHref="/x"
      />,
    );
    expect(screen.getByText("20 × 28 × 10 cm · 0.5 kg")).toBeInTheDocument();
  });

  it("includes only the parts that are present", () => {
    render(
      <ItemMetadata
        item={{ ...empty, height: "9", width: "11", unit: "imperial" } as any}
        editHref="/x"
      />,
    );
    // No depth, no weight — chip is just the two dims + length unit.
    expect(screen.getByText("9 × 11 in")).toBeInTheDocument();
  });

  it("shows a size chip (not the empty state) when ONLY dimensions are present", () => {
    render(
      <ItemMetadata item={{ ...empty, weight: "1.2", unit: "imperial" } as any} editHref="/x" />,
    );
    expect(screen.getByText("1.2 lb")).toBeInTheDocument();
    expect(screen.queryByText(/every piece has a story/i)).not.toBeInTheDocument();
  });

  it("renders no size chip when no dimensions are present", () => {
    render(<ItemMetadata item={{ ...empty, brand: "Acme" } as any} editHref="/x" />);
    expect(screen.queryByText(/×/)).not.toBeInTheDocument();
    expect(screen.queryByText(/lb$/)).not.toBeInTheDocument();
  });
});
