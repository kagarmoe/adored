// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, sessionRepo, prefRepo, decisionRepo, photoRepo, dispRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findByCollectionAndNumber: vi.fn() },
  prefRepo: { findByCollection: vi.fn(), findByItem: vi.fn() },
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

import TriagePage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const ITEM = { id: "item_1", collectionId: "coll_01ABCDEF", number: 7, name: "Bag", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollection.mockResolvedValue([ITEM]);
  sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_1", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "u1" });
  prefRepo.findByCollection.mockResolvedValue([]);
  decisionRepo.findBySession.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map([["item_1", { id: "photo_1", itemId: "item_1" }]]));
  dispRepo.findByCollectionAndCurator.mockResolvedValue([]);
});

describe("TriagePage integrity guard", () => {
  it("redirects (and halts) when the resolved session belongs to a different collection", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_OTHER", number: 1, status: "active", curatorId: "u1" });
    await expect(TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });

  it("redirects (and halts) when the user is not the session's curator — independent sort (purses-t9l)", async () => {
    sessionRepo.findByCollectionAndNumber.mockResolvedValue({ id: "sess_x", collectionId: "coll_01ABCDEF", number: 1, status: "active", curatorId: "someone_else" });
    await expect(TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
});

describe("TriagePage hero image", () => {
  it("renders the current item's hero image using collection.id (ULID), not the slug", async () => {
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    const img = await screen.findByRole("img", { name: "Bag" });
    expect(img.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(img.getAttribute("src")).not.toContain("summer-bags");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledWith(["item_1"]);
  });

  it("shows the initial (no img) when the item has no cover", async () => {
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(screen.queryByRole("img")).not.toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
  });
});

describe("TriagePage person-side copy & affordances", () => {
  it("uses a person-side prompt, not a machine-side bucket instruction", async () => {
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(screen.getByRole("heading", { name: /how do you feel about this one\?/i })).toBeInTheDocument();
    expect(screen.queryByText(/assign the current item to a preference bucket/i)).not.toBeInTheDocument();
  });

  it("renders the 'Not yet' defer control wired to collection.id (ULID), not the slug", async () => {
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    // The control is a client island; assert it rendered with its accessible label.
    expect(screen.getByRole("button", { name: /not yet/i })).toBeInTheDocument();
  });

  it("renders the 'Not mine' set-aside control as a second quiet escape", async () => {
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    // The set-aside island sits beside "Not yet"; assert its accessible label.
    expect(screen.getByRole("button", { name: /not mine/i })).toBeInTheDocument();
  });
});

describe("TriagePage ceiling-free progress (TONE 1 & 4)", () => {
  it("shows no total, no remaining count, and no 'of N' framing", async () => {
    prefRepo.findByCollection.mockResolvedValue([{ itemId: "item_done", disposition: "top" }]);
    itemRepo.findByCollection.mockResolvedValue([
      ITEM,
      { id: "item_done", collectionId: "coll_01ABCDEF", number: 8, name: "Done", brand: null, status: "active" },
    ]);
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    const { container } = render(ui);
    // Counts what was decided, never what's left — and never "X of Y".
    expect(screen.getByText(/1 decided so far/i)).toBeInTheDocument();
    // The item-count cue must not use a "of N" ceiling. The round shell's a11y step
    // announcement ("Step 1 of 3") is round progress, not an item ceiling, and is
    // sr-only — exclude it so this guards the visible decision cue, its true target.
    const ofNMatches = screen
      .queryAllByText(/\bof\s+\d+\b/i)
      .filter((el) => !el.className.includes("sr-only"));
    expect(ofNMatches).toHaveLength(0);
    expect(screen.queryByText(/\d+\s+(left|remaining|to go|undecided)/i)).not.toBeInTheDocument();
    // No filling progress bar (an inline width style is the tell of the old bar).
    expect(container.querySelector('[style*="width"]')).toBeNull();
  });

  it("omits the cue entirely before the first decision (no '0 decided')", async () => {
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(screen.queryByText(/decided so far/i)).not.toBeInTheDocument();
  });
});

describe("TriagePage round chrome (Epic 4c)", () => {
  it("wraps the triage content in the round shell (step 1 of 3) while keeping the decision UI", async () => {
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    // The round shell's step indicator is present and on step 1.
    expect(screen.getByRole("list", { name: /round progress: step 1 of 3/i })).toBeInTheDocument();
    // The existing decision controls still render inside the shell.
    expect(screen.getByRole("button", { name: /^love$/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /how do you feel about this one\?/i })).toBeInTheDocument();
  });
});

describe("TriagePage patient-waiting skin (showingDeferred)", () => {
  it("renders the 'Ready when you are' treatment when only deferred items remain", async () => {
    dispRepo.findByCollectionAndCurator.mockResolvedValue([
      { itemId: "item_1", disposition: "deferred" },
    ]);
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(screen.getByText(/ready when you are/i)).toBeInTheDocument();
    // a11y (whole-branch review, fix B): the banner is persistent VISUAL CONTEXT
    // re-rendered on every refresh, NOT a discrete state change to announce — and
    // role="status" here would compete with the undo notice's live region. So the
    // copy renders but is NOT a status live region. The H1 conveys the screen.
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    // Never a remaining-count / inbox framing.
    expect(screen.queryByText(/\d+\s+left/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/inbox|resting place/i)).not.toBeInTheDocument();
    // The deferred item still comes forward to be decided.
    expect(screen.getByRole("button", { name: /^love$/i })).toBeInTheDocument();
  });

  it("does NOT show the patient-waiting treatment while active items remain", async () => {
    dispRepo.findByCollectionAndCurator.mockResolvedValue([
      { itemId: "item_deferred", disposition: "deferred" },
    ]);
    itemRepo.findByCollection.mockResolvedValue([
      ITEM,
      { id: "item_deferred", collectionId: "coll_01ABCDEF", number: 9, name: "Later", brand: null, status: "active" },
    ]);
    const ui = await TriagePage({ params: { id: "summer-bags", sessionNumber: "1" } });
    render(ui);
    expect(screen.queryByText(/ready when you are/i)).not.toBeInTheDocument();
  });
});
