// src/app/api/sort-results/[id]/route.test.ts
//
// Characterization of GET / PATCH / DELETE on a single sort-result. Auth is via
// requireAuth (throws UnauthorizedError -> 401); access is gated by
// requireApiResultAccess (returns a NextResponse on 403/404). The real
// ResultController runs unmocked over a mocked SortResultRepository so the
// controller<->repo seam is exercised end to end.
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

  it("deletes a draft result on success", async () => {
    const res = await DELETE(getReq(), params);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ message: "Result deleted" });
  });
});
