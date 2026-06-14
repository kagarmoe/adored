import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, membershipRepo, collectionRepo, createItemFromPool } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    membershipRepo: { findByUser: vi.fn() },
    collectionRepo: { findById: vi.fn() },
    createItemFromPool: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(() => membershipRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(() => collectionRepo),
}));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({
  ItemRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(() => ({})),
}));
vi.mock("@/server/services/ItemService", async () => {
  const actual = await vi.importActual<any>("@/server/services/ItemService");
  return {
    ...actual, // keep the real PoolGroupError class for instanceof mapping
    ItemService: vi.fn().mockImplementation(() => ({ createItemFromPool })),
  };
});

import { POST } from "./route";
import { PoolGroupError } from "@/server/services/ItemService";

function req(body: unknown) {
  return new Request("http://localhost/pool/group", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/collections/[id]/pool/group", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    createItemFromPool.mockResolvedValue({ id: "item_new", number: 7 });
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("404 when the collection does not exist", async () => {
    collectionRepo.findById.mockResolvedValue(null);
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(404);
  });

  it("403 when neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });

  it("400 when photoIds is missing or not a string array", async () => {
    const res = await POST(req({ photoIds: "nope" }), { params: { id: "c1" } });
    expect(res.status).toBe(400);
    expect(createItemFromPool).not.toHaveBeenCalled();
  });

  it("201 with the new item number on success", async () => {
    const res = await POST(req({ photoIds: ["p1", "p2"] }), { params: { id: "c1" } });
    expect(res.status).toBe(201);
    await expect(res.json()).resolves.toEqual({ number: 7 });
    expect(createItemFromPool).toHaveBeenCalledWith("c1", ["p1", "p2"]);
  });

  it("409 when the service reports a grouping conflict", async () => {
    createItemFromPool.mockRejectedValue(new PoolGroupError("conflict", "gone"));
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(409);
  });

  it("400 when the service rejects an oversized selection (too_many)", async () => {
    createItemFromPool.mockRejectedValue(new PoolGroupError("too_many", "too many"));
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(400);
  });

  it("allows the owner who has no membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(201);
  });

  it("400 when the request body is malformed JSON", async () => {
    const bad = new Request("http://localhost/pool/group", {
      method: "POST",
      body: "{not json",
    }) as any;
    const res = await POST(bad, { params: { id: "c1" } });
    expect(res.status).toBe(400);
    expect(createItemFromPool).not.toHaveBeenCalled();
  });

  it("re-throws a non-PoolGroupError instead of swallowing it", async () => {
    createItemFromPool.mockRejectedValue(new Error("boom"));
    await expect(
      POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } }),
    ).rejects.toThrow("boom");
  });
});
