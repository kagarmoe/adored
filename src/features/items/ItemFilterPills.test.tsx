// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ItemFilterPills } from "./ItemFilterPills";
describe("ItemFilterPills", () => {
  it("marks the selected pill with aria-current and a check glyph, not colour alone; links keep q", () => {
    render(<ItemFilterPills base="/collections/bags" view="archived" q="tote" />);
    const archived = screen.getByRole("link", { name: "Archived" });
    expect(archived).toHaveAttribute("aria-current", "page");
    expect(archived.querySelector("svg")).not.toBeNull();
    const all = screen.getByRole("link", { name: "All" });
    expect(all).not.toHaveAttribute("aria-current");
    expect(all.querySelector("svg")).toBeNull();
    expect(all).toHaveAttribute("href", "/collections/bags/items?q=tote");
    expect(screen.getByRole("link", { name: "Waiting for a name" })).toHaveAttribute("href", "/collections/bags/items?unnamed=1&q=tote");
  });
});
