// src/app/api/sort-results/[id]/items/[rid]/reset/route.test.ts
//
// Characterization of POST /api/sort-results/[id]/items/[rid]/reset. Auth is via
// requireAuth (rejects "Unauthorized" -> 401); access is gated by
// requireApiResultAccess (NextResponse on 403/404). The handler also checks
// belongs-to-parent: findById(rid).sortResultId must equal params.id, else 404.
// The real ResultItemController runs unmocked: resetResultItem clears the manual
// overrides (manualRank/manualBucket -> null) via the repo's update.
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

import { POST } from "./route";

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
  manualRank: 5,
  manualBucket: "low" as const,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const params = { params: { id: "sr1", rid: "ri1" } };
const postReq = () => ({}) as any;

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

describe("POST /api/sort-results/[id]/items/[rid]/reset", () => {
  it("401 when unauthenticated", async () => {
    unauthorized();
    const res = await POST(postReq(), params);
    expect(res.status).toBe(401);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("404 when the result is absent (access guard returns Not found)", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await POST(postReq(), params);
    expect(res.status).toBe(404);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(postReq(), params);
    expect(res.status).toBe(403);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("404 when the item belongs to a different result", async () => {
    itemRepo.findById.mockResolvedValue({ ...makeItem(), sortResultId: "OTHER" });
    const res = await POST(postReq(), params);
    expect(res.status).toBe(404);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("404 when the item does not exist", async () => {
    itemRepo.findById.mockResolvedValue(null);
    const res = await POST(postReq(), params);
    expect(res.status).toBe(404);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("409 when the parent result is finalized (no mutation)", async () => {
    mockRequireApiResultAccess.mockResolvedValue({ ...RESULT, status: "finalized" });
    const res = await POST(postReq(), params);
    expect(res.status).toBe(409);
    expect(itemRepo.update).not.toHaveBeenCalled();
  });

  it("clears the manual overrides on success", async () => {
    const res = await POST(postReq(), params);
    expect(res.status).toBe(200);
    expect(itemRepo.update).toHaveBeenCalledWith("ri1", {
      manualRank: null,
      manualBucket: null,
    });
    expect(await res.json()).toMatchObject({ manualRank: null, manualBucket: null });
  });
});
