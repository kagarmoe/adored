// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import SortTutorialPage from "./page";

describe("/tutorials/sort", () => {
  it("renders the completed sort walkthrough", () => {
    render(<SortTutorialPage />);

    expect(
      screen.getByRole("heading", { name: "Rediscover what you love." }),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show me how" })).toBeInTheDocument();
  });
});
