// src/app/api/sort-results/[id]/shares/route.test.ts
// Characterize-only diagnostic suite for the sort-result shares collection route.
// Mocks only true boundaries: auth, db handle, the result-access gate, and the
// share repository (DB). ShareController runs for real against the mocked repo.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAuth, mockGetDb, mockRequireResultAccess, shareRepo } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetDb: vi.fn(),
  mockRequireResultAccess: vi.fn(),
  shareRepo: { create: vi.fn(), findById: vi.fn(), update: vi.fn(), findByToken: vi.fn(), findByResult: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/dal/collection-access", () => ({ requireApiResultAccess: mockRequireResultAccess }));
vi.mock("@/server/repositories/implementations/SortResultShareRepository", () => ({
  SortResultShareRepository: vi.fn(() => shareRepo),
}));

import { GET, POST } from "./route";

const RESULT_ID = "result-123";

const ctx = { params: { id: RESULT_ID } };
const postReq = (body: unknown) => ({ json: async () => body }) as any;
const badJsonReq = () => ({ json: async () => { throw new SyntaxError("Unexpected token"); } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "u1", email: "u1@example.com" });
  mockGetDb.mockReturnValue({});
  // Default: caller may access this result.
  mockRequireResultAccess.mockResolvedValue({ id: RESULT_ID, curatorId: "u1", collectionId: "c1" });
  shareRepo.create.mockResolvedValue({
    id: "share-1",
    sortResultId: RESULT_ID,
    shareToken: "ignored-by-controller",
    status: "active",
  });
  // Default: this result has no shares yet (scoped lookup returns an empty array).
  shareRepo.findByResult.mockResolvedValue([]);
});

describe("GET /api/sort-results/[id]/shares (list shares)", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET({} as any, ctx);
    expect(res.status).toBe(401);
  });

  it("returns the access gate's 403 when the user may not access the result", async () => {
    mockRequireResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await GET({} as any, ctx);
    expect(res.status).toBe(403);
  });

  it("returns the access gate's 404 when the result does not exist", async () => {
    mockRequireResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await GET({} as any, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 200 with a JSON array of shares for an authorized caller", async () => {
    const res = await GET({} as any, ctx);
    expect(res.status).toBe(200);
    expect(Array.isArray(await res.json())).toBe(true);
  });

  it(
    "lists the shares scoped to this result id",
    async () => {
      const scopedShare = { id: "share-1", sortResultId: RESULT_ID, status: "active" };
      shareRepo.findByResult.mockResolvedValue([scopedShare]);
      const res = await GET({} as any, ctx);
      const body = await res.json();
      expect(body).toEqual([scopedShare]);
      expect(shareRepo.findByResult).toHaveBeenCalledWith(RESULT_ID);
    },
  );
});

describe("POST /api/sort-results/[id]/shares (create share)", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
    const res = await POST(postReq({}), ctx);
    expect(res.status).toBe(401);
  });

  it("returns the access gate's 403 when the user may not access the result", async () => {
    mockRequireResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(postReq({}), ctx);
    expect(res.status).toBe(403);
    expect(shareRepo.create).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is invalid JSON", async () => {
    const res = await POST(badJsonReq(), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it("returns 201 with the created share and a shareToken for an authorized caller", async () => {
    const res = await POST(postReq({}), ctx);
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ id: "share-1", sortResultId: RESULT_ID });
    expect(typeof body.shareToken).toBe("string");
    expect(body.shareToken.length).toBeGreaterThan(0);
    expect(shareRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ sortResultId: RESULT_ID }),
    );
  });
});
