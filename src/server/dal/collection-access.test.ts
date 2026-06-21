// src/server/dal/collection-access.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { collectionRepo, membershipRepo } = vi.hoisted(() => ({
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(function () { return collectionRepo; }) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(function () { return membershipRepo; }) }));

import { requireApiCollectionAccess, requireApiCollectionOwner } from "./collection-access";

const db = {} as any;

beforeEach(() => {
  vi.clearAllMocks();
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "owner" });
  membershipRepo.findByUser.mockResolvedValue(null);
});

describe("requireApiCollectionAccess", () => {
  it("returns the collection for a member", async () => {
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    const r = await requireApiCollectionAccess(db, "c1", "u1");
    expect(r).toEqual({ id: "c1", ownerId: "owner" });
  });
  it("returns the collection for the owner without a membership row", async () => {
    const r = await requireApiCollectionAccess(db, "c1", "owner");
    expect(r).toEqual({ id: "c1", ownerId: "owner" });
  });
  it("returns 404 when the collection does not exist", async () => {
    collectionRepo.findById.mockResolvedValue(null);
    const r = await requireApiCollectionAccess(db, "c1", "u1");
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(404);
  });
  it("returns 403 when neither member nor owner", async () => {
    const r = await requireApiCollectionAccess(db, "c1", "stranger");
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });
});

describe("requireApiCollectionOwner", () => {
  it("returns the collection for the owner", async () => {
    const r = await requireApiCollectionOwner(db, "c1", "owner");
    expect(r).toEqual({ id: "c1", ownerId: "owner" });
  });
  it("returns 403 for a member who is NOT the owner", async () => {
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    const r = await requireApiCollectionOwner(db, "c1", "member");
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });
  it("returns 403 for a non-member", async () => {
    const r = await requireApiCollectionOwner(db, "c1", "stranger");
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(403);
  });
  it("returns 404 when the collection does not exist", async () => {
    collectionRepo.findById.mockResolvedValue(null);
    const r = await requireApiCollectionOwner(db, "c1", "owner");
    expect(r).toBeInstanceOf(NextResponse);
    expect((r as NextResponse).status).toBe(404);
  });
});
