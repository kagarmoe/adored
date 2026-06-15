// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard } from "./ItemCard";

const item = (over: any) => ({ id: "i", collectionId: "c", number: 7, name: null, brand: null, status: "active", ...over });

describe("ItemCard nameless cue", () => {
  it("shows a calm 'Add a name' cue for a nameless item", () => {
    render(<ItemCard item={item({ name: null }) as any} collectionId="c" />);
    expect(screen.getByText(/add a name/i)).toBeInTheDocument();
  });
  it("shows the brand (not the cue) for a named item", () => {
    render(<ItemCard item={item({ name: "Bag", brand: "Acme" }) as any} collectionId="c" />);
    expect(screen.queryByText(/add a name/i)).not.toBeInTheDocument();
    expect(screen.getByText("Acme")).toBeInTheDocument();
  });
  it("browser-loads authenticated hero image URLs directly", () => {
    render(
      <ItemCard
        item={item({ name: "Bag" }) as any}
        collectionId="c"
        heroPhotoUrl="/api/collections/c/items/i/photos/p/file"
      />,
    );
    expect(screen.getByRole("img", { name: "Bag" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/i/photos/p/file",
    );
  });
});
