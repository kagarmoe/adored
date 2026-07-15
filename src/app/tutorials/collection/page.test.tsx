// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import CollectionTutorialPage from "./page";

describe("/tutorials/collection", () => {
  it("names the Start a collection tutorial and its scope", () => {
    render(<CollectionTutorialPage />);

    expect(screen.getByRole("heading", { name: "Start a collection" })).toBeInTheDocument();
    expect(screen.getByText(/photos can come first/i)).toBeInTheDocument();
    expect(screen.getByText(/collection pool/i)).toBeInTheDocument();
    expect(screen.getByText(/group photos into items/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create the collection" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Add photos first" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Make items when you are ready" })).toBeInTheDocument();
    expect(screen.queryByText("Tutorial coming soon")).not.toBeInTheDocument();
  });
});
