// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const {
  mockGetSession,
  mockRequireAccess,
  preferenceController,
  dispositionController,
  itemController,
  photoController,
  decisionController,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  preferenceController: { listItemPreferences: vi.fn() },
  dispositionController: { listDispositions: vi.fn() },
  itemController: { listItems: vi.fn() },
  photoController: { findCoverPhotosByItemIds: vi.fn() },
  decisionController: { listForCurator: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn(), useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/api/preferences", () => ({ PreferenceController: { fromDb: () => preferenceController } }));
vi.mock("@/server/api/dispositions", () => ({ DispositionController: { fromDb: () => dispositionController } }));
vi.mock("@/server/api/items", () => ({ ItemController: { fromDb: () => itemController } }));
vi.mock("@/server/api/photos", () => ({ PhotoController: { fromDb: () => photoController } }));
vi.mock("@/server/api/decisions", () => ({ DecisionController: { fromDb: () => decisionController } }));
// FinalizeEntry is a client component (useRouter); stub it to a marker.
vi.mock("@/features/results/FinalizeEntry", () => ({ FinalizeEntry: () => <div data-testid="finalize-entry">Finalize</div> }));

import ResultsPage from "./page";

const COLLECTION = { id: "coll_01ABC", slug: "summer-bags", name: "Summer Bags" };

function pref(itemId: string, rankBucket: string, orderRank: number | null) {
  return {
    id: `pref_${itemId}`,
    collectionId: COLLECTION.id,
    curatorId: "u1",
    itemId,
    score: 0,
    confidence: 0,
    rankBucket,
    comparisonCount: 0,
    orderRank,
    lastSeen: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
function item(id: string, number: number, name: string) {
  return { id, collectionId: COLLECTION.id, number, name, brand: null, status: "active" };
}
function usageEvent(id: string, itemId: string, result: "uses" | "not_uses") {
  return {
    id,
    sessionId: `sess_${id}`,
    type: "usage",
    decision: { itemId, result },
    createdAt: new Date(),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  dispositionController.listDispositions.mockResolvedValue([]);
  photoController.findCoverPhotosByItemIds.mockResolvedValue(new Map());
  decisionController.listForCurator.mockResolvedValue([]);
});

describe("Decide Standing — live most-loved", () => {
  beforeEach(() => {
    preferenceController.listItemPreferences.mockResolvedValue([
      pref("b", "top", 2),
      pref("a", "top", 1),
      pref("c", "high", 1),
      pref("d", "low", 1),
    ]);
    itemController.listItems.mockResolvedValue([
      item("a", 1, "Alpha"),
      item("b", 2, "Bravo"),
      item("c", 3, "Charlie"),
      item("d", 4, "Delta"),
    ]);
  });

  it("hero names the orderRank #1 top-bucket item (== what you love most)", async () => {
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);
    const hero = screen.getByText("What you love most").closest("a")!;
    expect(hero).toHaveTextContent("Alpha");
    expect(hero.getAttribute("href")).toContain("/items/1");
  });

  it("reads live preferences for the session curator, not a snapshot", async () => {
    await ResultsPage({ params: { id: "summer-bags" } });
    expect(preferenceController.listItemPreferences).toHaveBeenCalledWith("coll_01ABC", "u1");
  });

  it("keeps the low bucket out of the ranking and in the Onward section", async () => {
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);
    const onward = screen.getByRole("heading", { name: /where these go next/i }).closest("section")!;
    expect(within(onward).getByText("Delta")).toBeInTheDocument();
  });

});

describe("Decide Standing — set aside", () => {
  it("surfaces set-aside items in their own section", async () => {
    preferenceController.listItemPreferences.mockResolvedValue([pref("a", "top", 1)]);
    itemController.listItems.mockResolvedValue([item("a", 1, "Alpha"), item("s", 9, "Set One")]);
    dispositionController.listDispositions.mockResolvedValue([
      { id: "d1", collectionId: COLLECTION.id, curatorId: "u1", itemId: "s", disposition: "set_aside" },
    ]);
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);
    const setAside = screen.getByRole("heading", { name: /set aside|waiting/i }).closest("section")!;
    expect(within(setAside).getByText("Set One")).toBeInTheDocument();
  });
});

describe("Decide Standing — empty", () => {
  it("shows a gentle person-side empty state, never an empty count", async () => {
    preferenceController.listItemPreferences.mockResolvedValue([]);
    itemController.listItems.mockResolvedValue([]);
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);
    // Match the ACTUAL rendered copy, which uses a curly apostrophe (&rsquo;) — a
    // straight-apostrophe alternative silently never matches (purses-z7ea).
    expect(screen.getByText("Nothing to see yet — and that’s fine.")).toBeInTheDocument();
    expect(screen.queryByText("What you love most")).toBeNull();
  });
});

describe("Decide Standing — usage chip (Epic S1)", () => {
  beforeEach(() => {
    preferenceController.listItemPreferences.mockResolvedValue([
      pref("a", "top", 1), // hero (MostLovedHero, no chip)
      pref("b", "top", 2), // grid row — usage-known: uses
      pref("c", "high", 1), // grid row — usage undecided (no chip)
      pref("d", "low", 1), // onward row — usage-known: not_uses
    ]);
    itemController.listItems.mockResolvedValue([
      item("a", 1, "Alpha"),
      item("b", 2, "Bravo"),
      item("c", 3, "Charlie"),
      item("d", 4, "Delta"),
    ]);
  });

  it("issues the curator usage read (listForCurator), curator-scoped", async () => {
    await ResultsPage({ params: { id: "summer-bags" } });
    expect(decisionController.listForCurator).toHaveBeenCalledWith("coll_01ABC", "u1");
  });

  it("renders 'In your life' on a used ranked row and 'Resting' on a resting one", async () => {
    decisionController.listForCurator.mockResolvedValue([
      usageEvent("ev_b", "b", "uses"),
      usageEvent("ev_d", "d", "not_uses"),
    ]);
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);

    const inLife = screen.getByText("In your life");
    expect(within(inLife.closest(".isolate")!).getByText("Bravo")).toBeInTheDocument();
    const resting = screen.getByText("Resting");
    expect(within(resting.closest(".isolate")!).getByText("Delta")).toBeInTheDocument();
  });

  it("renders NO chip on a usage-undecided row (Charlie)", async () => {
    decisionController.listForCurator.mockResolvedValue([
      usageEvent("ev_b", "b", "uses"),
      usageEvent("ev_d", "d", "not_uses"),
    ]);
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);

    const charlieCard = screen.getByText("Charlie").closest(".isolate")!;
    expect(within(charlieCard).queryByText(/In your life|Resting/)).toBeNull();
    // Exactly one item is used, one is resting — no over-render.
    expect(screen.getAllByText("In your life")).toHaveLength(1);
    expect(screen.getAllByText("Resting")).toHaveLength(1);
  });

  it("DATA-6: the raw curator event log is never serialized into the render", async () => {
    decisionController.listForCurator.mockResolvedValue([
      usageEvent("ev_SECRET_LEAK", "b", "uses"),
      usageEvent("ev_ANOTHER_LEAK", "d", "not_uses"),
    ]);
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    const { container } = render(ui);
    // The chip Map is the only usage payload; the event ids / sessionIds must
    // not appear anywhere in the rendered markup.
    expect(container.innerHTML).not.toContain("ev_SECRET_LEAK");
    expect(container.innerHTML).not.toContain("ev_ANOTHER_LEAK");
    expect(container.innerHTML).not.toContain("sess_ev_SECRET_LEAK");
  });
});

describe("Decide Standing — usage-only collection (F5 gate)", () => {
  it("renders the item list with chips, not the 'Start sorting' empty state", async () => {
    // No love ranking at all, but usage answers exist.
    preferenceController.listItemPreferences.mockResolvedValue([]);
    itemController.listItems.mockResolvedValue([
      item("a", 1, "Alpha"),
      item("b", 2, "Bravo"),
    ]);
    decisionController.listForCurator.mockResolvedValue([
      usageEvent("ev_a", "a", "uses"),
      usageEvent("ev_b", "b", "not_uses"),
    ]);
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);

    // NOT the gentle empty state.
    expect(screen.queryByText("Nothing to see yet — and that’s fine.")).toBeNull();
    // F-UX-M2: the heading is honest — it does not claim possession ("live with")
    // that the Resting rows in the same section contradict.
    expect(screen.getByRole("heading", { name: /the ones you.?ve weighed in on/i })).toBeInTheDocument();
    expect(screen.queryByText(/the ones you live with/i)).toBeNull();
    // The usage-known items appear, each with its chip.
    expect(within(screen.getByText("In your life").closest(".isolate")!).getByText("Alpha")).toBeInTheDocument();
    expect(within(screen.getByText("Resting").closest(".isolate")!).getByText("Bravo")).toBeInTheDocument();
  });

  it("still shows the gentle empty state when there is NO love AND NO usage", async () => {
    preferenceController.listItemPreferences.mockResolvedValue([]);
    itemController.listItems.mockResolvedValue([item("a", 1, "Alpha")]);
    decisionController.listForCurator.mockResolvedValue([]);
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    render(ui);
    expect(screen.getByText("Nothing to see yet — and that’s fine.")).toBeInTheDocument();
    expect(screen.queryByText("In your life")).toBeNull();
    expect(screen.queryByText("Resting")).toBeNull();
  });
});
