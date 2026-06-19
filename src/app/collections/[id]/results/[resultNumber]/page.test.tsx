// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, redirectMock, resultRepo, resultItemRepo, itemRepo, shareRepo, photoRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  redirectMock: vi.fn(() => { throw new Error("REDIRECT"); }),
  resultRepo: { findByCollectionAndNumber: vi.fn() },
  resultItemRepo: { findByResult: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  shareRepo: { findByResult: vi.fn() },
  photoRepo: { findCoverPhotosByItemIds: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: redirectMock }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(() => resultRepo) }));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({ SortResultItemRepository: vi.fn(() => resultItemRepo) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(() => itemRepo) }));
vi.mock("@/server/repositories/implementations/SortResultShareRepository", () => ({ SortResultShareRepository: vi.fn(() => shareRepo) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(() => photoRepo) }));

import ResultDetailPage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const HERO = { id: "item_hero", collectionId: "coll_01ABCDEF", number: 1, name: "Hero Bag", brand: null, status: "active" };
const REST = { id: "item_rest", collectionId: "coll_01ABCDEF", number: 2, name: "Rest Bag", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "My ranking", status: "draft" });
  resultItemRepo.findByResult.mockResolvedValue([
    { id: "ri_1", itemId: "item_hero", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null },
    { id: "ri_2", itemId: "item_rest", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null },
  ]);
  itemRepo.findByCollection.mockResolvedValue([HERO, REST]);
  shareRepo.findByResult.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(
    new Map([
      ["item_hero", { id: "ph", itemId: "item_hero" }],
      ["item_rest", { id: "pr", itemId: "item_rest" }],
    ]),
  );
});

describe("ResultDetailPage hero images (nkp) + resolution", () => {
  it("renders hero + ranked images using collection.id, batch-loaded once", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    const hero = await screen.findByRole("img", { name: "Hero Bag" });
    const rest = await screen.findByRole("img", { name: "Rest Bag" });
    expect(hero.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(hero.getAttribute("src")).not.toContain("summer-bags");
    expect(rest.getAttribute("src")).toContain("coll_01ABCDEF");
    expect(photoRepo.findCoverPhotosByItemIds).toHaveBeenCalledTimes(1);
    expect(resultItemRepo.findByResult).toHaveBeenCalledWith("res_1"); // dependent query uses the ULID
  });

  it("redirects when the resolved result belongs to a different collection (guard survives)", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_x", collectionId: "coll_OTHER", number: 1, name: "X", status: "draft" });
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects when no result has that number", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue(null);
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "5" } })).rejects.toThrow("REDIRECT");
  });
  it("redirects on a non-numeric segment without hitting the repo", async () => {
    await expect(ResultDetailPage({ params: { id: "summer-bags", resultNumber: "abc" } })).rejects.toThrow("REDIRECT");
    expect(resultRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });
});

describe("ResultDetailPage SharePanel curator gate (axn)", () => {
  it("shows SharePanel for the result's curator viewing a finalized result", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "u1",
    });
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    expect(screen.getByRole("heading", { name: /share this result/i })).toBeInTheDocument();
  });

  it("hides SharePanel for a non-curator viewing a finalized result", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "someone_else",
    });
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    expect(screen.queryByRole("heading", { name: /share this result/i })).toBeNull();
  });
});

describe("ResultDetailPage tier sections + Onward + most-loved hero", () => {
  // One item per bucket so each tier-count card, the Onward (low) tier, and the
  // most-loved hero all have something to render.
  const TOP = { id: "i_top", collectionId: "coll_01ABCDEF", number: 1, name: "Top Bag", brand: null, status: "active" };
  const HIGH = { id: "i_high", collectionId: "coll_01ABCDEF", number: 2, name: "High Bag", brand: null, status: "active" };
  const MED = { id: "i_med", collectionId: "coll_01ABCDEF", number: 3, name: "Med Bag", brand: null, status: "active" };
  const LOW = { id: "i_low", collectionId: "coll_01ABCDEF", number: 4, name: "Low Bag", brand: null, status: "active" };

  beforeEach(() => {
    resultItemRepo.findByResult.mockResolvedValue([
      { id: "ri_top", itemId: "i_top", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null },
      { id: "ri_high", itemId: "i_high", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null },
      { id: "ri_med", itemId: "i_med", computedRank: 3, manualRank: null, computedBucket: "medium", manualBucket: null },
      { id: "ri_low", itemId: "i_low", computedRank: 4, manualRank: null, computedBucket: "low", manualBucket: null },
    ]);
    itemRepo.findByCollection.mockResolvedValue([TOP, HIGH, MED, LOW]);
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
  });

  it("renders all four tier-count cards with their human labels (Love/Like/Maybe/Onward)", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    // "Love" is also the most-loved-hero copy ("What you love most"), so scope to the tier labels.
    for (const label of ["Love", "Like", "Maybe", "Onward"]) {
      expect(screen.getAllByText(label).length).toBeGreaterThan(0);
    }
  });

  it("counts each tier independently (one item in each → every card shows 1, no zeros)", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    // Four tier cards, each with exactly one item; the only counts on the page are 1s.
    const ones = screen.getAllByText("1");
    expect(ones.length).toBe(4);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("labels the lowest tier as 'Onward' (the gentle visible label is present)", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    expect(screen.getByText("Onward")).toBeInTheDocument();
    expect(screen.queryByText(/discard/i)).toBeNull();
  });

  // BROKEN(purses-xca): ItemCard low tier still labeled 'Release'. The results page's own
  // tier cards say "Onward", but each low-tier ItemCard badge carries title="Release"
  // (src/features/items/ItemCard.tsx bucketLabels.low). queryByText only matches text
  // nodes, so the old assertion was false assurance — this honest tripwire scans the
  // whole rendered output (including attributes) and FAILS today, so it is green-as-
  // it.fails now and ERRORS the moment xca relabels low → "Onward".
  it.fails("results carry no 'Release' framing — the low tier reads 'Onward' (purses-xca)", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    const { container } = render(ui);
    expect(container.querySelector('[title="Release"]')).toBeNull();
    expect(container.innerHTML).not.toContain("Release");
  });

  it("gives the rank-1 item the most-loved hero treatment (affirmation peak)", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    expect(screen.getByText("What you love most")).toBeInTheDocument();
    // The hero names the single highest-ranked item, not the whole pile.
    const hero = screen.getByText("What you love most").closest("a");
    expect(hero).not.toBeNull();
    expect(hero!).toHaveTextContent("Top Bag");
    // And it deep-links to that item by its catalog number.
    expect(hero!.getAttribute("href")).toContain("/items/1");
  });

  it("renders the remaining items under 'The full ranking' (everything past the hero)", async () => {
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    expect(screen.getByRole("heading", { name: /the full ranking/i })).toBeInTheDocument();
    for (const name of ["High Bag", "Med Bag", "Low Bag"]) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
  });

  it("shows the gentle empty state (not a broken hero) when the result has no ranked items", async () => {
    resultItemRepo.findByResult.mockResolvedValue([]);
    const ui = await ResultDetailPage({ params: { id: "summer-bags", resultNumber: "1" } });
    render(ui);
    expect(screen.getByText(/no ranked items yet/i)).toBeInTheDocument();
    expect(screen.queryByText("What you love most")).toBeNull();
  });
});
