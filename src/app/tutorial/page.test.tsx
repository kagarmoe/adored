// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The walkthrough shell uses next/navigation's useRouter. Mock it so the route
// can render without a Next runtime.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import TutorialPage from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("public /tutorial route", () => {
  it("renders the shared walkthrough (Purpose beat)", () => {
    render(<TutorialPage />);
    // Same first beat the real /welcome route shows — proves shell reuse.
    expect(
      screen.getByRole("heading", { name: "Rediscover what you love." }),
    ).toBeInTheDocument();
  });

  it("renders in production so the public tutorial URL is reachable", () => {
    vi.stubEnv("NODE_ENV", "production");
    render(<TutorialPage />);
    expect(
      screen.getByRole("heading", { name: "Rediscover what you love." }),
    ).toBeInTheDocument();
  });
});
