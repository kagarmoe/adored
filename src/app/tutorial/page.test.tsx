// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// The walkthrough shell uses next/navigation's useRouter; the page guard uses
// notFound. Mock both so we can assert the dev-only behavior without a router.
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  notFound: () => notFound(),
}));

import TutorialPage from "./page";

afterEach(() => {
  vi.unstubAllEnvs();
  notFound.mockClear();
});

describe("dev-only /tutorial preview route", () => {
  it("renders the shared walkthrough (Purpose beat) outside production", () => {
    vi.stubEnv("NODE_ENV", "development");
    render(<TutorialPage />);
    // Same first beat the real /welcome route shows — proves shell reuse.
    expect(
      screen.getByRole("heading", { name: "Rediscover what you love." }),
    ).toBeInTheDocument();
    expect(notFound).not.toHaveBeenCalled();
  });

  it("calls notFound() (404s) in production so it never ships as a real route", () => {
    vi.stubEnv("NODE_ENV", "production");
    // notFound throws NEXT_NOT_FOUND, halting render — mirror Next's behavior.
    expect(() => render(<TutorialPage />)).toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalled();
  });
});
