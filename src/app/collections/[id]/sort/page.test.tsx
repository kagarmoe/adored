// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, sessionRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  sessionRepo: { findByCollectionAndCurator: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));

import SortPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags" });
  sessionRepo.findByCollectionAndCurator.mockResolvedValue([
    { id: "sess_zzz", number: 3, curatorId: "u1", goal: "Discover", status: "completed", createdAt: new Date("2026-01-03") },
  ]);
});

describe("SortPage session links", () => {
  it("links sessions by number (never the ULID)", async () => {
    const ui = await SortPage({ params: { id: "summer-bags" } });
    render(ui);
    const links = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(links).toContain("/collections/summer-bags/sort/3");
    expect(links.some((h) => h?.includes("sess_zzz"))).toBe(false);
  });

  it("active-session Resume/Details links use the session number, not the ULID", async () => {
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([
      { id: "sess_active", number: 4, curatorId: "u1", goal: "Discover", status: "active", createdAt: new Date("2026-01-04") },
    ]);
    const ui = await SortPage({ params: { id: "summer-bags" } });
    render(ui);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.filter((h) => h === "/collections/summer-bags/sort/4").length).toBeGreaterThanOrEqual(1);
    expect(hrefs.every((h) => !h.includes("sess_active"))).toBe(true);
  });
});
