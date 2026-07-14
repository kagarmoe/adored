// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { EmptyState } from "./EmptyState";

it("keeps long empty-state CTA labels off phone buttons when a mobile label is provided", () => {
  render(
    <EmptyState
      heading="Nothing here yet"
      action={{
        label: "Begin a collection",
        mobileLabel: "Begin",
        href: "/collections/new",
      }}
    />,
  );

  expect(screen.getByText("Begin")).toHaveClass("sm:hidden");
  expect(screen.getByText("Begin a collection")).toHaveClass("hidden", "sm:inline");
  expect(screen.getByRole("link", { name: /begin/i })).toHaveClass("w-full", "sm:w-auto");
});
