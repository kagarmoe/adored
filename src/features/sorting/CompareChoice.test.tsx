// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { CompareChoice } from "./CompareChoice";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

const item = (id: string, name: string) => ({
  id,
  collectionId: "c",
  number: id === "a" ? 1 : 2,
  name,
  brand: null,
  status: "active",
});

describe("CompareChoice images", () => {
  it("browser-loads authenticated hero image URLs directly", () => {
    render(
      <CompareChoice
        sessionId="s"
        itemA={item("a", "Bag A") as any}
        itemB={item("b", "Bag B") as any}
        heroA="/api/collections/c/items/a/photos/pa/file"
        heroB="/api/collections/c/items/b/photos/pb/file"
        comparisonsMade={0}
      />,
    );
    expect(screen.getByRole("img", { name: "Bag A" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/a/photos/pa/file",
    );
    expect(screen.getByRole("img", { name: "Bag B" })).toHaveAttribute(
      "src",
      "/api/collections/c/items/b/photos/pb/file",
    );
  });
});
