// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, prefRepo, decisionRepo, photoRepo, dispRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findByCollectionAndNumber: vi.fn(), findByCollectionAndCurator: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
  dispRepo: { findByCollectionAndCurator: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(() => { throw new Error("REDIRECT"); }), useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(function () { return prefRepo; }) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(function () { return decisionRepo; }) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(function () { return photoRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemDispositionRepository", () => ({ ItemDispositionRepository: vi.fn(function () { return dispRepo; }) }));

import ComparePage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const A = { id: "item_a", collectionId: "coll_01ABCDEF", number: 1, name: "Bag A", brand: null, status: "active", createdAt: new Date(1), deletedAt: null };
const B = { id: "item_b", collectionId: "coll_01ABCDEF", number: 2, name: "Bag B", brand: null, status: "active", createdAt: new Date(2), deletedAt: null };
const C = { id: "item_c", collectionId: "coll_01ABCDEF", number: 3, name: "Bag C", brand: null, status: "active", createdAt: new Date(3), deletedAt: null };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollection.mockResolvedValue([A, B]);
  sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_1", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "u1" });
  // listForCurator = findByCollectionAndCurator + one findBySession per curator session.
  sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ id: "sess_1" }]);
  // With no comparison recorded yet, selectNextPair asks about this pair. Compare
  // no longer requires Love/Like preferences.
  prefRepo.findByCollection.mockResolvedValue([
    { itemId: "item_a", rankBucket: "top" },
    { itemId: "item_b", rankBucket: "high" },
  ]);
  decisionRepo.findBySession.mockResolvedValue([]);
  dispRepo.findByCollectionAndCurator.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(
    new Map([
      ["item_a", { id: "pa", itemId: "item_a" }],
      ["item_b", { id: "pb", itemId: "item_b" }],
    ]),
  );
});

describe("ComparePage hero images", () => {
  it("renders a pair even when no triage preferences exist", async () => {
    prefRepo.findByCollection.mockResolvedValue([]);

    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);

    expect(await screen.findByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(screen.queryByText("All comparisons complete")).not.toBeInTheDocument();
  });

  it("renders both items' hero images using collection.id, batch-loaded once", async () => {
    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);
    const a = await screen.findByRole("img", { name: "Bag A" });
    const b = await screen.findByRole("img", { name: "Bag B" });
    expect(a.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(a.getAttribute("src")).not.toContain("summer-bags");
    expect(b.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(b.getAttribute("src")).not.toContain("summer-bags");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
  });
});

describe("ComparePage disposition exclusion (Epic C PR1)", () => {
  it("excludes a disposed item from the pair — only one eligible item leaves no comparison", async () => {
    // B is deferred → only A remains comparable → no pair → the
    // "all comparisons complete" empty state, and
    // neither hero renders.
    dispRepo.findByCollectionAndCurator.mockResolvedValue([
      { itemId: "item_b", disposition: "deferred", collectionId: "coll_01ABCDEF", curatorId: "u1" },
    ]);

    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);

    expect(screen.getByText("All comparisons complete")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Bag B" })).not.toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Bag A" })).not.toBeInTheDocument();
  });
});

describe("ComparePage gentle progress text (Epic 0 Task 8 regression)", () => {
  it("renders 'N comparisons made so far' once at least one pairwise decision exists", async () => {
    // Three comparable items so a pair still remains after one recorded comparison —
    // the page reaches CompareChoice (not the "all complete" state) and must show
    // the gentle, non-gamified count derived from the session's pairwise decisions.
    itemRepo.findByCollection.mockResolvedValue([A, B, C]);
    prefRepo.findByCollection.mockResolvedValue([
      { itemId: "item_a", rankBucket: "top" },
      { itemId: "item_b", rankBucket: "high" },
      { itemId: "item_c", rankBucket: "high" },
    ]);
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
    decisionRepo.findBySession.mockResolvedValue([
      {
        id: "dec_1",
        sessionId: "sess_1",
        type: "pairwise_compare",
        createdAt: new Date(10),
        decision: { itemAId: "item_a", itemBId: "item_b", result: "item_a" },
      },
    ]);

    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);

    expect(screen.getByText(/comparison(s)? made so far/)).toBeInTheDocument();
    expect(screen.getByText(/1 comparison made so far/)).toBeInTheDocument();
  });

  it("keeps low-bucket items comparable after one recorded comparison", async () => {
    itemRepo.findByCollection.mockResolvedValue([A, B, C]);
    prefRepo.findByCollection.mockResolvedValue([
      { itemId: "item_a", rankBucket: "top" },
      { itemId: "item_b", rankBucket: "high" },
      { itemId: "item_c", rankBucket: "low" },
    ]);
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
    decisionRepo.findBySession.mockResolvedValue([
      {
        id: "dec_1",
        sessionId: "sess_1",
        type: "pairwise_compare",
        createdAt: new Date(10),
        decision: { itemAId: "item_a", itemBId: "item_b", result: "item_a" },
      },
    ]);

    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);

    expect(screen.queryByText("All comparisons complete")).not.toBeInTheDocument();
    expect(screen.getByText(/comparison(s)? made so far/)).toBeInTheDocument();
    expect(screen.getByText(/1 comparison made so far/)).toBeInTheDocument();
  });

  it("omits the progress text at the zero state (no comparisons yet)", async () => {
    // Default beforeEach: two items, no decisions. A pair is offered, but with
    // zero comparisons made the gentle count must not appear.
    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);

    expect(screen.getByRole("img", { name: "Bag A" })).toBeInTheDocument();
    expect(screen.queryByText(/comparison(s)? made so far/)).not.toBeInTheDocument();
  });
});

describe("ComparePage round chrome + copy (Epic 4c)", () => {
  it("wraps the compare content in the round shell (step 3 of 4 — usage is now step 2)", async () => {
    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);
    expect(screen.getByRole("list", { name: /round progress: step 3 of 4/i })).toBeInTheDocument();
    // The live pair still renders inside the shell.
    expect(screen.getByRole("img", { name: "Bag A" })).toBeInTheDocument();
  });

  it("uses the TONE.md love-framing copy", async () => {
    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);
    expect(screen.getByRole("heading", { name: /which do you love more\?/i })).toBeInTheDocument();
    expect(screen.getByText(/tap the one you love more/i)).toBeInTheDocument();
    // Regression guard: the utility/keep framing TONE.md forbids must not return.
    expect(screen.queryByRole("heading", { name: /reach for/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/\bkeep\b/i)).not.toBeInTheDocument();
  });

  it("renders no workspace mode chips mid-round (one decision at a time)", async () => {
    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);
    expect(screen.queryByRole("navigation", { name: "Workspace mode" })).not.toBeInTheDocument();
  });
});

describe("ComparePage curator-wide compare selection (§7.3)", () => {
  it("reads the curator log once via listForCurator — no per-session listBySession short-cut", async () => {
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ id: "sess_1" }]);

    await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });

    // listForCurator = findByCollectionAndCurator(collectionId, curatorId) + one
    // findBySession per curator session. A stray direct listBySession would make
    // findBySession fire without the curator lookup preceding it.
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledTimes(1);
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledWith("coll_01ABCDEF", "u1");
    expect(decisionRepo.findBySession).toHaveBeenCalledTimes(1);
    expect(decisionRepo.findBySession).toHaveBeenCalledWith("sess_1");
  });

  it("selection sees a prior-session comparison (→ all complete) while the recap count excludes it", async () => {
    // A↔B were compared in a PRIOR session (sess_0). This session (sess_1) has no
    // comparison. The curator log is the union of both sessions.
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ id: "sess_1" }, { id: "sess_0" }]);
    decisionRepo.findBySession.mockImplementation((sid: string) =>
      sid === "sess_0"
        ? Promise.resolve([
            {
              id: "prior",
              sessionId: "sess_0",
              type: "pairwise_compare",
              createdAt: new Date(10),
              decision: { itemAId: "item_a", itemBId: "item_b", result: "item_a" },
            },
          ])
        : Promise.resolve([]),
    );

    const ui = await ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) });
    render(ui);

    // Selection read the curator-wide log → A↔B already ordered → no pair to offer.
    // (Session-scoped selection would have seen an empty log and re-offered the pair.)
    expect(screen.getByText("All comparisons complete")).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Bag A" })).not.toBeInTheDocument();

    // The recap/count is the session-scoped subset (filtered to sess_1), so the
    // prior-session comparison is excluded → the gentle count stays hidden at zero.
    expect(screen.queryByText(/comparison(s)? made so far/)).not.toBeInTheDocument();
  });
});

describe("ComparePage integrity guard", () => {
  it("redirects (and halts) when the resolved session belongs to a different collection", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_OTHER", number: 1, status: "active", curatorId: "u1" });
    await expect(ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) })).rejects.toThrow("REDIRECT");
  });

  it("redirects (and halts) when the user is not the session's curator — independent sort (purses-t9l)", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "someone_else" });
    await expect(ComparePage({ params: Promise.resolve({ id: "summer-bags", sessionNumber: "1" }) })).rejects.toThrow("REDIRECT");
  });
});
