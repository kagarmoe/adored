// @vitest-environment node
//
// GET /api/items/[id] must return 404 (not 500) for an absent/deleted item —
// regression test for the 500-not-404 bug found by the u3p purge e2e.
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockRequireAuth, mockGetDb, findById } = vi.hoisted(() => ({
  mockRequireAuth: vi.fn(),
  mockGetDb: vi.fn(function () { return ({}); }),
  findById: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ requireAuth: mockRequireAuth, getSession: vi.fn() }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/ItemRepository", () => ({
  ItemRepository: vi.fn(function () { return ({ findById }); }),
}));

import { GET } from "./route";
import { NextRequest } from "next/server";

function req() {
  return new NextRequest("http://localhost/api/items/itm_x");
}

describe("GET /api/items/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAuth.mockResolvedValue({ id: "u1" });
    mockGetDb.mockReturnValue({});
  });

  it("returns 404 when the item does not exist", async () => {
    findById.mockResolvedValue(null);
    const res = await GET(req(), { params: { id: "itm_absent" } });
    expect(res.status).toBe(404);
  });

  it("returns the item (200) when it exists", async () => {
    findById.mockResolvedValue({ id: "itm_x", name: "Bag" });
    const res = await GET(req(), { params: { id: "itm_x" } });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ id: "itm_x" });
  });

  it("returns 401 when unauthenticated", async () => {
    mockRequireAuth.mockRejectedValue(new Error("Unauthorized"));
    const res = await GET(req(), { params: { id: "itm_x" } });
    expect(res.status).toBe(401);
  });
});
