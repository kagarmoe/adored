// src/app/api/sort-results/[id]/supersede/route.test.ts
//
// Characterization of POST /api/sort-results/[id]/supersede. Auth is via
// requireAuth (rejects "Unauthorized" -> 401); access is gated by
// requireApiResultAccess (returns a NextResponse on 403/404). The real
// ResultController runs unmocked over a mocked SortResultRepository.
//
// RED tripwire: ResultController.supersedeResult is a stub that throws
// "Supersede not yet implemented", so the route catches it and returns 500.
// The success test asserts the INTENDED contract (201 + a cloned draft of the
// finalized result's items) via test.fails(): it fails cleanly today and will
// error (signalling "fix shipped, promote me") once supersede is implemented.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAuth, mockGetDb, mockRequireApiResultAccess, sortResultRepo } =
  vi.hoisted(() => ({
    mockRequireAuth: vi.fn(),
    mockGetDb: vi.fn(),
    mockRequireApiResultAccess: vi.fn(),
    sortResultRepo: {
      findById: vi.fn(),
      create: vi.fn(),
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
  SortResultRepository: vi.fn(() => sortResultRepo),
}));

import { POST } from "./route";

const FINALIZED_RESULT = {
  id: "sr1",
  collectionId: "c1",
  curatorId: "u1",
  number: 1,
  status: "finalized",
  name: "My Sort",
  createdAt: new Date(),
  updatedAt: new Date(),
  finalizedAt: new Date(),
};

const params = { params: { id: "sr1" } };
const postReq = () => ({}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "u1", email: "u1@example.com" });
  mockGetDb.mockReturnValue({});
  mockRequireApiResultAccess.mockResolvedValue(FINALIZED_RESULT);
  sortResultRepo.findById.mockResolvedValue(FINALIZED_RESULT);
  sortResultRepo.create.mockImplementation(async (data: any) => ({
    ...FINALIZED_RESULT,
    id: "sr2",
    number: 2,
    status: "draft",
    finalizedAt: null,
    ...data,
  }));
});

const unauthorized = () => {
  mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
};

describe("POST /api/sort-results/[id]/supersede", () => {
  it("401 when unauthenticated", async () => {
    unauthorized();
    const res = await POST(postReq(), params);
    expect(res.status).toBe(401);
  });

  it("404 when the result is absent (access guard returns Not found)", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await POST(postReq(), params);
    expect(res.status).toBe(404);
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(postReq(), params);
    expect(res.status).toBe(403);
  });

  // RED tripwire — asserts the intended contract, not today's 500.
  it.fails("supersede returns 201 and clones the result's items", async () => {
    const res = await POST(postReq(), params);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "draft" });
  });
});
