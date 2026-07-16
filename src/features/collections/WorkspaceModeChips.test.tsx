// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { WorkspaceModeChips } from "./WorkspaceModeChips";

const BASE = "/collections/summer-bags";

describe("WorkspaceModeChips", () => {
  it("renders three chips as links pointing at Build/Sort/Decide surfaces", () => {
    render(<WorkspaceModeChips base={BASE} activeMode="build" />);
    expect(screen.getByRole("link", { name: "Build" })).toHaveAttribute("href", BASE);
    expect(screen.getByRole("link", { name: "Sort" })).toHaveAttribute("href", `${BASE}/sort`);
    expect(screen.getByRole("link", { name: "Decide" })).toHaveAttribute("href", `${BASE}/results`);
  });

  it("marks the active mode with aria-current=page and no other chip", () => {
    render(<WorkspaceModeChips base={BASE} activeMode="sort" />);
    expect(screen.getByRole("link", { name: "Sort" })).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "Build" })).not.toHaveAttribute("aria-current");
    expect(screen.getByRole("link", { name: "Decide" })).not.toHaveAttribute("aria-current");
  });

  it("activeExact=false marks the active section, not a false current page", () => {
    // On Pool/Items the Build chip links to the workspace root, so
    // aria-current="page" would be a lie; "true" means current section.
    render(<WorkspaceModeChips base={BASE} activeMode="build" activeExact={false} />);
    expect(screen.getByRole("link", { name: "Build" })).toHaveAttribute("aria-current", "true");
    expect(screen.getByRole("link", { name: "Sort" })).not.toHaveAttribute("aria-current");
  });

  it("uses the 44px (h-11) touch-target size on every chip", () => {
    render(<WorkspaceModeChips base={BASE} activeMode="build" />);
    for (const name of ["Build", "Sort", "Decide"]) {
      expect(screen.getByRole("link", { name }).className).toContain("h-11");
    }
  });

  it("spends ZERO bg-primary — chips are the navigation register, not the dominant action", () => {
    const { container } = render(<WorkspaceModeChips base={BASE} activeMode="build" />);
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(0);
  });

  it("exposes the Workspace mode nav landmark", () => {
    render(<WorkspaceModeChips base={BASE} activeMode="decide" />);
    expect(screen.getByRole("navigation", { name: "Workspace mode" })).toBeInTheDocument();
  });
});
