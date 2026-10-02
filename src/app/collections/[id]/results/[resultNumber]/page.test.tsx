// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

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
vi.mock("next/navigation", () => ({ redirect: redirectMock, useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({ SortResultRepository: vi.fn(function () { return resultRepo; }) }));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({ SortResultItemRepository: vi.fn(function () { return resultItemRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/SortResultShareRepository", () => ({ SortResultShareRepository: vi.fn(function () { return shareRepo; }) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(function () { return photoRepo; }) }));

import ResultDetailPage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags" };
const HERO = { id: "item_hero", collectionId: "coll_01ABCDEF", number: 1, name: "Hero Bag", brand: null, status: "active" };
const REST = { id: "item_rest", collectionId: "coll_01ABCDEF", number: 2, name: "Rest Bag", brand: null, status: "active" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "My ranking", status: "finalized", curatorId: "u1" });
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
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
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
    await expect(ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) })).rejects.toThrow("REDIRECT");
  });
  it("redirects when no result has that number", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue(null);
    await expect(ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "5" }) })).rejects.toThrow("REDIRECT");
  });
  it("redirects on a non-numeric segment without hitting the repo", async () => {
    await expect(ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "abc" }) })).rejects.toThrow("REDIRECT");
    expect(resultRepo.findByCollectionAndNumber).not.toHaveBeenCalled();
  });
});

describe("ResultDetailPage status badge — person-side wording (qrsr)", () => {
  it("a draft goes to the live Ranking — drafts are adjusted there now (spec §4)", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "draft", curatorId: "u1" });
    await expect(ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) })).rejects.toThrow("REDIRECT");
    expect(redirectMock).toHaveBeenCalledWith("/collections/summer-bags/results");
  });

  it("labels a finalized result 'Saved', never the machine word 'finalized'", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "u1",
    });
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.getByText("Saved")).toBeInTheDocument();
    expect(screen.queryByText("finalized")).toBeNull();
  });
});

describe("ResultDetailPage SharePanel curator gate (axn)", () => {
  it("shows SharePanel for the result's curator viewing a finalized result", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "u1",
    });
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.getByRole("heading", { name: /show someone what you love/i })).toBeInTheDocument();
  });

  it("hides SharePanel for a non-curator viewing a finalized result", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "someone_else",
    });
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.queryByRole("heading", { name: /show someone what you love/i })).toBeNull();
  });
});

// A saved keepsake is never reordered in place; its curator may open a revision
// on the live Ranking (spec §4.4).
describe("ResultDetailPage Make a revision (curator only)", () => {
  beforeEach(() => {
    resultItemRepo.findByResult.mockResolvedValue([
      { id: "ri_1", itemId: "item_hero", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null },
      { id: "ri_2", itemId: "item_rest", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null },
    ]);
    itemRepo.findByCollection.mockResolvedValue([HERO, REST]);
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
  });

  it("offers 'Make a revision' to the curator of a FINALIZED result", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "u1",
    });
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.getByRole("button", { name: "Make a revision" })).toBeInTheDocument();
  });

  // F-UX-I3: the finalized "Make a revision" affordance is curator-gated (mirrors
  // the SharePanel gate) — a non-curator collaborator must not be offered to fork
  // another curator's keepsake.
  it("hides 'Make a revision' for a NON-curator viewing a finalized result", async () => {
    resultRepo.findByCollectionAndNumber.mockResolvedValue({
      id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "R", status: "finalized", curatorId: "someone_else",
    });
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.queryByRole("button", { name: "Make a revision" })).toBeNull();
  });
});

describe("ResultDetailPage tier sections + Onward + most-loved hero", () => {
  // One item per bucket so the loved ranking, the Onward (low) section, and the
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

  it("does not render a bold per-tier count tally (no count-shaming)", async () => {
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    // The old design showed a 4-up grid of bold integer counts (one "1" per tier).
    // Epic B removes it: tallying what's in each bucket is count-shaming (TONE #1, #4).
    expect(screen.queryAllByText("1").length).toBe(0);
    expect(screen.queryByText("0")).toBeNull();
  });

  it("keeps the tier labels on the cards/sections (Like/Maybe via badges, Onward in its section)", async () => {
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    const { container } = render(ui);
    // Labels now live on the ItemCard badges (title=) and the Onward section,
    // not on a count grid. The dot badges carry Like/Maybe via their title attribute.
    expect(container.querySelector('[title="Like"]')).not.toBeNull();
    expect(container.querySelector('[title="Maybe"]')).not.toBeNull();
    // "Onward" is the lowest tier's gentle label, surfaced in its own section.
    expect(screen.getAllByText(/onward|where these go next/i).length).toBeGreaterThan(0);
  });

  it("labels the lowest tier as 'Onward' (the gentle visible label is present)", async () => {
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.getByText("Onward")).toBeInTheDocument();
    expect(screen.queryByText(/discard/i)).toBeNull();
  });

  // REGRESSION(purses-xca): the low tier must read "Onward", never "Release" (tone
  // contract — no letting-go framing). This scans the whole rendered output including
  // attributes, because the low-tier ItemCard badge carries the label in title=, which
  // queryByText (text nodes only) would miss.
  it("results carry no 'Release' framing — the low tier reads 'Onward' (purses-xca)", async () => {
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    const { container } = render(ui);
    expect(container.querySelector('[title="Release"]')).toBeNull();
    expect(container.innerHTML).not.toContain("Release");
  });

  it("gives the rank-1 item the most-loved hero treatment (affirmation peak)", async () => {
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.getByText("What you love most")).toBeInTheDocument();
    // The hero names the single highest-ranked item, not the whole pile.
    const hero = screen.getByText("What you love most").closest("a");
    expect(hero).not.toBeNull();
    expect(hero!).toHaveTextContent("Top Bag");
    // And it deep-links to that item by its catalog number.
    expect(hero!.getAttribute("href")).toContain("/items/1");
  });

  it("keeps the lowest tier OUT of 'The full ranking' and in a separate Onward section", async () => {
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    const fullRanking = screen.getByRole("heading", { name: /the full ranking/i }).closest("section")!;
    expect(within(fullRanking).getByText("High Bag")).toBeInTheDocument();
    expect(within(fullRanking).getByText("Med Bag")).toBeInTheDocument();
    expect(within(fullRanking).queryByText("Low Bag")).toBeNull();
    const onward = screen.getByRole("heading", { name: /where these go next|onward/i }).closest("section")!;
    expect(within(onward).getByText("Low Bag")).toBeInTheDocument();
  });

  it("ends the page on an affirmation beat that re-anchors to the loved set at the top, not the Onward section", async () => {
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    // The close re-anchors to the LOVED set at the TOP (hero/ranking), so the bare
    // demonstrative never binds by proximity to the Onward pile rendered just above
    // it. It must NOT read "these are the things you love most" — that mixed-case
    // close pointed at Onward (TONE #1 affirmation-not-subtraction).
    const affirmation = screen.getByText("What you love most is at the top.");
    expect(affirmation).toBeInTheDocument();
    expect(screen.queryByText(/these are the things you love/i)).toBeNull();
    // ...and it is the page's last content beat — it comes after the Onward section
    // in document order, so letting-go is never the structural headline (TONE #1).
    const onwardHeading = screen.getByRole("heading", { name: /where these go next/i });
    const position = onwardHeading.compareDocumentPosition(affirmation);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  // Edge: exactly one loved item (the hero) plus one Onward item. The hero shows, but
  // there is no "full ranking" tail (loved.slice(1) is empty), the Onward section still
  // renders, and the close re-anchors to the loved set ("...at the top") — proving the
  // loved>0 affirmation close fires even when the loved set is a single item.
  it("loved.length===1: hero shows, no 'full ranking' heading, Onward renders, close affirms the top", async () => {
    resultItemRepo.findByResult.mockResolvedValue([
      { id: "ri_top", itemId: "i_top", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null },
      { id: "ri_low", itemId: "i_low", computedRank: 2, manualRank: null, computedBucket: "low", manualBucket: null },
    ]);
    itemRepo.findByCollection.mockResolvedValue([TOP, LOW]);
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    // The hero is present (the lone loved item)...
    expect(screen.getByText("What you love most")).toBeInTheDocument();
    expect(screen.getByText("Top Bag")).toBeInTheDocument();
    // ...with no "full ranking" tail (loved has only the hero)...
    expect(screen.queryByText(/the full ranking/i)).toBeNull();
    // ...the Onward section still renders the low item...
    const onward = screen.getByRole("heading", { name: /where these go next/i }).closest("section")!;
    expect(within(onward).getByText("Low Bag")).toBeInTheDocument();
    // ...and the close re-anchors to the loved set at the top, the page's last beat.
    expect(screen.getByText("What you love most is at the top.")).toBeInTheDocument();
  });

  it("shows the gentle empty state (not a broken hero) when the result has no ranked items", async () => {
    resultItemRepo.findByResult.mockResolvedValue([]);
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.getByText(/no ranked items yet/i)).toBeInTheDocument();
    expect(screen.queryByText("What you love most")).toBeNull();
  });

  // The most tone-dangerous screen: everything landed in the lowest tier, so there
  // is no loved set and no hero. The page must still lead with affirmation — honoring
  // the act of deciding / the clarity reached — and must never imply nothing was loved
  // or surface a count (TONE #1 affirmation-not-subtraction, #4 unpressured).
  it("an all-Onward result leads with affirmation, never 'nothing loved' or a count", async () => {
    resultItemRepo.findByResult.mockResolvedValue([
      { id: "ri_low1", itemId: "i_low", computedRank: 1, manualRank: null, computedBucket: "low", manualBucket: null },
    ]);
    itemRepo.findByCollection.mockResolvedValue([{ id: "i_low", collectionId: "coll_01ABCDEF", number: 4, name: "Low Bag", brand: null, status: "active" }]);
    // Viewed by a collaborator so the curator-only SharePanel (and its own empty-state
    // copy) stays out of the ranking framing under test.
    resultRepo.findByCollectionAndNumber.mockResolvedValue({ id: "res_1", collectionId: "coll_01ABCDEF", number: 1, name: "My ranking", status: "finalized", curatorId: "someone_else" });
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    const { container } = render(ui);
    expect(screen.getByText(/you('ve| have) made your choices|honored|clarity/i)).toBeInTheDocument();
    // Assert against visible copy, not raw HTML: Tailwind utility classes
    // (inset-0, translate-y-0, duration-200) contain "0 " and would false-match
    // the brief's bare-count guard. The user never sees those — the count/absence
    // framing we forbid would land in rendered text (TONE #1, #4).
    const visibleText = container.textContent ?? "";
    expect(visibleText).not.toMatch(/nothing|none of|\b0\b/i);
    // No loved set means no hero and no "full ranking" headline.
    expect(screen.queryByText("What you love most")).toBeNull();
    expect(screen.queryByText(/the full ranking/i)).toBeNull();
  });

  // The closing beat must not contradict itself: with nothing in the loved set the
  // page cannot claim "these are the things you love most" (it would assert love of
  // exactly the items it just sent Onward). The end-beat is conditional — all-Onward
  // closes on the DECIDING / CLARITY instead, so the page still ends on affirmation
  // (Peak-End), never on the letting-go list (TONE #1).
  it("all-Onward ends on a clarity/deciding affirmation, never 'love most'", async () => {
    resultItemRepo.findByResult.mockResolvedValue([
      { id: "ri_low1", itemId: "i_low", computedRank: 1, manualRank: null, computedBucket: "low", manualBucket: null },
    ]);
    itemRepo.findByCollection.mockResolvedValue([{ id: "i_low", collectionId: "coll_01ABCDEF", number: 4, name: "Low Bag", brand: null, status: "active" }]);
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    // No "love most" claim when nothing was loved...
    expect(screen.queryByText(/love most/i)).toBeNull();
    // ...but the page still closes on a person-side affirmation — honoring the act of
    // looking honestly at every one — and that close comes AFTER the Onward section
    // (letting-go is never the last beat).
    const close = screen.getByText("You looked, honestly, at every one. That took something.");
    expect(close).toBeInTheDocument();
    const onwardHeading = screen.getByRole("heading", { name: /where these go next/i });
    const position = onwardHeading.compareDocumentPosition(close);
    expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// Epic S §3.4: the finalized keepsake renders the SNAPSHOT usage (the frozen
// `usage` column) as the SAME quiet chip the live Standing built ("In your life"
// / "Resting"). A pre-Epic-S result (all-NULL) renders no chip (backward compat).
describe("ResultDetailPage snapshot usage chip (Epic S §3.4)", () => {
  // Non-hero rows so the chip renders on the card (the most-loved hero shows no
  // chip). HIGH carries "uses", MED carries "not_uses".
  const TOP = { id: "i_top", collectionId: "coll_01ABCDEF", number: 1, name: "Top Bag", brand: null, status: "active" };
  const HIGH = { id: "i_high", collectionId: "coll_01ABCDEF", number: 2, name: "High Bag", brand: null, status: "active" };
  const MED = { id: "i_med", collectionId: "coll_01ABCDEF", number: 3, name: "Med Bag", brand: null, status: "active" };

  beforeEach(() => {
    itemRepo.findByCollection.mockResolvedValue([TOP, HIGH, MED]);
    photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
  });

  it("renders the snapshot usage chips: 'In your life' for uses, 'Resting' for not_uses", async () => {
    resultItemRepo.findByResult.mockResolvedValue([
      { id: "ri_top", itemId: "i_top", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null, usage: null },
      { id: "ri_high", itemId: "i_high", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null, usage: "uses" },
      { id: "ri_med", itemId: "i_med", computedRank: 3, manualRank: null, computedBucket: "medium", manualBucket: null, usage: "not_uses" },
    ]);
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.getByText("In your life")).toBeInTheDocument();
    expect(screen.getByText("Resting")).toBeInTheDocument();
  });

  it("renders NO chip when the snapshot usage is undecided (NULL) on a ranked row", async () => {
    resultItemRepo.findByResult.mockResolvedValue([
      { id: "ri_top", itemId: "i_top", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null, usage: null },
      { id: "ri_high", itemId: "i_high", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null, usage: null },
    ]);
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.queryByText("In your life")).toBeNull();
    expect(screen.queryByText("Resting")).toBeNull();
  });

  it("a legacy result whose rows have NO usage field renders no chip (backward compat)", async () => {
    // Pre-Epic-S rows never carried a `usage` key at all.
    resultItemRepo.findByResult.mockResolvedValue([
      { id: "ri_top", itemId: "i_top", computedRank: 1, manualRank: null, computedBucket: "top", manualBucket: null },
      { id: "ri_high", itemId: "i_high", computedRank: 2, manualRank: null, computedBucket: "high", manualBucket: null },
    ]);
    const ui = await ResultDetailPage({ params: Promise.resolve({ id: "summer-bags", resultNumber: "1" }) });
    render(ui);
    expect(screen.queryByText("In your life")).toBeNull();
    expect(screen.queryByText("Resting")).toBeNull();
  });
});
