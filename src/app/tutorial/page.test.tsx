import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});
vi.mock("next/navigation", () => ({
  redirect: (href: string) => redirect(href),
}));

import TutorialPage from "./page";

describe("public /tutorial route", () => {
  it("redirects old links to the sort tutorial", () => {
    expect(() => TutorialPage()).toThrow("redirect:/tutorials/sort");
    expect(redirect).toHaveBeenCalledWith("/tutorials/sort");
  });
});
