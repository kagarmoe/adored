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

describe("CollectionCard pool cue", () => {
  it("shows a sentence-case 'Photos waiting' cue when hasPooledPhotos is true", () => {
    render(<CollectionCard collection={collection as any} hasPooledPhotos />);
    // perceivable to AT as text (not color-only): the literal label is in the DOM
    expect(screen.getByText("Photos waiting")).toBeInTheDocument();
  });

  it("does not show the cue when hasPooledPhotos is false or omitted", () => {
    const { rerender } = render(
      <CollectionCard collection={collection as any} hasPooledPhotos={false} />,
    );
    expect(screen.queryByText(/photos waiting/i)).not.toBeInTheDocument();

    rerender(<CollectionCard collection={collection as any} />);
    expect(screen.queryByText(/photos waiting/i)).not.toBeInTheDocument();
  });

  it("keeps the card's single navigating link — the cue is informational, not a competing action", () => {
    render(<CollectionCard collection={collection as any} hasPooledPhotos />);
    expect(screen.getByRole("link", { name: "Favorites" })).toBeInTheDocument();
    // the cue must not introduce a second link/button competing with navigation
    expect(screen.getAllByRole("link")).toHaveLength(1);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});
