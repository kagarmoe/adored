// src/app/api/sort-results/[id]/shares/[sid]/route.test.ts
// Characterize-only diagnostic suite for the single sort-result share route.
// Mocks only true boundaries: auth, db handle, the result-access gate, and the
// share repository (DB). ShareController runs for real against the mocked repo.
import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const { mockRequireAuth, mockGetDb, mockRequireResultAccess, shareRepo } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetDb: vi.fn(),
  mockRequireResultAccess: vi.fn(),
  shareRepo: { create: vi.fn(), findById: vi.fn(), update: vi.fn(), findByToken: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/dal/collection-access", () => ({ requireApiResultAccess: mockRequireResultAccess }));
vi.mock("@/server/repositories/implementations/SortResultShareRepository", () => ({
  SortResultShareRepository: vi.fn(function () { return shareRepo; }),
}));

import { GET, PATCH, DELETE } from "./route";

const RESULT_ID = "result-123";
const SHARE_ID = "share-1";

const ctx = { params: { id: RESULT_ID, sid: SHARE_ID } };
const ownShare = { id: SHARE_ID, sortResultId: RESULT_ID, status: "active" };
const patchReq = (body: unknown) => ({ json: async () => body }) as any;
const badJsonReq = () => ({ json: async () => { throw new SyntaxError("Unexpected token"); } }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockRequireAuth.mockResolvedValue({ id: "u1", email: "u1@example.com" });
  mockGetDb.mockReturnValue({});
  mockRequireResultAccess.mockResolvedValue({ id: RESULT_ID, curatorId: "u1", collectionId: "c1" });
  shareRepo.findById.mockResolvedValue(ownShare);
  shareRepo.update.mockResolvedValue({ ...ownShare, status: "revoked" });
});

describe("GET /api/sort-results/[id]/shares/[sid] (read one share)", () => {
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

  it("returns 404 when the share does not exist", async () => {
    shareRepo.findById.mockResolvedValue(null);
    const res = await GET({} as any, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 404 when the share belongs to a different result (belongs-to-parent guard)", async () => {
    shareRepo.findById.mockResolvedValue({ id: SHARE_ID, sortResultId: "some-other-result", status: "active" });
    const res = await GET({} as any, ctx);
    expect(res.status).toBe(404);
  });

  it("returns 200 with the share when it belongs to this result", async () => {
    const res = await GET({} as any, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: SHARE_ID, sortResultId: RESULT_ID });
  });
});

describe("PATCH /api/sort-results/[id]/shares/[sid] (update share)", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
    const res = await PATCH(patchReq({ status: "revoked" }), ctx);
    expect(res.status).toBe(401);
  });

  it("returns the access gate's 403 when the user may not access the result", async () => {
    mockRequireResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await PATCH(patchReq({ status: "revoked" }), ctx);
    expect(res.status).toBe(403);
    expect(shareRepo.update).not.toHaveBeenCalled();
  });

  it("returns 400 when the request body is invalid JSON", async () => {
    const res = await PATCH(badJsonReq(), ctx);
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe("Invalid JSON");
  });

  it("returns 404 when the share does not exist", async () => {
    shareRepo.findById.mockResolvedValue(null);
    const res = await PATCH(patchReq({ status: "revoked" }), ctx);
    expect(res.status).toBe(404);
    expect(shareRepo.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the share belongs to a different result (belongs-to-parent guard)", async () => {
    shareRepo.findById.mockResolvedValue({ id: SHARE_ID, sortResultId: "some-other-result", status: "active" });
    const res = await PATCH(patchReq({ status: "revoked" }), ctx);
    expect(res.status).toBe(404);
    expect(shareRepo.update).not.toHaveBeenCalled();
  });

  it("returns 200 and updates the share when it belongs to this result", async () => {
    const res = await PATCH(patchReq({ status: "revoked" }), ctx);
    expect(res.status).toBe(200);
    expect(shareRepo.update).toHaveBeenCalledWith(SHARE_ID, expect.objectContaining({ status: "revoked" }));
  });
});

describe("DELETE /api/sort-results/[id]/shares/[sid] (revoke share)", () => {
  it("returns 401 when the request is unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
    const res = await DELETE({} as any, ctx);
    expect(res.status).toBe(401);
  });

  it("returns the access gate's 403 when the user may not access the result", async () => {
    mockRequireResultAccess.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await DELETE({} as any, ctx);
    expect(res.status).toBe(403);
    expect(shareRepo.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the share does not exist", async () => {
    shareRepo.findById.mockResolvedValue(null);
    const res = await DELETE({} as any, ctx);
    expect(res.status).toBe(404);
    expect(shareRepo.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the share belongs to a different result (belongs-to-parent guard)", async () => {
    shareRepo.findById.mockResolvedValue({ id: SHARE_ID, sortResultId: "some-other-result", status: "active" });
    const res = await DELETE({} as any, ctx);
    expect(res.status).toBe(404);
    expect(shareRepo.update).not.toHaveBeenCalled();
  });

  it("returns 200 and revokes the share when it belongs to this result", async () => {
    const res = await DELETE({} as any, ctx);
    expect(res.status).toBe(200);
    expect(shareRepo.update).toHaveBeenCalledWith(SHARE_ID, { status: "revoked" });
  });
});
