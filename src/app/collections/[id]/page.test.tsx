// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, resultRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findByCollectionAndCurator: vi.fn() },
  resultRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  // The active-session card now renders ActiveSessionPanel (a client island
  // that calls useRouter).
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(function () { return resultRepo; }) }));

import CollectionPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags", description: null, createdAt: new Date() });
  itemRepo.findByCollection.mockResolvedValue([]);
  sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ id: "sess_zzz", number: 5, curatorId: "u1", status: "active", goal: "Go" }]);
  resultRepo.findByCollection.mockResolvedValue([]);
});

describe("CollectionPage nav links", () => {
  it("uses slug for dashboard links and slug + number for resume; no raw ULIDs", async () => {
    const ui = await CollectionPage({ params: { id: "summer-bags" } });
    render(ui);
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/collections/summer-bags/items");
    expect(hrefs).toContain("/collections/summer-bags/sort/5"); // active session resume
    expect(hrefs.every((h) => !h.includes("coll_01ABC"))).toBe(true);
    expect(hrefs.every((h) => !h.includes("sess_zzz"))).toBe(true);
    // purses-t9l: the active-session card is scoped to THIS user's sessions.
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledWith("coll_01ABC", "u1");
  });
});
