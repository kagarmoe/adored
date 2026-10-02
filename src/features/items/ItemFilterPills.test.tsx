// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemFilterPills } from "./ItemFilterPills";

describe("ItemFilterPills", () => {
  it("links each view under the given path and keeps the query", () => {
    render(<ItemFilterPills path="/collections/bags" view="archived" q="tote" />);
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("href", "/collections/bags?q=tote");
    expect(screen.getByRole("link", { name: "Waiting for a name" })).toHaveAttribute(
      "href",
      "/collections/bags?unnamed=1&q=tote",
    );
  });
});
