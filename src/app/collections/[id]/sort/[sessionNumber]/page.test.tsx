// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, redirectMock, sessionRepo, decisionRepo, itemRepo, prefRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  sessionRepo: { findByCollectionAndNumber: vi.fn() },
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

describe("SessionDetailPage resolution + integrity guard", () => {
  it("redirects when the resolved session belongs to a different collection (guard survives)", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "s1", collectionId: "coll_OTHER", number: 1, status: "active", curatorId: "u1" });
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalled();
  });
  it("redirects when no session has that number", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue(null);
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "9" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects on a non-numeric segment without hitting the repo", async () => {
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "abc" } })).rejects.toThrow("REDIRECT");
    expect(sessionRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });
  it("renders when the session belongs to the resolved collection", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "s1", collectionId: "coll_REAL", number: 1, status: "active", curatorId: "u1" });
    const ui = await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(redirectMock).not.toHaveBeenCalled();
  });
  it("redirects when the user is not the session's curator — independent sort (purses-t9l)", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "s1", collectionId: "coll_REAL", number: 1, status: "active", curatorId: "someone_else" });
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
});
