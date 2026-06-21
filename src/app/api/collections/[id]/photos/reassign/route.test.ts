import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockGetSession,
  mockGetDb,
  membershipRepo,
  collectionRepo,
  reassignPhotos,
} = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  membershipRepo: { findByUser: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  reassignPhotos: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(function () { return membershipRepo; }),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(function () { return collectionRepo; }),
}));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({
  ItemRepository: vi.fn().mockImplementation(function () { return ({}); }),
}));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(function () { return ({}); }),
}));
vi.mock("@/server/services/ItemService", async () => {
  const actual = await vi.importActual<any>("@/server/services/ItemService");
  return {
    ...actual, // keep the real PoolGroupError class for instanceof mapping
    ItemService: vi.fn().mockImplementation(function () { return ({ reassignPhotos }); }),
  };
});

import { POST } from "./route";
import { PoolGroupError } from "@/server/services/ItemService";

function req(body: unknown) {
  return new Request("http://localhost/photos/reassign", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any;
}

describe("POST /api/collections/[id]/photos/reassign", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    reassignPhotos.mockResolvedValue({ number: 7 });
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(401);
  });

  it("404 when the collection does not exist", async () => {
    collectionRepo.findById.mockResolvedValue(null);
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(404);
  });

  it("403 when neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(403);
  });

  it("allows the owner who has no membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(200);
  });

  it('200 for destination {type:"new"} and calls reassignPhotos with that dest', async () => {
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ number: 7 });
    expect(reassignPhotos).toHaveBeenCalledWith("c1", ["p1"], { type: "new" });
  });

  it('200 for destination {type:"item",itemId} and calls reassignPhotos with that dest', async () => {
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "item", itemId: "it1" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(200);
    expect(reassignPhotos).toHaveBeenCalledWith("c1", ["p1"], {
      type: "item",
      itemId: "it1",
    });
  });

  it('200 for destination {type:"pool"} returning {number:null}', async () => {
    reassignPhotos.mockResolvedValue({ number: null });
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "pool" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ number: null });
    expect(reassignPhotos).toHaveBeenCalledWith("c1", ["p1"], { type: "pool" });
  });

  it("400 when destination is an unknown type and does not call the service", async () => {
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "bogus" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(400);
    expect(reassignPhotos).not.toHaveBeenCalled();
  });

  it("400 when destination is absent and does not call the service", async () => {
    const res = await POST(req({ photoIds: ["p1"] }), { params: { id: "c1" } });
    expect(res.status).toBe(400);
    expect(reassignPhotos).not.toHaveBeenCalled();
  });

  it('400 when destination is {type:"item"} without a string itemId', async () => {
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "item" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(400);
    expect(reassignPhotos).not.toHaveBeenCalled();
  });

  it("400 when photoIds is not a string array", async () => {
    const res = await POST(
      req({ photoIds: "nope", destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(400);
    expect(reassignPhotos).not.toHaveBeenCalled();
  });

  it("400 when photoIds is an empty array", async () => {
    const res = await POST(
      req({ photoIds: [], destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(400);
    expect(reassignPhotos).not.toHaveBeenCalled();
  });

  it("400 when photoIds exceeds the max length", async () => {
    const ids = Array.from({ length: 51 }, (_, i) => `p${i}`);
    const res = await POST(
      req({ photoIds: ids, destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(400);
    expect(reassignPhotos).not.toHaveBeenCalled();
  });

  it("409 when the service reports a conflict", async () => {
    reassignPhotos.mockRejectedValue(new PoolGroupError("conflict", "gone"));
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(409);
  });

  it("400 when the service rejects an oversized selection (too_many)", async () => {
    reassignPhotos.mockRejectedValue(new PoolGroupError("too_many", "too many"));
    const res = await POST(
      req({ photoIds: ["p1"], destination: { type: "new" } }),
      { params: { id: "c1" } },
    );
    expect(res.status).toBe(400);
  });

  it("400 when the request body is malformed JSON", async () => {
    const bad = new Request("http://localhost/photos/reassign", {
      method: "POST",
      body: "{not json",
    }) as any;
    const res = await POST(bad, { params: { id: "c1" } });
    expect(res.status).toBe(400);
    expect(reassignPhotos).not.toHaveBeenCalled();
  });

  it("re-throws a non-PoolGroupError instead of swallowing it", async () => {
    reassignPhotos.mockRejectedValue(new Error("boom"));
    await expect(
      POST(
        req({ photoIds: ["p1"], destination: { type: "new" } }),
        { params: { id: "c1" } },
      ),
    ).rejects.toThrow("boom");
  });
});
