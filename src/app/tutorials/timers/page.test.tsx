// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import TimersTutorialPage from "./page";

describe("/tutorials/timers", () => {
  it("names the Round timers tutorial and its scope", () => {
    render(<TimersTutorialPage />);

    expect(screen.getByRole("heading", { name: "Round timers" })).toBeInTheDocument();
    expect(screen.getByText(/shape a round, not to rush you/i)).toBeInTheDocument();
    expect(screen.getByText(/soft edge/i)).toBeInTheDocument();
    expect(screen.getByText(/round can stop cleanly/i)).toBeInTheDocument();
    expect(screen.getByText(/break preserves the work/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Choose a round length" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Use no timer when that feels better" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Let expiry be a pause, not a failure" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Take a break" })).toBeInTheDocument();
    expect(screen.queryByText("Tutorial coming soon")).not.toBeInTheDocument();
  });
});
