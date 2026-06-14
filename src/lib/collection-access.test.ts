import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockRedirect, collectionRepo, membershipRepo } = vi.hoisted(() => ({
  // redirect() in Next stops execution by throwing — emulate that with a
  // sentinel so the helper can't fall through after a redirect.
  mockRedirect: vi.fn(() => {
    throw new Error("REDIRECT");
  }),
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
}));

vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn(() => collectionRepo),
}));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn(() => membershipRepo),
}));

import { requireCollectionAccess } from "./collection-access";

const db = {} as never;

describe("requireCollectionAccess", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the collection for the owner (no membership row)", async () => {
    const collection = { id: "col-1", ownerId: "user-1", name: "Mine" };
    collectionRepo.findById.mockResolvedValue(collection);
    membershipRepo.findByUser.mockResolvedValue(null);

    const result = await requireCollectionAccess(db, "col-1", "user-1");

    expect(result).toBe(collection);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("returns the collection for a member who is not the owner", async () => {
    const collection = { id: "col-1", ownerId: "owner-9", name: "Shared" };
    collectionRepo.findById.mockResolvedValue(collection);
    membershipRepo.findByUser.mockResolvedValue({ id: "mem-1", userId: "user-1" });

    const result = await requireCollectionAccess(db, "col-1", "user-1");

    expect(result).toBe(collection);
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("redirects to /collections when the collection does not exist", async () => {
    collectionRepo.findById.mockResolvedValue(null);
    membershipRepo.findByUser.mockResolvedValue(null);

    await expect(requireCollectionAccess(db, "missing", "user-1")).rejects.toThrow("REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/collections");
  });

  it("redirects to /collections when the user is neither member nor owner", async () => {
    collectionRepo.findById.mockResolvedValue({ id: "col-1", ownerId: "owner-9", name: "Theirs" });
    membershipRepo.findByUser.mockResolvedValue(null);

    await expect(requireCollectionAccess(db, "col-1", "user-1")).rejects.toThrow("REDIRECT");
    expect(mockRedirect).toHaveBeenCalledWith("/collections");
  });
});
