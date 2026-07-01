// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, itemRepo, photoRepo, membershipRepo } = vi.hoisted(
  () => ({
    mockGetSession: vi.fn(),
    mockRequireAccess: vi.fn(),
    itemRepo: { findByCollectionAndNumber: vi.fn() },
    photoRepo: { findByItem: vi.fn() },
    membershipRepo: { findByUser: vi.fn() },
  }),
);

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
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(function () { return membershipRepo; }) }));

import ItemDetailPage from "./page";

const COLLECTION = { id: "coll_01ABCDEF", slug: "summer-bags", name: "Summer Bags", ownerId: "u1" };
const ITEM = {
  id: "item_1",
  collectionId: "coll_01ABCDEF",
  number: 7,
  name: "Bag",
  brand: "Acme",
  style: null,
  color: null,
  material: null,
  category: null,
  notes: null,
  story: null,
  status: "active",
};
const photo = (id: string, isHero = false) => ({
  id,
  itemId: "item_1",
  collectionId: "coll_01ABCDEF",
  rotation: 0,
  isHero,
  createdAt: new Date(),
  updatedAt: new Date(),
});

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue(COLLECTION);
  itemRepo.findByCollectionAndNumber.mockResolvedValue(ITEM);
  photoRepo.findByItem.mockResolvedValue([photo("p1", true), photo("p2")]);
  membershipRepo.findByUser.mockResolvedValue(null); // owner by default (COLLECTION.ownerId === u1)
});

const renderPage = async () => render(await ItemDetailPage({ params: { id: "summer-bags", itemNumber: "7" } }));

describe("ItemDetailPage redesign (carousel + info card)", () => {
  it("renders the photo carousel and the Details card with a contextual edit link", async () => {
    await renderPage();
    expect(screen.getByRole("group", { name: /photos of/i })).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /edit details/i })).toHaveAttribute(
      "href",
      "/collections/summer-bags/items/7/edit",
    );
  });

  it("drops the old Hero-centric layout (no h-96 hero box, no 'No hero photo' copy)", async () => {
    const { container } = await renderPage();
    expect(container.querySelector(".h-96")).toBeNull();
    expect(screen.queryByText(/no hero photo/i)).not.toBeInTheDocument();
  });

  it("requests the carousel image via the collection ULID (not the slug)", async () => {
    await renderPage();
    const src = (screen.getByRole("img") as HTMLImageElement).getAttribute("src") ?? "";
    expect(src).toContain("coll_01ABCDEF");
    expect(src).not.toContain("summer-bags");
  });

  it("shows the per-photo delete control to the owner", async () => {
    await renderPage();
    expect(screen.getAllByRole("button", { name: /delete this photo/i }).length).toBeGreaterThan(0);
  });

  it("leads with the keepsake card when a story is present, escaping HTML as literal text (Epic 2)", async () => {
    // XSS guard: a story containing an <img onerror> must render as TEXT, never as
    // an injected element — React auto-escapes the child, no dangerouslySetInnerHTML.
    const payload = '<img src=x onerror=alert(1)>';
    itemRepo.findByCollectionAndNumber.mockResolvedValue({ ...ITEM, story: payload });
    const { container } = await renderPage();

    expect(screen.getByRole("heading", { name: /where will it go next\?/i })).toBeInTheDocument();
    expect(screen.getByText(/a keepsake, kept after the choice/i)).toBeInTheDocument();
    // The payload appears verbatim as text…
    expect(screen.getByText(payload)).toBeInTheDocument();
    // …and NO img[onerror] / script was injected from it.
    expect(container.querySelector("img[onerror]")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
  });

  it("shows no keepsake card and no forward-framed heading when the story is empty (Epic 2)", async () => {
    itemRepo.findByCollectionAndNumber.mockResolvedValue({ ...ITEM, story: "   " });
    await renderPage();
    expect(screen.queryByText(/where will it go next\?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/a keepsake, kept after the choice/i)).not.toBeInTheDocument();
  });

  it("invites naming a nameless item — no 'Incomplete'/percentage framing (Epic 2 tone)", async () => {
    itemRepo.findByCollectionAndNumber.mockResolvedValue({ ...ITEM, name: null });
    await renderPage();
    expect(screen.getByRole("link", { name: /add a name/i })).toBeInTheDocument();
    expect(screen.queryByText(/incomplete/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it("shows the delete control to a curator member (any member may delete — role model, not flags)", async () => {
    // This assertion is NOT stricter than the API — it matches it exactly. The photos
    // DELETE route gates on requireApiCapability("photos:write"), and CAPABILITIES
    // ["photos:write"] = "curator", which resolveEffectiveRole grants to the owner or
    // any membership row. The page's canDeletePhotos (ownerId === user || membership)
    // mirrors that boundary, so the control is visible to exactly the set the API lets
    // delete: owner-or-curator. Flags are gone; role is the sole model.
    mockRequireAccess.mockResolvedValue({ ...COLLECTION, ownerId: "someone_else" });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1", role: "curator" });
    await renderPage();
    expect(screen.getAllByRole("button", { name: /delete this photo/i }).length).toBeGreaterThan(0);
  });
});
