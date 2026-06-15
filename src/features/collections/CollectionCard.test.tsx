// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { CollectionCard } from "./CollectionCard";

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
});
