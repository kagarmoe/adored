// src/app/api/sort-results/[id]/route.test.ts
//
// Characterization of GET / PATCH / DELETE on a single sort-result. Auth is via
// requireAuth (throws UnauthorizedError -> 401); access is gated by
// requireApiResultAccess (returns a NextResponse on 403/404). The real
// ResultController runs unmocked over a mocked SortResultRepository so the
// controller<->repo seam is exercised end to end.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const {
  mockRequireAuth,
  mockGetDb,
  mockRequireApiResultAccess,
  sortResultRepo,
  sortResultItemRepo,
} = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetDb: vi.fn(),
  mockRequireApiResultAccess: vi.fn(),
  sortResultRepo: {
    findById: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
  sortResultItemRepo: {
    findByResult: vi.fn(),
    deleteByResult: vi.fn(),
  },
}));

vi.mock("@/lib/auth", () => ({
  requireAuth: mockRequireAuth,
  // Route only imports requireAuth; getSession kept for safety if wiring changes.
  getSession: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/dal/collection-access", () => ({
  requireApiResultAccess: mockRequireApiResultAccess,
}));
vi.mock("@/server/repositories/implementations/SortResultRepository", () => ({
  SortResultRepository: vi.fn(() => sortResultRepo),
}));
vi.mock("@/server/repositories/implementations/SortResultItemRepository", () => ({
  SortResultItemRepository: vi.fn(() => sortResultItemRepo),
}));
vi.mock("@/server/repositories/implementations/CollectionPreferenceItemRepository", () => ({
  CollectionPreferenceItemRepository: vi.fn(() => ({})),
}));

import { GET, PATCH, DELETE } from "./route";

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

const patchReq = (body: any) => ({ json: async () => body }) as any;
const badJsonReq = () =>
  ({
    json: async () => {
      throw new SyntaxError("Unexpected token in JSON");
    },
  }) as any;
const getReq = () => ({}) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "u1", email: "u1@example.com" });
  mockGetDb.mockReturnValue({});
  // Default: access granted -> returns the result (not a NextResponse).
  mockRequireApiResultAccess.mockResolvedValue(DRAFT_RESULT);
  sortResultRepo.findById.mockResolvedValue(DRAFT_RESULT);
  sortResultRepo.update.mockResolvedValue({ ...DRAFT_RESULT, name: "Renamed" });
  sortResultRepo.delete.mockResolvedValue(undefined);
  sortResultItemRepo.findByResult.mockResolvedValue([]);
  sortResultItemRepo.deleteByResult.mockResolvedValue(undefined);
});

const unauthorized = () => {
  mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
};

describe("GET /api/sort-results/[id]", () => {
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
    expect(sortResultRepo.findById).not.toHaveBeenCalled();
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await GET(getReq(), params);
    expect(res.status).toBe(403);
    expect(sortResultRepo.findById).not.toHaveBeenCalled();
  });

  it("returns the result on success", async () => {
    const res = await GET(getReq(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "sr1", status: "draft" });
  });
});

describe("PATCH /api/sort-results/[id]", () => {
  it("401 when unauthenticated", async () => {
    unauthorized();
    const res = await PATCH(patchReq({ name: "Renamed" }), params);
    expect(res.status).toBe(401);
  });

  it("404 when the result is absent", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await PATCH(patchReq({ name: "Renamed" }), params);
    expect(res.status).toBe(404);
    expect(sortResultRepo.update).not.toHaveBeenCalled();
  });

  it("403 when the curator does not own the result", async () => {
    mockRequireApiResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await PATCH(patchReq({ name: "Renamed" }), params);
    expect(res.status).toBe(403);
    expect(sortResultRepo.update).not.toHaveBeenCalled();
  });

  it("400 when the request body is invalid JSON", async () => {
    const res = await PATCH(badJsonReq(), params);
    expect(res.status).toBe(400);
    expect(sortResultRepo.update).not.toHaveBeenCalled();
  });

  it("updates the result on success", async () => {
    const res = await PATCH(patchReq({ name: "Renamed" }), params);
    expect(res.status).toBe(200);
    expect(sortResultRepo.update).toHaveBeenCalledWith("sr1", { name: "Renamed" });
    expect(await res.json()).toMatchObject({ name: "Renamed" });
  });
});

describe("DELETE /api/sort-results/[id]", () => {
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

  // Status-only: the route returns 200 with the "deleted" envelope regardless of
  // whether anything was actually removed. Named honestly so it does NOT claim the
  // row is gone — that contract is pinned by the RED tripwire below.
  it("DELETE /sort-results/[id] returns 200", async () => {
    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ message: "Result deleted" });
  });

  // Contract: a DELETE on a draft actually removes the result. A store-backed repo
  // lets us observe that the row is gone after the request — the route now delegates
  // to SortResultService.deleteResult (children-first hard delete), so findById
  // returns null afterward. The un-mocked zero-orphan proof lives in
  // sort-pipeline.integration.test.ts.
  it("DELETE actually removes the result", async () => {
    const store = new Map<string, typeof DRAFT_RESULT>([["sr1", DRAFT_RESULT]]);
    sortResultRepo.findById.mockImplementation(async (id: string) => store.get(id) ?? null);
    sortResultRepo.delete.mockImplementation(async (id: string) => {
      store.delete(id);
    });

    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(200);
    // The result must be gone from the store after deletion.
    expect(await sortResultRepo.findById("sr1")).toBeNull();
  });
});
