// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Collection, Item } from "@/types";

const { mockGetSession, mockRequireAccess, itemController, photoController, preferenceController } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemController: { listItems: vi.fn(), listArchived: vi.fn() },
  photoController: { findCoverPhotosByItemIds: vi.fn() },
  preferenceController: { listItemPreferences: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(),
  useRouter: () => ({ refresh: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/api/items", () => ({ ItemController: { fromDb: () => itemController } }));
vi.mock("@/server/api/photos", () => ({ PhotoController: { fromDb: () => photoController } }));
vi.mock("@/server/api/preferences", () => ({ PreferenceController: { fromDb: () => preferenceController } }));

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

// A named live item, an unnamed live item (#2), and a soft-deleted (archived) item.
const NAMED = makeItem(1, "Tote");
const UNNAMED = makeItem(2, null);
const ARCHIVED = makeItem(3, "Old clutch");

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(makeCollection());
  itemController.listItems.mockResolvedValue([NAMED, UNNAMED]);
  itemController.listArchived.mockResolvedValue([ARCHIVED]);
  preferenceController.listItemPreferences.mockResolvedValue([{ itemId: "item_1", rankBucket: "top" }]);
  photoController.findCoverPhotosByItemIds.mockResolvedValue(new Map());
});

async function renderPage(searchParams?: { status?: string; unnamed?: string; q?: string }) {
  const ui = await ItemsPage({
    params: Promise.resolve({ id: "summer-bags" }),
    searchParams: searchParams ? Promise.resolve(searchParams) : undefined,
  });
  return render(ui);
}

describe("/collections/[id]/items: card grid, search, and the All / Archived / Waiting for a name pills", () => {
  it("All: live items as cards linking to the panel, with a tier chip once sorted", async () => {
    await renderPage();
    expect(screen.getByRole("link", { name: "Tote" })).toHaveAttribute("href", "/collections/summer-bags/items/1");
    // The dots are named by the tier, not read out as "black circle" ×4.
    expect(screen.getByRole("img", { name: "Love" })).toHaveTextContent("●●●●");
    expect(screen.queryByText("Old clutch")).not.toBeInTheDocument();
    expect(itemController.listArchived).not.toHaveBeenCalled();
  });

  it("Archived: lists soft-deleted items with Bring back and no panel link", async () => {
    await renderPage({ status: "archived" });
    expect(screen.getByText("Old clutch")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Bring back" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old clutch" })).not.toBeInTheDocument();
    expect(preferenceController.listItemPreferences).not.toHaveBeenCalled();
  });

  it("search narrows the grid and keeps the query in the field", async () => {
    await renderPage({ q: "tote" });
    expect(screen.getByRole("link", { name: "Tote" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "#2" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search your items" })).toHaveValue("tote");
  });

  it("names the collection and never counts the items", async () => {
    await renderPage();
    expect(screen.getByRole("heading", { level: 1, name: "Summer Bags" })).toBeInTheDocument();
    expect(screen.queryByText(/\d+ items?\b/)).not.toBeInTheDocument();
  });
});

describe("/items is a section index: lateral mode chips (wayfinding invariant 3)", () => {
  it("renders the Build/Sort/Decide chips with Build current-section (aria-current=\"true\", not \"page\")", async () => {
    await renderPage();
    const nav = screen.getByRole("navigation", { name: "Workspace mode" });
    expect(within(nav).getByRole("link", { name: "Build" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
