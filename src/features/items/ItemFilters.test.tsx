// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemFilters } from "./ItemFilters";

function hrefOf(name: RegExp) {
  return screen.getByRole("link", { name }).getAttribute("href");
}

describe("ItemFilters waiting-for-a-name toggle", () => {
  it("renders the toggle; off by default links to ?unnamed=1 preserving status", () => {
    render(<ItemFilters activeFilter="active" unnamed={false} collectionId="c" />);
    expect(hrefOf(/waiting for a name/i)).toBe("/collections/c/items?status=active&unnamed=1");
  });
  it("when on, the toggle links back to just the status (drops unnamed)", () => {
    render(<ItemFilters activeFilter="active" unnamed={true} collectionId="c" />);
    expect(hrefOf(/waiting for a name/i)).toBe("/collections/c/items?status=active");
  });
  it("status links preserve the unnamed flag", () => {
    render(<ItemFilters activeFilter="all" unnamed={true} collectionId="c" />);
    expect(hrefOf(/^archived$/i)).toBe("/collections/c/items?status=archived&unnamed=1");
  });
});
