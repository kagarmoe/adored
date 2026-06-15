// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MostLovedHero } from "./MostLovedHero";

const item = {
  id: "i",
  collectionId: "c",
  number: 1,
  name: "Bag",
  brand: null,
  status: "active",
};

describe("MostLovedHero images", () => {
  it("browser-loads authenticated hero image URLs directly", () => {
    render(
      <MostLovedHero
        item={item as any}
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
