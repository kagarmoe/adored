// src/app/api/sort-results/[id]/items/[rid]/route.test.ts
//
// Characterization of GET / PATCH / DELETE on a single sort-result item. Auth is
// via requireAuth (rejects "Unauthorized" -> 401); access is gated by
// requireApiResultAccess (NextResponse on 403/404). Each handler also performs a
// belongs-to-parent check: SortResultItemRepository.findById(rid) must return an
// item whose sortResultId === params.id, else 404. The real ResultItemController
// runs unmocked over a mocked SortResultItemRepository.
//
// RED tripwire (DELETE): ResultItemController.deleteResultItem() is a no-op stub,
// so the route returns 200 while the row survives. The success test asserts the
// INTENDED contract (the item is actually gone afterward) via test.fails(): it
// fails today against a store-backed repo and will error once deletion ships.
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
  SortResultItemRepository: vi.fn(() => itemRepo),
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

  // RED tripwire — asserts the intended contract (the row is actually removed),
  // not today's no-op. A store-backed repo lets us observe whether the item is
  // gone after the request; deleteResultItem() is a no-op so it survives -> fails.
  it.fails("DELETE removes the result item", async () => {
    const store = new Map<string, ReturnType<typeof makeItem>>([["ri1", makeItem()]]);
    itemRepo.findById.mockImplementation(async (id: string) => store.get(id) ?? null);

    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(200);
    // The item must be gone from the store after deletion.
    expect(await itemRepo.findById("ri1")).toBeNull();
  });
});
