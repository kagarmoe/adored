// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import type { Collection } from "@/types";

const { mockGetSession, collectionController, photoController, mockRedirect } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  collectionController: { listCollections: vi.fn() },
  photoController: { findCoverPhotosByCollectionIds: vi.fn(), findCollectionIdsWithPooledPhotos: vi.fn() },
  mockRedirect: vi.fn((url: string) => { throw new Error(`NEXT_REDIRECT:${url}`); }),
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "1" }) }) }));
vi.mock("next/navigation", () => ({
  redirect: mockRedirect,
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/collections",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/server/api/collections", () => ({ CollectionController: { fromDb: () => collectionController } }));
vi.mock("@/server/api/photos", () => ({ PhotoController: { fromDb: () => photoController } }));

import CollectionsPage from "./page";

const mk = (o: Partial<Collection>): Collection => ({
  id: "col_a", ownerId: "u1", name: "Summer bags", slug: "summer-bags", description: null, status: "active",
  createdAt: new Date(0), updatedAt: new Date(0), deletedAt: null, ...o,
});
const MINE = mk({});
const SHARED = mk({ id: "col_b", ownerId: "someone-else", name: "Mum's china", slug: "mums-china" });
const ARCHIVED = mk({ id: "col_c", name: "Old books", slug: "old-books", status: "archived" });

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  collectionController.listCollections.mockResolvedValue([MINE, SHARED, ARCHIVED]);
  photoController.findCoverPhotosByCollectionIds.mockResolvedValue(new Map());
  photoController.findCollectionIdsWithPooledPhotos.mockResolvedValue(new Set());
});

const renderPage = async (searchParams?: Record<string, string | string[]>) =>
  render(await CollectionsPage({ searchParams: searchParams ? Promise.resolve(searchParams) : undefined }));

describe("/collections: cover-card grid, search, All / Archived, owner ···", () => {
  it("All shows the active collections as cards; New collection is the one primary, in the Next step bar", async () => {
    const { container } = await renderPage();
    expect(screen.getByRole("link", { name: "Summer bags" })).toHaveAttribute("href", "/collections/summer-bags");
    expect(screen.getByRole("link", { name: "Mum's china" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Old books" })).not.toBeInTheDocument();
    const bar = screen.getByRole("region", { name: "Next step" });
    expect(within(bar).getByRole("link", { name: "New collection" })).toHaveAttribute("href", "/collections/new");
    expect(container.querySelectorAll(".bg-primary")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "All" })).toHaveAttribute("aria-current", "page");
    // Browser zoom shrinks the viewport below md AND short: never two fixed bands.
    expect(bar.className).toContain("[@media(max-height:500px)]:static");
  });

  it("Archived lists archived collections, with Bring back in the owner's menu", async () => {
    await renderPage({ status: "archived" });
    expect(screen.getByRole("link", { name: "Old books" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Summer bags" })).not.toBeInTheDocument();
    screen.getByRole("button", { name: "More for Old books" }).click();
    expect(await screen.findByRole("menuitem", { name: "Bring back" })).toBeInTheDocument();
  });

  it("owner cards get the ··· menu; a curator's card does not", async () => {
    await renderPage();
    expect(screen.getByRole("button", { name: "More for Summer bags" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "More for Mum's china" })).not.toBeInTheDocument();
  });

  it("search narrows the grid, keeps the query in the field, and the pills keep it", async () => {
    await renderPage({ q: "china" });
    expect(screen.getByRole("link", { name: "Mum's china" })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Summer bags" })).not.toBeInTheDocument();
    expect(screen.getByRole("searchbox", { name: "Search your collections" })).toHaveValue("china");
    expect(screen.getByRole("link", { name: "Archived" })).toHaveAttribute("href", "/collections?status=archived&q=china");
  });

  it("a search with no match offers a quiet Clear search back to the same view", async () => {
    await renderPage({ status: "archived", q: "zzz" });
    expect(screen.getByRole("heading", { name: "Nothing matches “zzz”" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Clear search" })).toHaveAttribute("href", "/collections?status=archived");
  });

  it("ignores a repeated q key and caps the query at 100 characters", async () => {
    await renderPage({ q: ["a", "b"] });
    expect(screen.getByRole("searchbox", { name: "Search your collections" })).toHaveValue("");
    await renderPage({ q: "x".repeat(150) });
    expect(screen.getAllByRole("searchbox", { name: "Search your collections" }).at(-1)).toHaveValue("x".repeat(100));
  });

  it("shows Undo only for the viewer's own collection that is archived now", async () => {
    const SHARED_ARCHIVED = mk({ id: "col_d", ownerId: "someone-else", name: "Their attic", status: "archived" });
    collectionController.listCollections.mockResolvedValue([MINE, SHARED, ARCHIVED, SHARED_ARCHIVED]);
    await renderPage({ removed: "col_c" });
    expect(screen.getByRole("status")).toHaveTextContent(/^Archived\./);
    for (const removed of [
      "col_a" /* restored already */,
      "col_zzz" /* not in their list */,
      "col_d" /* archived, but shared — not theirs to restore */,
      "../col_c/archive#" /* not id-shaped */,
    ]) {
      document.body.innerHTML = "";
      await renderPage({ removed });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });

  it("after Bring back, a focused line says where it went — only for the viewer's own, now-active collection", async () => {
    await renderPage({ status: "archived", restored: "col_a" });
    expect(screen.getByRole("status")).toHaveTextContent("Brought back. It’s under All.");
    for (const restored of ["col_c" /* still archived */, "col_b" /* shared */, "../x"]) {
      document.body.innerHTML = "";
      await renderPage({ status: "archived", restored });
      expect(screen.queryByRole("status")).not.toBeInTheDocument();
    }
  });

  it("reads covers and the pool cue for the visible collections only", async () => {
    await renderPage();
    expect(photoController.findCoverPhotosByCollectionIds).toHaveBeenCalledWith(["col_a", "col_b"]);
    expect(photoController.findCollectionIdsWithPooledPhotos).toHaveBeenCalledWith(["col_a", "col_b"]);
  });

  it("gentle empty state with no button inside it (the bar carries New collection)", async () => {
    collectionController.listCollections.mockResolvedValue([ARCHIVED]);
    await renderPage();
    expect(screen.getByRole("heading", { name: "Nothing here right now" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /collection/i }).map((l) => l.textContent)).toEqual(["New collection"]);
  });
});
