// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Collection, Item, Photo, Session } from "@/types";

const { mockGetSession, mockRequireAccess, photoRepo, itemRepo, sessionRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  photoRepo: { findPoolByCollection: vi.fn(), findCoverPhotosByItemIds: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
  sessionRepo: { findByCollectionAndCurator: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  // ActiveSessionPanel is a client island that calls useRouter.
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(function () { return photoRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));

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
  mockRequireAccess.mockResolvedValue(makeCollection());
  photoRepo.findPoolByCollection.mockResolvedValue([]);
  photoRepo.findCoverPhotosByItemIds.mockResolvedValue(new Map());
  itemRepo.findByCollection.mockResolvedValue([]);
  sessionRepo.findByCollectionAndCurator.mockResolvedValue([]);
});

async function renderPage() {
  const ui = await CollectionPage({ params: { id: "summer-bags" } });
  return render(ui);
}

describe("adaptive workspace states", () => {
  it("pool-first: shows the photo pool and routes its action to /pool", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1"), makePoolPhoto("ph_2")]);
    await renderPage();

    expect(screen.getByRole("heading", { name: "Photo pool" })).toBeInTheDocument();
    const makeItems = screen.getByRole("link", { name: "Make items" });
    expect(makeItems).toHaveAttribute("href", "/collections/summer-bags/pool");
  });

  it("pool-first with both: renders Photo pool before Items and still renders the item preview", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1")]);
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote"), makeItem(2, "Clutch")]);
    await renderPage();

    const poolRegion = screen.getByRole("region", { name: "Photo pool" });
    const itemsRegion = screen.getByRole("region", { name: "Items" });
    // pool precedes items in document order
    expect(
      poolRegion.compareDocumentPosition(itemsRegion) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    // the item preview is still rendered (item card links to its detail route)
    expect(screen.getByRole("link", { name: "Tote" })).toHaveAttribute(
      "href",
      "/collections/summer-bags/items/1",
    );
    // and the full items route is linked
    expect(screen.getByRole("link", { name: "View all items" })).toHaveAttribute(
      "href",
      "/collections/summer-bags/items",
    );
  });

  it("items-first: exactly one dominant action (Add photos); Add item + View all items are secondary", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    // No session, so the Continue panel's primary Resume button is absent.
    const { container } = await renderPage();

    const addPhotos = screen.getByRole("link", { name: "Add photos" });
    expect(addPhotos).toHaveAttribute("href", "/collections/summer-bags/pool");
    expect(addPhotos.className).toContain("bg-primary"); // dominant (primary button)

    // The other two item actions exist but are NOT peer primaries.
    const addItem = screen.getByRole("link", { name: "Add item" });
    const viewAll = screen.getByRole("link", { name: "View all items" });
    expect(addItem).toHaveAttribute("href", "/collections/summer-bags/items/new");
    expect(viewAll).toHaveAttribute("href", "/collections/summer-bags/items");
    expect(addItem.className).not.toContain("bg-primary");
    expect(viewAll.className).not.toContain("bg-primary");

    // Exactly one dominant (primary-styled) action on the page.
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });

  it("empty: exactly one add-photos action and no pool/items sections", async () => {
    const { container } = await renderPage();

    const addPhotos = screen.getByRole("link", { name: "Add photos" });
    expect(addPhotos).toHaveAttribute("href", "/collections/summer-bags/pool");
    expect(screen.queryByRole("heading", { name: "Photo pool" })).not.toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Items" })).not.toBeInTheDocument();
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
  });
});

describe("owner utilities visibility and access gating", () => {
  it("owner sees Collection settings and Members", async () => {
    mockRequireAccess.mockResolvedValue(makeCollection({ ownerId: "u1" }));
    await renderPage();

    expect(screen.getByRole("link", { name: "Collection settings" })).toHaveAttribute(
      "href",
      "/collections/summer-bags/edit",
    );
    expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute(
      "href",
      "/collections/summer-bags/members",
    );
  });

  it("curator / non-owner does not see owner utilities", async () => {
    mockRequireAccess.mockResolvedValue(makeCollection({ ownerId: "someone-else" }));
    await renderPage();

    expect(screen.queryByRole("link", { name: "Collection settings" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Members" })).not.toBeInTheDocument();
  });

  it("inaccessible collection renders no workspace data AND does not call the preview repositories", async () => {
    // requireCollectionAccess redirects (throws) for a collection the user can't reach.
    mockRequireAccess.mockRejectedValue(new Error("NEXT_REDIRECT"));

    await expect(CollectionPage({ params: { id: "summer-bags" } })).rejects.toThrow();

    // Access-before-query invariant (spec §7): no preview ran.
    expect(photoRepo.findPoolByCollection).not.toHaveBeenCalled();
    expect(itemRepo.findByCollection).not.toHaveBeenCalled();
    expect(photoRepo.findCoverPhotosByItemIds).not.toHaveBeenCalled();
  });
});

describe("accessibility and governed labels", () => {
  it("decorative pool preview images expose no alt text", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1"), makePoolPhoto("ph_2")]);
    await renderPage();

    const poolRegion = screen.getByRole("region", { name: "Photo pool" });
    const imgs = poolRegion.querySelectorAll("img");
    expect(imgs.length).toBeGreaterThan(0);
    imgs.forEach((img) => expect(img.getAttribute("alt")).toBe(""));
    // decorative images are not in the a11y tree
    expect(within(poolRegion).queryAllByRole("img")).toHaveLength(0);
  });

  it("governed labels use sentence case, asserted once by role + accessible name", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1")]);
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([makeSession(5)]);
    await renderPage();

    for (const name of ["Photo pool", "Items", "Continue"]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
    for (const name of ["Make items", "Add more photos", "View all items", "Results", "Collection settings", "Members"]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    // legacy dashboard copy is gone
    expect(screen.queryByText("Finalized")).not.toBeInTheDocument();
    expect(screen.queryByText(/Manage/)).not.toBeInTheDocument();
  });
});

describe("navigation links", () => {
  it("uses slug for nav links and resume; no raw ULIDs in hrefs", async () => {
    photoRepo.findPoolByCollection.mockResolvedValue([makePoolPhoto("ph_1")]);
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    sessionRepo.findByCollectionAndCurator.mockResolvedValue([makeSession(5)]);
    await renderPage();

    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs).toContain("/collections/summer-bags/items");
    expect(hrefs).toContain("/collections/summer-bags/sort/5"); // active session resume
    expect(hrefs.every((h) => !h.includes(COLLECTION_ID))).toBe(true);
    expect(hrefs.every((h) => !h.includes("sess_zzz"))).toBe(true);
    // purses-t9l: the active-session affordance is scoped to THIS user's sessions.
    expect(sessionRepo.findByCollectionAndCurator).toHaveBeenCalledWith(COLLECTION_ID, "u1");
  });
});
