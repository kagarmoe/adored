// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, redirectMock, sessionRepo, decisionRepo, itemRepo, prefRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  sessionRepo: { findById: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(() => sessionRepo) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(() => decisionRepo) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(() => prefRepo) }));
vi.mock("@/features/sessions/SessionAnalytics", () => ({ SessionAnalytics: () => <div>analytics</div> }));

import SessionDetailPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_REAL", slug: "summer-bags", name: "Summer Bags" });
  itemRepo.findByCollection.mockResolvedValue([]);
  prefRepo.findByCollection.mockResolvedValue([]);
  decisionRepo.findBySession.mockResolvedValue([]);
});

describe("SessionDetailPage session/collection integrity", () => {
  it("redirects when the session belongs to a different collection", async () => {
    sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "coll_OTHER", status: "active" });
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionId: "s1" } })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalled();
  });
  it("renders when the session belongs to the resolved collection", async () => {
    sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "coll_REAL", status: "active" });
    const ui = await SessionDetailPage({ params: { id: "summer-bags", sessionId: "s1" } });
    render(ui);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
