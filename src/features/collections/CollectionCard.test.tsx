// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollectionCard } from "./CollectionCard";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

const collection = {
  id: "c",
  ownerId: "u",
  name: "Favorites",
  description: null,
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
};

describe("CollectionCard images", () => {
  it("browser-loads authenticated cover image URLs directly", () => {
    render(
      <CollectionCard
        collection={collection as any}
        coverPhotoUrl="/api/collections/c/items/i/photos/p/file"
      />,
    );
    expect(screen.getByRole("img", { name: "Favorites" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/i/photos/p/file",
    );
  });

  it("renders a 'View photo' control AND the navigating link (valid DOM) when viewerPhoto is set", () => {
    render(
      <CollectionCard
        collection={collection as any}
        coverPhotoUrl="/x"
        viewerPhoto={{ id: "p", itemId: "i", collectionId: "c", rotation: 0, updatedAt: new Date().toISOString() }}
      />,
    );
    expect(screen.getByRole("button", { name: /view photo/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Favorites" })).toBeInTheDocument();
  });

  it("renders no 'View photo' control when viewerPhoto is absent", () => {
    render(<CollectionCard collection={collection as any} coverPhotoUrl="/x" />);
    expect(screen.queryByRole("button", { name: /view photo/i })).not.toBeInTheDocument();
  });
});
