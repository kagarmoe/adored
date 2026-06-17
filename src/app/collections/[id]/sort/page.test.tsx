// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, sessionRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  sessionRepo: { findByCollection: vi.fn() },
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
  sessionRepo.findByCollection.mockResolvedValue([
    { id: "sess_zzz", number: 3, goal: "Discover", status: "completed", createdAt: new Date("2026-01-03") },
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
});
