// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import type { Collection, Item } from "@/types";

const { mockGetSession, mockRequireAccess, itemController, photoController } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemController: { listItems: vi.fn() },
  photoController: { findCoverPhotosByItemIds: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/api/items", () => ({ ItemController: { fromDb: () => itemController } }));
vi.mock("@/server/api/photos", () => ({ PhotoController: { fromDb: () => photoController } }));

import ItemsPage from "./page";

const COLLECTION_ID = "coll_01ABC";

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

function makeItem(number: number, name: string | null, status = "active"): Item {
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
    status,
    notes: null,
    createdAt: new Date("2026-06-01T00:00:00Z"),
    updatedAt: new Date("2026-06-01T00:00:00Z"),
    deletedAt: null,
  };
}

// A named active item, an unnamed active item (#2), and an archived named item.
const NAMED = makeItem(1, "Tote");
const UNNAMED = makeItem(2, null);
const ARCHIVED = makeItem(3, "Old clutch", "archived");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(makeCollection());
  itemController.listItems.mockResolvedValue([NAMED, UNNAMED, ARCHIVED]);
  photoController.findCoverPhotosByItemIds.mockResolvedValue(new Map());
});

async function renderPage(searchParams?: { status?: string; unnamed?: string }) {
  const ui = await ItemsPage({
    params: Promise.resolve({ id: "summer-bags" }),
    searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
  });
  return render(ui);
}

describe("/collections/[id]/items owns its status/unnamed query state", () => {
  it("no query: shows the full grid (every status, named + unnamed)", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: "Tote" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "#2" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Old clutch" })).toBeInTheDocument();
  });

  it("?status=archived filters the grid to archived items", async () => {
    await renderPage({ status: "archived" });
    expect(screen.getByRole("link", { name: "Old clutch" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tote" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "#2" })).not.toBeInTheDocument();
    // the Archived filter is the selected (primary) control, and its link keeps status=archived
    const archived = screen.getByRole("link", { name: "Archived" });
    expect(archived.querySelector("button")?.className).toContain("bg-primary");
    expect(archived).toHaveAttribute("href", "/collections/summer-bags/items?status=archived");
  });

  it("?unnamed=1 filters the grid to items waiting for a name", async () => {
    await renderPage({ unnamed: "1" });
    expect(screen.getByRole("link", { name: "#2" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Tote" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old clutch" })).not.toBeInTheDocument();
    // the toggle is selected (primary) and, when on, links back to dropping the flag
    const toggle = screen.getByRole("link", { name: "Unnamed, waiting for a name" });
    expect(toggle.querySelector("button")?.className).toContain("bg-primary");
    expect(toggle).toHaveAttribute("href", "/collections/summer-bags/items");
  });

  it("status + unnamed compose (archived AND waiting for a name → empty grid, gentle state)", async () => {
    await renderPage({ status: "archived", unnamed: "1" });
    // ARCHIVED has a name, so nothing matches; the calm empty state shows, not a card.
    expect(screen.queryByRole("link", { name: "Old clutch" })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Everything has a name" })).toBeInTheDocument();
  });
});

describe("durable /items labels are sentence case (governed allowlist, asserted once)", () => {
  it("renders the governed labels by role + accessible name and no legacy casing", async () => {
    await renderPage();
    // sentence-case action + the gentle person-side filter state
    expect(screen.getByRole("link", { name: "Add item" })).toHaveAttribute(
      "href",
      "/collections/summer-bags/items/new",
    );
    expect(screen.getByRole("link", { name: "Unnamed, waiting for a name" })).toBeInTheDocument();
    // legacy Title Case is gone
    expect(screen.queryByRole("link", { name: "Add Item" })).not.toBeInTheDocument();
  });

  it("empty collection's add action is also sentence case", async () => {
    itemController.listItems.mockResolvedValue([]);
    await renderPage();
    // header button + empty-state action both render; both must be sentence case.
    const adds = screen.getAllByRole("link", { name: "Add item" });
    expect(adds.length).toBeGreaterThan(0);
    adds.forEach((a) =>
      expect(a).toHaveAttribute("href", "/collections/summer-bags/items/new"),
    );
    expect(screen.queryByRole("link", { name: "Add Item" })).not.toBeInTheDocument();
  });
});
