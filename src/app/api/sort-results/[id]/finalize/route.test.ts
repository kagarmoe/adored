// src/app/api/sort-results/[id]/finalize/route.test.ts
//
// Characterization of POST /api/sort-results/[id]/finalize. Auth is via
// requireAuth (rejects "Unauthorized" -> 401); access is gated by
// requireApiResultAccess (returns a NextResponse on 403/404). The real
// ResultController runs unmocked over a mocked SortResultRepository so the
// controller<->repo seam (findById then update to "finalized") is exercised.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAuth, mockGetDb, mockRequireApiResultAccess, sortResultRepo } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockGetDb: vi.fn(),
    mockRequireApiResultAccess: vi.fn(),
    sortResultRepo: {
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
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({
  SortResultRepository: vi.fn(function () { return sortResultRepo; }),
}));

import { POST } from "./route";

const DRAFT_RESULT = {
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

const params = { params: { id: "sr1" } };
const postReq = () => ({}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "u1", email: "u1@example.com" });
  mockGetDb.mockReturnValue({});
  mockRequireApiResultAccess.mockResolvedValue(DRAFT_RESULT);
  sortResultRepo.findById.mockResolvedValue(DRAFT_RESULT);
  sortResultRepo.update.mockImplementation(async (_id: string, data: any) => ({
    ...DRAFT_RESULT,
    ...data,
  }));
});

const unauthorized = () => {
  mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
};

describe("POST /api/sort-results/[id]/finalize", () => {
  it("401 when unauthenticated", async () => {
    unauthorized();
    const res = await POST(postReq(), params);
    expect(res.status).toBe(401);
    expect(sortResultRepo.update).not.toHaveBeenCalled();
  });

  it("404 when the result is absent (access guard returns Not found)", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await POST(postReq(), params);
    expect(res.status).toBe(404);
    expect(sortResultRepo.update).not.toHaveBeenCalled();
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(postReq(), params);
    expect(res.status).toBe(403);
    expect(sortResultRepo.update).not.toHaveBeenCalled();
  });

  it("marks the result finalized on success", async () => {
    const res = await POST(postReq(), params);
    expect(res.status).toBe(200);
    expect(sortResultRepo.update).toHaveBeenCalledWith(
      "sr1",
      expect.objectContaining({ status: "finalized" }),
    );
    expect(await res.json()).toMatchObject({ id: "sr1", status: "finalized" });
  });
});
