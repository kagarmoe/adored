// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const { mockGetSession, mockRequireAccess, itemRepo, photoRepo, decisions, sessions } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  itemRepo: { findByCollectionAndNumber: vi.fn() },
  photoRepo: { findByItem: vi.fn() },
  decisions: { listForCurator: vi.fn() },
  sessions: { listByCollectionAndCurator: vi.fn() },
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(function () { return photoRepo; }) }));
vi.mock("@/server/api/decisions", () => ({ DecisionController: { fromDb: () => decisions } }));
vi.mock("@/server/api/sessions", () => ({ SessionController: { fromDb: () => sessions } }));

import ItemDetailPage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags", ownerId: "u1" };
const ITEM = {
  id: "item_1", collectionId: "coll_01ABCDEF", number: 7, name: "Bag", brand: "Acme", style: null,
  color: null, material: null, category: null, notes: null, story: null, status: "active",
  height: null, width: null, depth: null, weight: null, unit: "imperial",
  createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
};
const photo = (id: string, isHero = false) => ({
  id, itemId: "item_1", collectionId: "coll_01ABCDEF", rotation: 0, isHero,
  createdAt: new Date(), updatedAt: new Date(),
});
const usage = (id: string, itemId: string, result: string, at: string) => ({
  id, type: "usage", decision: { itemId, result }, createdAt: new Date(at),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollectionAndNumber.mockResolvedValue(ITEM);
  photoRepo.findByItem.mockResolvedValue([photo("p1", true), photo("p2")]);
  decisions.listForCurator.mockResolvedValue([]);
  sessions.listByCollectionAndCurator.mockResolvedValue([]);
  global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }) as never;
});

const renderPage = async () => render(await ItemDetailPage({ params: Promise.resolve({ id: "summer-bags", itemNumber: "7" }) }));

describe("ItemDetailPage (photos + item panel)", () => {
  it("shows the photos (by collection ULID, deletable), the subtitle, and the editable panel", async () => {
    await renderPage();
    const src = screen.getByRole("img").getAttribute("src") ?? "";
    expect(src).toContain("coll_01ABCDEF");
    expect(src).not.toContain("summer-bags");
    expect(screen.getAllByRole("button", { name: /delete this photo/i }).length).toBeGreaterThan(0);
    expect(screen.getByText(/^#7 · added in /)).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveValue("Bag");
  });

  it("names a nameless item by its number, with no 'incomplete' framing", async () => {
    itemRepo.findByCollectionAndNumber.mockResolvedValue({ ...ITEM, name: null });
    await renderPage();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("#7");
    expect(screen.queryByText(/incomplete|missing|%/i)).not.toBeInTheDocument();
  });

  it("feeds the chip this item's latest answer and the curator's in-progress session", async () => {
    decisions.listForCurator.mockResolvedValue([
      usage("e1", "item_1", "not_uses", "2026-01-01"),
      usage("e2", "item_1", "uses", "2026-02-01"),
      usage("e3", "other", "not_uses", "2026-03-01"),
    ]);
    sessions.listByCollectionAndCurator.mockResolvedValue([
      { id: "s_done", status: "completed" },
      { id: "s_open", status: "paused" },
    ]);
    await renderPage();
    expect(screen.getByRole("button", { name: "I use this" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Resting" }));
    expect((global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/api/sessions/s_open/decisions");
  });
});
