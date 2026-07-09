// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { ROUND_COPY } from "@/features/sorting/roundCopy";

const { mockGetSession, mockRequireAccess, redirectMock, sessionRepo, decisionRepo, itemRepo, prefRepo, dispositionRepo, analyticsProps, recommendedProps } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  sessionRepo: { findByCollectionAndNumber: vi.fn(), findByCollectionAndCurator: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  prefRepo: { findByCollection: vi.fn(), findByItem: vi.fn() },
  dispositionRepo: { findByCollectionAndCurator: vi.fn() },
  analyticsProps: { current: null as any },
  recommendedProps: { current: null as any },
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
vi.mock("@/features/sessions/SessionAnalytics", () => ({ SessionAnalytics: (props: any) => { analyticsProps.current = props; return <div>analytics</div>; } }));
vi.mock("@/features/sessions/SeeResultsCard", () => ({ SeeResultsCard: () => <div>see results card</div> }));
// Capture the props the hub hands the client wrapper; render its primary card so the
// server-paint copy/link assertions still hold without pulling in the mount effect.
vi.mock("@/features/sessions/RecommendedRound", () => ({
  RecommendedRound: (props: any) => {
    recommendedProps.current = props;
    // Mirror the real card's structure: label sits OUTSIDE the link so the link's
    // accessible name is exactly the cta (the shipped assertions rely on that).
    return (
      <div>
        <span>{props.primary.round.label}</span>
        <a href={props.primary.href}>{props.primary.round.cta}</a>
      </div>
    );
  },
}));

import SessionDetailPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({ id: "coll_REAL", slug: "summer-bags", name: "Summer Bags" });
  itemRepo.findByCollection.mockResolvedValue([]);
  prefRepo.findByCollection.mockResolvedValue([]);
  decisionRepo.findBySession.mockResolvedValue([]);
  // listForCurator = findByCollectionAndCurator + one findBySession per curator session.
  sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ id: "s1" }]);
  dispositionRepo.findByCollectionAndCurator.mockResolvedValue([]);
});

function usageEvt(id: string, itemId: string, result: "uses" | "not_uses" = "uses") {
  return { id, sessionId: "s1", type: "usage", decision: { itemId, result }, createdAt: new Date(1) };
}

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
    // Usage answered for both (curator log) → usage falls through; no comparison yet → a pair pends.
    decisionRepo.findBySession.mockResolvedValue([usageEvt("u1", "a"), usageEvt("u2", "b")]);

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
      usageEvt("u1", "a"), usageEvt("u2", "b"),
      { id: "d1", sessionId: "s1", type: "pairwise_compare", decision: { itemAId: "a", itemBId: "b", result: "item_a" }, createdAt: new Date(10) },
    ]);

    render(await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } }));

    expect(screen.getByRole("link", { name: /see results/i })).toHaveAttribute("href", "/collections/summer-bags/results");
  });
});

function topPref(itemId: string, rankBucket: "top" | "high") {
  return { id: `p-${itemId}`, collectionId: "coll_REAL", curatorId: "u1", itemId, score: 0.5, confidence: 0.5, rankBucket, comparisonCount: 0, orderRank: null, lastSeen: new Date(), createdAt: new Date(), updatedAt: new Date() };
}

describe("SessionDetailPage — usage in the grid, one-read log, dual return", () => {
  beforeEach(() => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "s1", collectionId: "coll_REAL", number: 1, status: "active", curatorId: "u1" });
  });

  it("shows a third usage-round card between Triage and Compare, linking to /usage", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem("a", 1)]); // untriaged → triage is the suggestion; grid always shows all three arcs

    render(await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } }));

    const usageHeading = screen.getByText(ROUND_COPY.usage.name);
    expect(usageHeading.closest("a")).toHaveAttribute("href", "/collections/summer-bags/sort/1/usage");

    // Document order: Triage → Usage → Compare (the D5 ladder order).
    const triage = screen.getByText(ROUND_COPY.triage.name);
    const usage = screen.getByText(ROUND_COPY.usage.name);
    const compare = screen.getByText(ROUND_COPY.compare.name);
    expect(triage.compareDocumentPosition(usage) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(usage.compareDocumentPosition(compare) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("does ONE curator-log read (listForCurator), never an extra per-session listBySession", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem("a", 1)]);

    await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } });

    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledTimes(1);
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledWith("coll_REAL", "u1");
    // Exactly one findBySession (the single curator session). A stray listBySession would make it two.
    expect(decisionRepo.findBySession).toHaveBeenCalledTimes(1);
    expect(decisionRepo.findBySession).toHaveBeenCalledWith("s1");
  });

  it("feeds SessionAnalytics only the session-scoped subset of the curator log", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem("a", 1), makeItem("b", 2)]);
    prefRepo.findByCollection.mockResolvedValue([topPref("a", "top"), topPref("b", "high")]);
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ id: "s1" }, { id: "s2" }]);
    decisionRepo.findBySession.mockImplementation((sid: string) =>
      sid === "s1"
        ? Promise.resolve([
            usageEvt("u1", "a"), usageEvt("u2", "b"),
            { id: "cmp1", sessionId: "s1", type: "pairwise_compare", decision: { itemAId: "a", itemBId: "b", result: "item_a" }, createdAt: new Date(10) },
          ])
        : Promise.resolve([
            { id: "other", sessionId: "s2", type: "usage", decision: { itemId: "a", result: "uses" }, createdAt: new Date(1) },
          ]),
    );

    render(await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } }));

    const decisions = analyticsProps.current.decisions as Array<{ id: string; sessionId: string }>;
    expect(decisions.every((e) => e.sessionId === "s1")).toBe(true);
    expect(decisions.map((e) => e.id)).toContain("cmp1");
    expect(decisions.map((e) => e.id)).not.toContain("other");
  });

  it("mounts RecommendedRound with both round hrefs + the curator/session ids", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem("a", 1), makeItem("b", 2)]);
    prefRepo.findByCollection.mockResolvedValue([topPref("a", "top"), topPref("b", "high")]);
    decisionRepo.findBySession.mockResolvedValue([]); // usage unknown → usage is primary, so a demoted twin exists

    render(await SessionDetailPage({ params: { id: "summer-bags", sessionNumber: "1" } }));

    expect(recommendedProps.current.primary.round.kind).toBe("usage");
    expect(recommendedProps.current.primary.href).toBe("/collections/summer-bags/sort/1/usage");
    expect(recommendedProps.current.whenUsageDemoted).toBeDefined();
    expect(recommendedProps.current.whenUsageDemoted.round.kind).toBe("compare");
    expect(recommendedProps.current.whenUsageDemoted.href).toBe("/collections/summer-bags/sort/1/compare");
    expect(recommendedProps.current.curatorId).toBe("u1");
    expect(recommendedProps.current.sessionId).toBe("s1");
  });
});
