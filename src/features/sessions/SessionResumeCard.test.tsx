// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { SessionResumeCard } from "./SessionResumeCard";

describe("SessionResumeCard", () => {
  it("active: 'Keep sorting' heading at the given level, goal as body", () => {
    render(<SessionResumeCard status="active" goal="Find favorites" headingLevel="h3" actions={<button>Go</button>} />);
    const h = screen.getByRole("heading", { name: "Keep sorting" });
    expect(h.tagName).toBe("H3");
    expect(screen.getByText("Find favorites")).toBeInTheDocument();
    expect(screen.queryByText("active")).not.toBeInTheDocument(); // no status Badge
  });

  it("active without a goal: the gentle fallback line", () => {
    render(<SessionResumeCard status="active" goal={null} headingLevel="h2" actions={null} />);
    expect(screen.getByRole("heading", { name: "Keep sorting" }).tagName).toBe("H2");
    expect(screen.getByText("Pick up where you left off — one decision at a time.")).toBeInTheDocument();
  });

  it("paused: paused heading + safe line, no badge", () => {
    render(<SessionResumeCard status="paused" goal="x" headingLevel="h3" actions={null} />);
    expect(screen.getByRole("heading", { name: "Your sort is paused" })).toBeInTheDocument();
    expect(screen.getByText("Your sort is safe — pick up where you left off.")).toBeInTheDocument();
    expect(screen.queryByText(/^paused$/)).not.toBeInTheDocument();
  });

  it("renders the actions slot", () => {
    render(<SessionResumeCard status="active" goal={null} headingLevel="h3" actions={<button>Resume</button>} />);
    expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
  });
});
