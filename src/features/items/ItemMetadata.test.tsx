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
  it("shows an affirming add-prompt + CTA when empty (not 'No details added yet')", () => {
    render(<ItemMetadata item={empty as any} editHref="/collections/c/items/1/edit" />);
    expect(screen.queryByText(/no details added yet/i)).not.toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /tell its story|add (its|the) (details|story)/i });
    expect(cta).toHaveAttribute("href", "/collections/c/items/1/edit");
  });

  it("renders the fields when metadata is present", () => {
    render(<ItemMetadata item={{ ...empty, brand: "Acme", notes: "loved" } as any} editHref="/x" />);
    expect(screen.getByText("Acme")).toBeInTheDocument();
    expect(screen.getByText("loved")).toBeInTheDocument();
    expect(screen.queryByText(/no details added yet/i)).not.toBeInTheDocument();
  });
});
