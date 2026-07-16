// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { Breadcrumbs } from "./Breadcrumbs";

const deep = [
  { label: "Collections", href: "/collections" },
  { label: "Spring Bags", href: "/collections/spring-bags" },
  { label: "Items", href: "/collections/spring-bags/items" },
  { label: "Red Clutch" },
];

// jsdom applies no media queries, so both the tablet arrow and the phone back
// link are in the DOM; we assert each one's semantics directly.
describe("Breadcrumbs back arrow", () => {
  it("renders the tablet arrow as pointer-only, targeting the parent crumb", () => {
    const { container } = render(<Breadcrumbs items={deep} />);
    const arrow = container.querySelector('a[aria-hidden="true"]');
    expect(arrow).toHaveAttribute("href", "/collections/spring-bags/items");
    expect(arrow).toHaveAttribute("tabindex", "-1");
  });

  it("names the breadcrumb landmark and keeps the scroll region off the nav", () => {
    render(<Breadcrumbs items={deep} />);
    const nav = screen.getByRole("navigation", { name: "Breadcrumb" });
    // overflow on the nav itself would clip the 44px back-arrow hit area
    expect(nav.className).not.toMatch(/overflow/);
  });

  it("renders the phone back link with an accessible 'Back to {parent}' name", () => {
    render(<Breadcrumbs items={deep} />);
    const back = screen.getByRole("link", { name: "Back to Items" });
    expect(back).toHaveAttribute("href", "/collections/spring-bags/items");
  });

  it("keeps the full trail's crumb links intact", () => {
    render(<Breadcrumbs items={deep} />);
    expect(screen.getByRole("link", { name: "Items" })).toHaveAttribute(
      "href",
      "/collections/spring-bags/items",
    );
    expect(screen.getByText("Red Clutch")).toBeInTheDocument();
  });

  it("renders no arrow on a 1-crumb page", () => {
    const { container } = render(<Breadcrumbs items={[{ label: "Collections" }]} />);
    expect(container.querySelector("a")).toBeNull();
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.getByText("Collections")).toBeInTheDocument();
  });

  it("renders no arrow when the parent crumb has no href", () => {
    const { container } = render(
      <Breadcrumbs items={[{ label: "Somewhere" }, { label: "Leaf" }]} />,
    );
    expect(container.querySelector("svg")).toBeNull();
    expect(screen.queryByRole("link", { name: /back to/i })).toBeNull();
  });
});
