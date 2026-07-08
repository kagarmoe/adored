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
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  preferenceController: { listItemPreferences: vi.fn() },
  dispositionController: { listDispositions: vi.fn() },
  itemController: { listItems: vi.fn() },
  photoController: { findCoverPhotosByItemIds: vi.fn() },
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

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  dispositionController.listDispositions.mockResolvedValue([]);
  photoController.findCoverPhotosByItemIds.mockResolvedValue(new Map());
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

  it("renders no counts, denominators, or percentages (TONE)", async () => {
    const ui = await ResultsPage({ params: { id: "summer-bags" } });
    const { container } = render(ui);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/\bresult\(s\)\b/);
    expect(text).not.toMatch(/%/);
    expect(text).not.toMatch(/\b\d+\s+of\s+\d+\b/);
    // No bare integer tally surfaced to the person.
    expect(screen.queryByText(/^\d+$/)).toBeNull();
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
    const { container } = render(ui);
    // Match the ACTUAL rendered copy, which uses a curly apostrophe (&rsquo;) — a
    // straight-apostrophe alternative silently never matches (purses-z7ea).
    expect(screen.getByText("Nothing to see yet — and that’s fine.")).toBeInTheDocument();
    expect(container.textContent ?? "").not.toMatch(/\b0\b|none|no results/i);
    expect(screen.queryByText("What you love most")).toBeNull();
  });
});
