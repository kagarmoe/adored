// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FilterPills } from "./FilterPills";

describe("FilterPills", () => {
  it("marks the current pill with aria-current and a check glyph, never colour alone", () => {
    render(
      <FilterPills
        label="Filter things"
        pills={[
          { label: "All", href: "/things", current: false },
          { label: "Archived", href: "/things?status=archived", current: true },
        ]}
      />,
    );
    expect(screen.getByRole("navigation", { name: "Filter things" })).toBeInTheDocument();
    const archived = screen.getByRole("link", { name: "Archived" });
    expect(archived).toHaveAttribute("aria-current", "page");
    expect(archived.querySelector("svg")).not.toBeNull();
    const all = screen.getByRole("link", { name: "All" });
    expect(all).not.toHaveAttribute("aria-current");
    expect(all.querySelector("svg")).toBeNull();
    expect(all).toHaveAttribute("href", "/things");
  });
});
