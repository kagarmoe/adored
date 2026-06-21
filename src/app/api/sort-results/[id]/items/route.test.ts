// src/app/api/sort-results/[id]/items/route.test.ts
//
// Characterization of GET /api/sort-results/[id]/items. Auth is via requireAuth
// (rejects "Unauthorized" -> 401); access is gated by requireApiResultAccess
// (returns a NextResponse on 403/404). The real ResultItemController runs
// unmocked over a mocked SortResultItemRepository, exercising listResultItems.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAuth, mockGetDb, mockRequireApiResultAccess, itemRepo } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockGetDb: vi.fn(),
    mockRequireApiResultAccess: vi.fn(),
    itemRepo: {
      findByResult: vi.fn(),
      findById: vi.fn(),
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
  SortResultItemRepository: vi.fn(function () { return itemRepo; }),
}));

import { GET } from "./route";

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

const ITEM = {
  id: "ri1",
  sortResultId: "sr1",
  itemId: "i1",
  computedRank: 1,
  computedBucket: "top",
  manualRank: null,
  manualBucket: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const params = { params: { id: "sr1" } };
const getReq = () => ({}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "u1", email: "u1@example.com" });
  mockGetDb.mockReturnValue({});
  mockRequireApiResultAccess.mockResolvedValue(RESULT);
  itemRepo.findByResult.mockResolvedValue([ITEM]);
});

const unauthorized = () => {
  mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
};

describe("GET /api/sort-results/[id]/items", () => {
  it("401 when unauthenticated", async () => {
    unauthorized();
    const res = await GET(getReq(), params);
    expect(res.status).toBe(401);
    expect(itemRepo.findByResult).not.toHaveBeenCalled();
  });

  it("404 when the result is absent (access guard returns Not found)", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await GET(getReq(), params);
    expect(res.status).toBe(404);
    expect(itemRepo.findByResult).not.toHaveBeenCalled();
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await GET(getReq(), params);
    expect(res.status).toBe(403);
    expect(itemRepo.findByResult).not.toHaveBeenCalled();
  });

  it("returns the result's items on success", async () => {
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    expect(itemRepo.findByResult).toHaveBeenCalledWith("sr1");
    expect(await res.json()).toMatchObject([{ id: "ri1", sortResultId: "sr1" }]);
  });
});
