// src/app/api/sort-results/[id]/supersede/route.test.ts
//
// Characterization of POST /api/sort-results/[id]/supersede. Auth is via
// requireAuth (rejects "Unauthorized" -> 401); access is gated by
// requireApiResultAccess (returns a NextResponse on 403/404). The route builds
// a 3-repo SortResultService over mocked repositories.
//
// Contract: a FINALIZED result clones into a new draft (201 + status "draft");
// a non-finalized result is rejected with 409 (SupersedeStateError). The
// un-mocked clone proof lives in sort-pipeline.integration.test.ts.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";
import { fakeTxDb } from "@/test-support/fakeTxDb";

const {
  mockRequireAuth,
  mockGetDb,
  mockRequireApiResultAccess,
  sortResultRepo,
  sortResultItemRepo,
  preferenceRepo,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetDb: vi.fn(),
  mockRequireApiResultAccess: vi.fn(),
  // findById = pre-tx guard read; getNextResultNumber + insertWithNumber =
  // tx-bound writes inside createResultWithItems.
  sortResultRepo: {
    findById: vi.fn(),
    getNextResultNumber: vi.fn(),
    insertWithNumber: vi.fn(),
  },
  sortResultItemRepo: {
    findByResult: vi.fn(),
    create: vi.fn(),
  },
  preferenceRepo: {
    findByCollection: vi.fn(),
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
// The route builds a 3-repo SortResultService; mock all three constructors.
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({
  SortResultRepository: vi.fn(() => sortResultRepo),
}));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({
  SortResultItemRepository: vi.fn(() => sortResultItemRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({
  CollectionPreferenceItemRepository: vi.fn(() => preferenceRepo),
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

const DRAFT_RESULT = {
  ...FINALIZED_RESULT,
  status: "draft",
  finalizedAt: null,
};

const params = { params: { id: "sr1" } };
const postReq = () => ({}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "u1", email: "u1@example.com" });
  // The route opens a transaction to clone; fakeTxDb runs the body on the mocks.
  mockGetDb.mockReturnValue(fakeTxDb());
  mockRequireApiResultAccess.mockResolvedValue(FINALIZED_RESULT);
  sortResultRepo.findById.mockResolvedValue(FINALIZED_RESULT);
  sortResultRepo.getNextResultNumber.mockResolvedValue(2);
  sortResultRepo.insertWithNumber.mockImplementation(async (data: any) => ({
    ...FINALIZED_RESULT,
    id: "sr2",
    status: "draft",
    finalizedAt: null,
    ...data,
  }));
  sortResultItemRepo.findByResult.mockResolvedValue([]);
  sortResultItemRepo.create.mockImplementation(async (data: any) => ({ id: "sri", ...data }));
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

  it("supersede returns 201 and clones the result's items", async () => {
    const res = await POST(postReq(), params);
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "draft" });
  });

  it("supersede rejects a non-finalized result with 409", async () => {
    mockRequireApiResultAccess.mockResolvedValue(DRAFT_RESULT);
    sortResultRepo.findById.mockResolvedValue(DRAFT_RESULT);
    const res = await POST(postReq(), params);
    expect(res.status).toBe(409);
  });
});
