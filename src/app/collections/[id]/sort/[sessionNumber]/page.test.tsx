// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ROUND_COPY } from "@/features/sorting/roundCopy";

const { mockGetSession, mockRequireAccess, redirectMock, sessionRepo, decisionRepo, itemRepo, prefRepo, dispositionRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  sessionRepo: { findByCollectionAndNumber: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  prefRepo: { findByCollection: vi.fn(), findByItem: vi.fn() },
  dispositionRepo: { findByCollectionAndCurator: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock, useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(function () { return decisionRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(function () { return prefRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemDispositionRepository", () => ({ ItemDispositionRepository: vi.fn(function () { return dispositionRepo; }) }));
vi.mock("@/features/sessions/SessionAnalytics", () => ({ SessionAnalytics: () => <div>analytics</div> }));
vi.mock("@/features/sessions/SeeResultsCard", () => ({ SeeResultsCard: () => <div>see results card</div> }));

import SessionDetailPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_REAL", slug: "summer-bags", name: "Summer Bags" });
  itemRepo.findByCollection.mockResolvedValue([]);
  prefRepo.findByCollection.mockResolvedValue([]);
  decisionRepo.findBySession.mockResolvedValue([]);
  dispositionRepo.findByCollectionAndCurator.mockResolvedValue([]);
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
    // Hub consumes the shared teaching copy — a hub-side fork of this string fails here.
    expect(screen.getByText(ROUND_COPY.triage.explainer)).toBeInTheDocument();
  });
  it("redirects when the user is not the session's curator — independent sort (purses-t9l)", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "s1", collectionId: "coll_REAL", number: 1, status: "active", curatorId: "someone_else" });
    await expect(SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
});

function makeItem(id: string, createdAtMs = 0) {
  return {
    id, collectionId: "coll_REAL", name: id, brand: null, style: null, color: null,
    material: null, category: null, number: null, height: null, width: null, depth: null,
    weight: null, unit: "in", status: null, notes: null,
    createdAt: new Date(createdAtMs), updatedAt: new Date(createdAtMs), deletedAt: null,
  };
}

describe("SessionDetailPage — recommended next round + no count/denominator debt", () => {
  beforeEach(() => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "s1", collectionId: "coll_REAL", number: 1, status: "active", curatorId: "u1" });
  });

  it("recommends Quick triage → triage round when items are still untriaged", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem("a", 1), makeItem("b", 2)]);
    prefRepo.findByCollection.mockResolvedValue([]); // nothing triaged yet

    const { container } = render(await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } }));

    expect(screen.getByText("Quick triage")).toBeInTheDocument();
    const cta = screen.getByRole("link", { name: /start triage/i });
    expect(cta).toHaveAttribute("href", "/collections/summer-bags/sort/1/triage");
    // No retired denominator/percentage anywhere on the hub.
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\bof\s+\d/i);
    expect(text).not.toMatch(/left to triage/i);
  });

  it("recommends Refine the top tier → compare round when a rankable pair remains", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem("a", 1), makeItem("b", 2)]);
    prefRepo.findByCollection.mockResolvedValue([
      { id: "p1", collectionId: "coll_REAL", curatorId: "u1", itemId: "a", score: 0.5, confidence: 0.5, rankBucket: "top", comparisonCount: 0, orderRank: null, lastSeen: new Date(), createdAt: new Date(), updatedAt: new Date() },
      { id: "p2", collectionId: "coll_REAL", curatorId: "u1", itemId: "b", score: 0.5, confidence: 0.5, rankBucket: "high", comparisonCount: 0, orderRank: null, lastSeen: new Date(), createdAt: new Date(), updatedAt: new Date() },
    ]);
    decisionRepo.findBySession.mockResolvedValue([]); // no comparison yet → a pair pends

    render(await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } }));

    expect(screen.getByText("Refine the top tier")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Refine" })).toHaveAttribute("href", "/collections/summer-bags/sort/1/compare");
  });

  it("recommends See results → results when triage is done and the top tier is ordered", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem("a", 1), makeItem("b", 2)]);
    prefRepo.findByCollection.mockResolvedValue([
      { id: "p1", collectionId: "coll_REAL", curatorId: "u1", itemId: "a", score: 0.5, confidence: 0.5, rankBucket: "top", comparisonCount: 0, orderRank: null, lastSeen: new Date(), createdAt: new Date(), updatedAt: new Date() },
      { id: "p2", collectionId: "coll_REAL", curatorId: "u1", itemId: "b", score: 0.5, confidence: 0.5, rankBucket: "high", comparisonCount: 0, orderRank: null, lastSeen: new Date(), createdAt: new Date(), updatedAt: new Date() },
    ]);
    decisionRepo.findBySession.mockResolvedValue([
      { id: "d1", sessionId: "s1", type: "pairwise_compare", decision: { itemAId: "a", itemBId: "b", result: "item_a" }, createdAt: new Date(10) },
    ]);

    render(await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } }));

    expect(screen.getByRole("link", { name: /see results/i })).toHaveAttribute("href", "/collections/summer-bags/results");
  });
});
