// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";

const { mockGetSession, mockRequireAccess, photoRepo, itemRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockRequireAccess: vi.fn(),
  photoRepo: { findPoolByCollection: vi.fn() },
  itemRepo: { findByCollection: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/collection-access", () => ({ requireCollectionAccess: mockRequireAccess }));
vi.mock("@/components/layout", () => ({ AppLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({ PhotoRepository: vi.fn(function () { return photoRepo; }) }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({ ItemRepository: vi.fn(function () { return itemRepo; }) }));
vi.mock("@/features/pool/PoolUpload", () => ({ PoolUpload: () => <div data-testid="pool-upload" /> }));
vi.mock("@/features/pool/PoolPhotoGrid", () => ({ PoolPhotoGrid: () => <div data-testid="pool-photo-grid" /> }));

import PoolPage from "./page";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  mockRequireAccess.mockResolvedValue({
    id: "coll_01ABC",
    slug: "summer-bags",
    name: "Summer Bags",
    ownerId: "u1",
  });
  photoRepo.findPoolByCollection.mockResolvedValue([]);
  itemRepo.findByCollection.mockResolvedValue([]);
});

describe("pool page intro copy", () => {
  it("uses the gentler no-rush framing, not the old machine-voiced 'Dump everything' line", async () => {
    render(await PoolPage({ params: Promise.resolve({ id: "summer-bags" }) }));

    expect(
      screen.getByText(/drop them in now.*name and group them whenever, or never/i),
    ).toBeInTheDocument();
    expect(screen.queryByText(/dump everything/i)).not.toBeInTheDocument();
  });
});

describe("pool page workspace mode chips", () => {
  it("marks Build as the current section — aria-current='true', not 'page' (the chip links to the workspace root)", async () => {
    render(await PoolPage({ params: Promise.resolve({ id: "summer-bags" }) }));

    // Page-owned facts only: chips wired with the right mode + non-exact
    // aria-current. Chip internals (hrefs, register) are pinned by
    // WorkspaceModeChips.test.tsx.
    const nav = screen.getByRole("navigation", { name: "Workspace mode" });
    expect(within(nav).getByRole("link", { name: "Build" })).toHaveAttribute(
      "aria-current",
      "true",
    );
  });
});
