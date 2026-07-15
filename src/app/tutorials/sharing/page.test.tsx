// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import SharingTutorialPage from "./page";

describe("/tutorials/sharing", () => {
  it("names the Invite and share tutorial and its scope", () => {
    render(<SharingTutorialPage />);

    expect(screen.getByRole("heading", { name: "Invite and share" })).toBeInTheDocument();
    expect(screen.getByText(/invite gives a person access to a collection/i)).toBeInTheDocument();
    expect(screen.getByText(/share creates a read-only link to a saved result/i)).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Open People" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Invite a collaborator" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Save a result" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Create a public link" })).toBeInTheDocument();
    expect(screen.queryByText("Tutorial coming soon")).not.toBeInTheDocument();
  });
});
