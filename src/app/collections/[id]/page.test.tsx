// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { Collection, Item, Photo, Session } from "@/types";

const { mockGetSession, mockRequireAccess, photoRepo, itemRepo, sessionRepo, prefRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  photoRepo: { findPoolByCollection: vi.fn(), findCoverPhotosByItemIds: vi.fn() },
  itemRepo: { findByCollection: vi.fn(), findArchivedByCollection: vi.fn() },
  sessionRepo: { findByCollectionAndCurator: vi.fn() },
  prefRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/collections/summer-bags",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(function () { return photoRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({ CollectionPreferenceItemRepository: vi.fn(function () { return prefRepo; }) }));

import CollectionPage from "./page";

const COLLECTION_ID = "coll_01ABC";

// Mock returns are shaped by the real domain types so the contract can't drift.
function makeCollection(overrides: Partial<Collection> = {}): Collection {
  return {
    id: COLLECTION_ID,
    ownerId: "u1",
    name: "Summer Bags",
    slug: "summer-bags",
    description: null,
    status: "active",
    createdAt: new Date("2026-06-28T00:00:00Z"),
    updatedAt: new Date("2026-06-28T00:00:00Z"),
    deletedAt: null,
    ...overrides,
  };
}

function makePoolPhoto(id: string): Photo {
  return {
    id,
    itemId: null,
    collectionId: COLLECTION_ID,
    blobKey: `blob/${id}`,
    filename: `${id}.jpg`,
    mimeType: "image/jpeg",
    fileSize: 1000,
    uploadedBy: "u1",
    isHero: false,
    rotation: 0,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    deletedAt: null,
  };
}

function makeItem(number: number, name: string): Item {
  return {
    id: `item_${number}`,
    collectionId: COLLECTION_ID,
    name,
    brand: null,
    style: null,
    color: null,
    material: null,
    category: null,
    number,
    height: null,
    width: null,
    depth: null,
    weight: null,
    unit: "in",
    status: "active",
    notes: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    deletedAt: null,
  };
}

function makeSession(number: number): Session {
  return {
    id: "sess_zzz",
    collectionId: COLLECTION_ID,
    curatorId: "u1",
    number,
    status: "active",
    goal: "Go",
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    deletedAt: null,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  // Arg-sensitive on purpose: the page must pass the AWAITED route param to the
  // guard. A sync-params regression (reading .id off the Promise) feeds this
  // mock `undefined` and reds the whole file — the unit tier's only non-vacuous
  // async-params oracle (Next's own .next/types validator collapses to `any`).
  mockRequireAccess.mockImplementation((_db, id) => {
    if (id !== "summer-bags") {
      throw new Error(`requireCollectionAccess received ${String(id)} — expected the awaited route param`);
    }
    return Promise.resolve(makeCollection());
  });
  photoRepo.findPoolByCollection.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
  itemRepo.findByCollection.mockResolvedValue([]);
  itemRepo.findArchivedByCollection.mockResolvedValue([]);
  sessionRepo.findByCollectionAndCurator.mockResolvedValue([]);
  prefRepo.findByCollection.mockResolvedValue([]);
});

async function renderPage(searchParams?: Record<string, string | string[]>) {
  const ui = await CollectionPage({
    params: Promise.resolve({ id: "summer-bags" }),
    searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
  });
  return render(ui);
}
const bar = () => screen.getByRole("region", { name: "Next step" });
const openMenu = () => fireEvent.click(screen.getByRole("button", { name: "More for Summer Bags" }));

describe("the home is the items grid", () => {
  it("lists every live item as a card linking to its panel, with the tier chip once sorted", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote"), makeItem(2, "Clutch")]);
    prefRepo.findByCollection.mockResolvedValue([{ itemId: "item_1", rankBucket: "top" }]);
    await renderPage();
    expect(screen.getByRole("link", { name: "Tote" })).toHaveAttribute("href", "/collections/summer-bags/items/1");
    expect(screen.getByRole("link", { name: "Clutch" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Love" })).toBeInTheDocument();
    // Every live item, in number order — the repository only sorts when asked; no preview bound.
    expect(itemRepo.findByCollection).toHaveBeenCalledWith(COLLECTION_ID, { orderBy: "number" });
    expect(screen.queryByRole("link", { name: "View all items" })).not.toBeInTheDocument();
    // TONE: the home never counts.
    expect(screen.queryByText(/\d+ items?\b/)).not.toBeInTheDocument();
  });

  it("Archived lists soft-deleted items with Bring back and no panel link", async () => {
    itemRepo.findArchivedByCollection.mockResolvedValue([makeItem(3, "Old clutch")]);
    await renderPage({ status: "archived" });
    expect(screen.getByText("Old clutch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bring back" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old clutch" })).not.toBeInTheDocument();
  });

  it("search narrows the grid, keeps the query, and the pills link back to the home with it", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote"), makeItem(2, "Clutch")]);
    await renderPage({ q: "tote" });
    expect(screen.getByRole("link", { name: "Tote" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Clutch" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("tote");
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("href", "/collections/summer-bags?status=archived&q=tote");
  });

  it("ignores a repeated q key, caps the query at 100, and a miss offers Clear search", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    await renderPage({ q: ["a", "b"] });
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("");
    document.body.innerHTML = "";
    await renderPage({ q: "x".repeat(150) });
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("x".repeat(100));
    document.body.innerHTML = "";
    await renderPage({ unnamed: "1", q: "zzz" });
    expect(screen.getByRole("heading", { name: "Nothing matches “zzz”" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/collections/summer-bags?unnamed=1");
  });

  it("shows the undo notice only for an archived item of this collection", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    itemRepo.findArchivedByCollection.mockResolvedValue([makeItem(9, "Old clutch")]);
    await renderPage({ removed: "item_9" });
    expect(screen.getByRole("status")).toHaveTextContent(/^Archived\./);
    expect(itemRepo.findArchivedByCollection).toHaveBeenCalledWith(COLLECTION_ID); // scoped to THIS collection
    for (const removed of [
      "item_1" /* still live: a stale link */,
      "item_77" /* not an archived item of this collection */,
      "../collections/x/archive#" /* not id-shaped */,
    ]) {
      document.body.innerHTML = "";
      await renderPage({ removed });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });

  it("every item archived: the All view points at Archived instead of 'No items yet'", async () => {
    itemRepo.findArchivedByCollection.mockResolvedValue([makeItem(9, "Old clutch")]);
    await renderPage();
    expect(screen.getByRole("heading", { name: "Everything here is archived" })).toBeInTheDocument();
  });
});

describe("one primary action, in the Next step bar", () => {
  it("items and no sort: Start sorting leads, Add photos is the pill beside it", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    const { container } = await renderPage();
    const start = within(bar()).getByRole("button", { name: "Start sorting" });
    expect(start.className).toContain("bg-primary");
    // The bar is fixed below md, so the primary must fill it up to md (not stop at sm).
    expect(start.className).toContain("md:w-auto");
    expect(within(bar()).getByRole("link", { name: "Add photos" })).toHaveAttribute("href", "/collections/summer-bags/pool");
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });

  it("an open sort reads Keep sorting, paused or not", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    for (const status of ["active", "paused"] as const) {
      document.body.innerHTML = "";
      sessionRepo.findByCollectionAndCurator.mockResolvedValue([{ ...makeSession(5), status }]);
      await renderPage();
      expect(within(bar()).getByRole("button", { name: "Keep sorting" })).toBeInTheDocument();
    }
  });

  it("pool photos and no items: Make items leads; the strip shows the photos without a second link", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1"), makePoolPhoto("ph_2")]);
    const { container } = await renderPage();
    expect(within(bar()).getByRole("link", { name: "Make items" })).toHaveAttribute("href", "/collections/summer-bags/pool");
    expect(screen.getAllByRole("link", { name: "Make items" })).toHaveLength(1);
    const strip = screen.getByRole("region", { name: "Photos waiting" });
    // The thumbnails are one link to the pool, named by the heading (Make items text stays once).
    expect(within(strip).getByRole("link", { name: "Photos waiting" })).toHaveAttribute("href", "/collections/summer-bags/pool");
    expect(screen.queryByRole("button", { name: /sorting/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "No items yet" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });

  it("pool photos and items: the strip's quiet Make items link appears beside Start sorting", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1")]);
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    await renderPage();
    expect(within(bar()).getByRole("button", { name: "Start sorting" })).toBeInTheDocument();
    const strip = screen.getByRole("region", { name: "Photos waiting" });
    expect(within(strip).getByRole("link", { name: "Make items" }).className).not.toContain("bg-primary");
    expect(within(strip).queryByRole("link", { name: "Photos waiting" })).not.toBeInTheDocument();
    // Decorative thumbnails: the link carries the meaning.
    expect(within(strip).queryAllByRole("img")).toHaveLength(0);
  });

  it("empty: Add photos is the only action, and the empty state has no button of its own", async () => {
    const { container } = await renderPage();
    expect(within(bar()).getByRole("link", { name: "Add photos" }).className).toContain("bg-primary");
    expect(screen.getAllByRole("link", { name: "Add photos" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "No items yet" })).toBeInTheDocument();
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });
});

describe("header: See your ranking and the ··· menu", () => {
  it("See your ranking appears once something is placed or a sort finished, not for a fresh open sort", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    prefRepo.findByCollection.mockResolvedValue([{ itemId: "item_1", rankBucket: "high" }]);
    await renderPage();
    expect(screen.getByRole("link", { name: "See your ranking" })).toHaveAttribute("href", "/collections/summer-bags/results");
    document.body.innerHTML = "";
    prefRepo.findByCollection.mockResolvedValue([]);
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([makeSession(5)]);
    await renderPage();
    expect(screen.queryByRole("link", { name: "See your ranking" })).not.toBeInTheDocument();
  });

  it("the owner's menu: Add item, Collection settings, Members", async () => {
    await renderPage();
    openMenu();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Add item", "Collection settings", "Members"]);
  });

  it("a curator's menu offers Add item only", async () => {
    mockRequireAccess.mockResolvedValue(makeCollection({ ownerId: "someone-else" }));
    await renderPage();
    openMenu();
    expect(screen.getAllByRole("menuitem").map((m) => m.textContent)).toEqual(["Add item"]);
  });
});

describe("access before any query", () => {
  it("an inaccessible collection renders nothing and reads nothing", async () => {
    mockRequireAccess.mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(CollectionPage({ params: Promise.resolve({ id: "summer-bags" }) })).rejects.toThrow();
    expect(photoRepo.findPoolByCollection).not.toHaveBeenCalled();
    expect(itemRepo.findByCollection).not.toHaveBeenCalled();
    expect(itemRepo.findArchivedByCollection).not.toHaveBeenCalled();
    expect(sessionRepo.findByCollectionAndCurator).not.toHaveBeenCalled();
  });

  it("hrefs use the slug, never a raw ULID, and sessions are this curator's own", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([makeSession(5)]);
    await renderPage();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.every((h) => !h.includes(COLLECTION_ID) && !h.includes("sess_zzz"))).toBe(true);
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledWith(COLLECTION_ID, "u1");
  });
});
