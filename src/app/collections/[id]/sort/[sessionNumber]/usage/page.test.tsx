// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const {
  mockGetSession,
  mockRequireAccess,
  itemRepo,
  sessionRepo,
  decisionRepo,
  photoRepo,
  dispRepo,
  usageRoundProps,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findByCollectionAndNumber: vi.fn(), findByCollectionAndCurator: vi.fn() },
  decisionRepo: { findBySession: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
  dispRepo: { findByCollectionAndCurator: vi.fn() },
  usageRoundProps: { current: null as any },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
}));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));
vi.mock("@/server/repositories/implementations/DecisionEventRepository", () => ({ DecisionEventRepository: vi.fn(function () { return decisionRepo; }) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(function () { return photoRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemDispositionRepository", () => ({ ItemDispositionRepository: vi.fn(function () { return dispRepo; }) }));

// AppLayout mock renders breadcrumbs + actions + children so we can assert both.
vi.mock("@/components/layout", () => ({
  AppLayout: ({ children, breadcrumbs, actions }: any) => (
    <div>
      <nav data-testid="breadcrumbs">
        {(breadcrumbs ?? []).map((b: any, i: number) => (
          <span key={i}>{b.label}</span>
        ))}
      </nav>
      <div data-testid="actions">{actions}</div>
      {children}
    </div>
  ),
}));

// Capture the props the page passes to UsageRound — the payload-scoping pin and
// the queue/seed assertions read them directly (never through the client internals).
vi.mock("@/features/sorting/UsageRound", () => ({
  UsageRound: (props: any) => {
    usageRoundProps.current = props;
    return <div data-testid="usage-round" />;
  },
}));

vi.mock("@/features/sorting/PendingDecisionsGate", () => ({
  PendingDecisionsGate: ({ children }: any) => <div data-testid="pending-gate">{children}</div>,
}));
vi.mock("@/features/sorting/TakeABreakControl", () => ({
  TakeABreakControl: () => <div data-testid="take-a-break" />,
}));
// Markers for the triage-only affordances: the usage page must NOT import them, so
// these mocks never render — asserting their absence is a real regression pin (if
// someone copies triage's undo wiring in, the marker appears and the test fails).
vi.mock("@/features/sorting/TriageUndoProvider", () => ({
  TriageUndoProvider: ({ children }: any) => <div data-testid="triage-undo-provider">{children}</div>,
}));
vi.mock("@/features/sorting/TriageUndoNotice", () => ({
  TriageUndoNotice: () => <div data-testid="triage-undo-notice" />,
}));

import UsagePage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const ITEM = { id: "item_1", collectionId: "coll_01ABCDEF", number: 7, name: "Bag", brand: null, status: "active" };

function usageEvent(id: string, sessionId: string, itemId: string, result: "uses" | "not_uses") {
  return { id, sessionId, type: "usage", decision: { itemId, result }, createdAt: new Date("2026-01-01") };
}
function pairwiseEvent(id: string, sessionId: string) {
  return {
    id,
    sessionId,
    type: "pairwise_compare",
    decision: { itemAId: "item_1", itemBId: "item_2", result: "item_a" },
    createdAt: new Date("2026-01-01"),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usageRoundProps.current = null;
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollection.mockResolvedValue([ITEM]);
  sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_1", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "u1" });
  sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ id: "sess_1" }]);
  decisionRepo.findBySession.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map([["item_1", { id: "photo_1", itemId: "item_1" }]]));
  dispRepo.findByCollectionAndCurator.mockResolvedValue([]);
});

describe("UsagePage guard ladder (mirrors triage/page.tsx)", () => {
  it("redirects to /login when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    await expect(UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });

  it("redirects when the session number is not a positive integer", async () => {
    await expect(UsagePage({ params: { id: "summer-bags", sessionNumber: "abc" } })).rejects.toThrow("REDIRECT");
    // The integrity guard short-circuits the lookup for a bad number.
    expect(sessionRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });

  it("redirects when the resolved session belongs to a different collection", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_OTHER", number: 1, status: "active", curatorId: "u1" });
    await expect(UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });

  it("redirects when the user is not the session's curator — independent sort (purses-t9l)", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "someone_else" });
    await expect(UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
});

describe("UsagePage payload scoping (spec §5, DATA-6)", () => {
  it("passes decisions={[]} and never serializes any curator-log event into the props", async () => {
    // A prior-session usage event AND a prior-visit pairwise event: both are consumed
    // server-side (deriveUsage) yet must appear NOWHERE in the RSC payload.
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ id: "sess_1" }, { id: "sess_prior" }]);
    decisionRepo.findBySession.mockImplementation((sid: string) =>
      sid === "sess_prior"
        ? Promise.resolve([usageEvent("evt_prior_usage", "sess_prior", "item_used", "uses"), pairwiseEvent("evt_prior_pairwise", "sess_prior")])
        : Promise.resolve([]),
    );
    itemRepo.findByCollection.mockResolvedValue([
      ITEM,
      { id: "item_used", collectionId: "coll_01ABCDEF", number: 8, name: "Used", brand: null, status: "active" },
    ]);

    const ui = await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);

    // The recap server-log prop is literally empty.
    expect(usageRoundProps.current.decisions).toEqual([]);
    // The curator log fed the queue (item_used is usage-known → excluded, seed = 1)…
    expect(usageRoundProps.current.usageKnownSeed).toBe(1);
    expect(usageRoundProps.current.queue.map((e: any) => e.item.id)).toEqual(["item_1"]);
    // …but no event object leaks into anything the client receives.
    const payload = JSON.stringify(usageRoundProps.current);
    expect(payload).not.toContain("evt_prior_usage");
    expect(payload).not.toContain("evt_prior_pairwise");
  });
});

describe("UsagePage queue selection", () => {
  it("does ONE curator-log read (listForCurator), not a per-session listBySession sweep", async () => {
    await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    // listForCurator = findByCollectionAndCurator + one findBySession per curator session.
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledTimes(1);
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledWith("coll_01ABCDEF", "u1");
  });

  it("excludes usage-known items and seeds usageKnownSeed with the derived-map size", async () => {
    decisionRepo.findBySession.mockResolvedValue([usageEvent("evt1", "sess_1", "item_used", "uses")]);
    itemRepo.findByCollection.mockResolvedValue([
      ITEM,
      { id: "item_used", collectionId: "coll_01ABCDEF", number: 8, name: "Used", brand: null, status: "active" },
    ]);
    render(await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } }));
    expect(usageRoundProps.current.queue.map((e: any) => e.item.id)).toEqual(["item_1"]);
    expect(usageRoundProps.current.usageKnownSeed).toBe(1);
  });

  it("excludes disposed items (both set_aside and deferred)", async () => {
    dispRepo.findByCollectionAndCurator.mockResolvedValue([
      { itemId: "item_1", disposition: "set_aside" },
      { itemId: "item_def", disposition: "deferred" },
    ]);
    itemRepo.findByCollection.mockResolvedValue([
      ITEM,
      { id: "item_def", collectionId: "coll_01ABCDEF", number: 8, name: "Deferred", brand: null, status: "active" },
      { id: "item_2", collectionId: "coll_01ABCDEF", number: 9, name: "Tote", brand: null, status: "active" },
    ]);
    render(await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } }));
    expect(usageRoundProps.current.queue.map((e: any) => e.item.id)).toEqual(["item_2"]);
  });

  it("attaches cover photo URLs keyed to collection.id (ULID), not the slug, in ONE fetch", async () => {
    itemRepo.findByCollection.mockResolvedValue([
      ITEM,
      { id: "item_2", collectionId: "coll_01ABCDEF", number: 8, name: "Tote", brand: null, status: "active" },
    ]);
    render(await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } }));
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledWith(["item_1", "item_2"]);
    const withCover = usageRoundProps.current.queue.find((e: any) => e.item.id === "item_1");
    expect(withCover.heroPhotoUrl).toContain("coll_01ABCDEF");
    expect(withCover.heroPhotoUrl).not.toContain("summer-bags");
    const noCover = usageRoundProps.current.queue.find((e: any) => e.item.id === "item_2");
    expect(noCover.heroPhotoUrl).toBeUndefined();
  });
});

describe("UsagePage layout & wrap", () => {
  it("wraps the round in PendingDecisionsGate", async () => {
    const ui = await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    const gate = screen.getByTestId("pending-gate");
    expect(within(gate).getByTestId("usage-round")).toBeInTheDocument();
  });

  it("puts TakeABreakControl in the layout actions", async () => {
    const ui = await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    const actions = screen.getByTestId("actions");
    expect(within(actions).getByTestId("take-a-break")).toBeInTheDocument();
  });

  it("does NOT mount any TriageUndoProvider / TriageUndoNotice (no set-aside/defer on usage)", async () => {
    const ui = await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(screen.queryByTestId("triage-undo-provider")).not.toBeInTheDocument();
    expect(screen.queryByTestId("triage-undo-notice")).not.toBeInTheDocument();
  });

  it("renders the round's breadcrumb (Session hub → this round)", async () => {
    const ui = await UsagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    const crumbs = screen.getByTestId("breadcrumbs");
    expect(within(crumbs).getByText("Session")).toBeInTheDocument();
    expect(usageRoundProps.current.hubHref).toBe("/collections/summer-bags/sort/1");
  });
});
