// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemCard } from "./ItemCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const item = (over: any) => ({ id: "i", collectionId: "c", number: 7, name: null, brand: null, status: "active", ...over });
const viewerPhoto = { id: "p", itemId: "i", collectionId: "c", rotation: 0, updatedAt: new Date().toISOString() };

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

  it("renders a 'View photo' control AND the navigating link (valid DOM) when viewerPhoto is set", () => {
    render(
      <ItemCard item={item({ name: "Bag" }) as any} collectionId="c" heroPhotoUrl="/x" viewerPhoto={viewerPhoto} />,
    );
    expect(screen.getByRole("button", { name: /view photo/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Bag" })).toBeInTheDocument();
  });

  it("renders no 'View photo' control when viewerPhoto is absent", () => {
    render(<ItemCard item={item({ name: "Bag" }) as any} collectionId="c" heroPhotoUrl="/x" />);
    expect(screen.queryByRole("button", { name: /view photo/i })).not.toBeInTheDocument();
  });
});
