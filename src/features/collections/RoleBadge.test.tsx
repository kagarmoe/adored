// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { RoleBadge } from "./RoleBadge";

it("renders an Owner badge on the role token, not a tier token", () => {
  const { container } = render(<RoleBadge role="owner" />);
  expect(screen.getByText("Owner")).toBeInTheDocument();
  // identity, not the value-ramp: must use the role variant, never tier-* tokens
  expect(container.querySelector(".bg-accent-periwinkle")).not.toBeNull();
  expect(container.querySelector(".bg-tier-like, .bg-tier-maybe")).toBeNull();
});

it("treats any non-owner role as Curator", () => {
  render(<RoleBadge role="curator" />);
  expect(screen.getByText("Curator")).toBeInTheDocument();
});
