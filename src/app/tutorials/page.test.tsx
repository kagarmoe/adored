// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import TutorialsPage from "./page";

describe("/tutorials", () => {
  it("lists the four tutorial routes with the requested wording", () => {
    render(<TutorialsPage />);

    expect(screen.getByRole("heading", { name: "Tutorials" })).toBeInTheDocument();
    expect(
      screen.getByText("Revisit any part of Adored when you want a quick refresher."),
    ).toBeInTheDocument();

    const links = [
      ["Start a collection", "/tutorials/collection"],
      ["Sort and refine", "/tutorials/sort"],
      ["Invite and share", "/tutorials/sharing"],
      ["Round timers", "/tutorials/timers"],
    ] as const;

    for (const [label, href] of links) {
      expect(screen.getByRole("link", { name: new RegExp(label) })).toHaveAttribute("href", href);
    }
  });
});
