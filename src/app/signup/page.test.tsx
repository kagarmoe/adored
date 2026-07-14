import { describe, expect, it, vi } from "vitest";

const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect,
}));

import SignupPage from "./page";

describe("SignupPage", () => {
  it("redirects to /login because Adored supports Google login only", () => {
    SignupPage();

    expect(redirect).toHaveBeenCalledWith("/login");
  });
});
