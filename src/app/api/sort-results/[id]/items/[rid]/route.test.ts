// src/app/api/sort-results/[id]/items/[rid]/route.test.ts
//
// Characterization of GET / PATCH / DELETE on a single sort-result item. Auth is
// via requireAuth (rejects "Unauthorized" -> 401); access is gated by
// requireApiResultAccess (NextResponse on 403/404). Each handler also performs a
// belongs-to-parent check: SortResultItemRepository.findById(rid) must return an
// item whose sortResultId === params.id, else 404. The real ResultItemController
// runs unmocked over a mocked SortResultItemRepository.
//
// DELETE delegates to SortResultService.deleteResultItem -> repo.delete(rid). The
// success test uses a store-backed repo mock to assert the INTENDED contract: the
// row is actually gone after the request (not merely a 200). The DB-seam proof is
// the un-mocked test in src/lib/db/sort-pipeline.integration.test.ts.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAuth, mockGetDb, mockRequireApiResultAccess, itemRepo } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockGetDb: vi.fn(),
    mockRequireApiResultAccess: vi.fn(),
    itemRepo: {
      findById: vi.fn(),
      findByResult: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
  }));

vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  getSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/dal/collection-access", () => ({
  requireApiResultAccess: mockRequireApiResultAccess,
}));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({
  SortResultItemRepository: vi.fn(function () { return itemRepo; }),
}));

import { GET, PATCH, DELETE } from "./route";

const RESULT = {
  id: "sr1",
  collectionId: "c1",
  curatorId: "u1",
  number: 1,
  status: "draft",
  name: "My Sort",
  createdAt: new Date(),
  updatedAt: new Date(),
  finalizedAt: null,
};

const makeItem = () => ({
  id: "ri1",
  sortResultId: "sr1",
  itemId: "i1",
  computedRank: 1,
  computedBucket: "top" as const,
  manualRank: null,
  manualBucket: null,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const params = { params: { id: "sr1", rid: "ri1" } };

const patchReq = (body: any) => ({ json: async () => body }) as any;
const getReq = () => ({}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "u1", email: "u1@example.com" });
  mockGetDb.mockReturnValue({});
  mockRequireApiResultAccess.mockResolvedValue(RESULT);
  itemRepo.findById.mockResolvedValue(makeItem());
  itemRepo.update.mockImplementation(async (_id: string, data: any) => ({
    ...makeItem(),
    ...data,
  }));
});

const unauthorized = () => {
  mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
};

describe("GET /api/sort-results/[id]/items/[rid]", () => {
  it("401 when unauthenticated", async () => {
    unauthorized();
    const res = await GET(getReq(), params);
    expect(res.status).toBe(401);
  });

  it("404 when the result is absent (access guard returns Not found)", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await GET(getReq(), params);
    expect(res.status).toBe(404);
    expect(itemRepo.findById).not.toHaveBeenCalled();
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await GET(getReq(), params);
    expect(res.status).toBe(403);
    expect(itemRepo.findById).not.toHaveBeenCalled();
  });

  it("404 when the item belongs to a different result", async () => {
    itemRepo.findById.mockResolvedValue({ ...makeItem(), sortResultId: "OTHER" });
    const res = await GET(getReq(), params);
    expect(res.status).toBe(404);
  });

  it("404 when the item does not exist", async () => {
    itemRepo.findById.mockResolvedValue(null);
    const res = await GET(getReq(), params);
    expect(res.status).toBe(404);
  });

  it("returns the item on success", async () => {
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "ri1", sortResultId: "sr1" });
  });
});

describe("PATCH /api/sort-results/[id]/items/[rid]", () => {
  it("401 when unauthenticated", async () => {
    unauthorized();
    const res = await PATCH(patchReq({ manualRank: 2 }), params);
    expect(res.status).toBe(401);
  });

  it("404 when the result is absent", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await PATCH(patchReq({ manualRank: 2 }), params);
    expect(res.status).toBe(404);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await PATCH(patchReq({ manualRank: 2 }), params);
    expect(res.status).toBe(403);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("404 when the item belongs to a different result", async () => {
    itemRepo.findById.mockResolvedValue({ ...makeItem(), sortResultId: "OTHER" });
    const res = await PATCH(patchReq({ manualRank: 2 }), params);
    expect(res.status).toBe(404);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("409 when the parent result is finalized (no mutation)", async () => {
    mockRequireApiResultAccess.mockResolvedValue({ ...RESULT, status: "finalized" });
    const res = await PATCH(patchReq({ manualRank: 2 }), params);
    expect(res.status).toBe(409);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("updates the item on success", async () => {
    const res = await PATCH(patchReq({ manualRank: 2 }), params);
    expect(res.status).toBe(200);
    expect(itemRepo.update).toHaveBeenCalledWith("ri1", { manualRank: 2 });
    expect(await res.json()).toMatchObject({ manualRank: 2 });
  });
});

describe("DELETE /api/sort-results/[id]/items/[rid]", () => {
  it("401 when unauthenticated", async () => {
    unauthorized();
    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(401);
  });

  it("404 when the result is absent", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(404);
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(403);
  });

  it("404 when the item belongs to a different result", async () => {
    itemRepo.findById.mockResolvedValue({ ...makeItem(), sortResultId: "OTHER" });
    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(404);
  });

  it("409 when the parent result is finalized (no delete)", async () => {
    mockRequireApiResultAccess.mockResolvedValue({ ...RESULT, status: "finalized" });
    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(409);
    expect(itemRepo.delete).not.toHaveBeenCalled();
  });

  // Asserts the intended contract (the row is actually removed), not just a 200.
  // A store-backed repo lets us observe that the item is gone after the request.
  it("DELETE removes the result item", async () => {
    const store = new Map<string, ReturnType<typeof makeItem>>([["ri1", makeItem()]]);
    itemRepo.findById.mockImplementation(async (id: string) => store.get(id) ?? null);
    itemRepo.delete.mockImplementation(async (id: string) => {
      store.delete(id);
    });

    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(200);
    expect(itemRepo.delete).toHaveBeenCalledWith("ri1");
    // The item must be gone from the store after deletion.
    expect(await itemRepo.findById("ri1")).toBeNull();
  });
});
