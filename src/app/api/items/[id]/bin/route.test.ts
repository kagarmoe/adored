// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from "vitest";

const { requireAuth, requireApiItemCapability, setBin } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  requireApiItemCapability: vi.fn(),
  setBin: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  requireAuth,
  UnauthorizedError: class extends Error {},
}));
vi.mock("@/lib/db", () => ({ getDb: () => ({}) }));
vi.mock("@/server/dal/collection-access", () => ({ requireApiItemCapability }));
vi.mock("@/server/services/ItemBinService", () => ({
  ItemBinService: { fromDb: () => ({ setBin }) },
}));

import { PUT } from "./route";

function req(body: unknown): Request {
  return new Request("http://localhost/api/items/i1/bin", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}
const ctx = { params: Promise.resolve({ id: "i1" }) };

beforeEach(() => {
  vi.clearAllMocks();
  requireAuth.mockResolvedValue({ id: "u1" });
  requireApiItemCapability.mockResolvedValue({ id: "i1", collectionId: "c1" });
});

describe("PUT /api/items/[id]/bin — request schema", () => {
  it("rejects a bucket outside the four-tier enum with 400 and never touches the write", async () => {
    const res = await PUT(req({ bucket: "Love" }) as never, ctx as never);
    expect(res.status).toBe(400);
    expect(setBin).not.toHaveBeenCalled();
  });

  it("accepts an explicit null (clear): passes null to the service, returns its effective bucket", async () => {
    setBin.mockResolvedValue(null);
    const res = await PUT(req({ bucket: null }) as never, ctx as never);
    expect(res.status).toBe(200);
    expect(setBin).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }), "u1", null);
    expect(await res.json()).toEqual({ effectiveBucket: null });
  });

  it("a valid bucket is passed through and its effective bucket returned (200)", async () => {
    setBin.mockResolvedValue("top");
    const res = await PUT(req({ bucket: "top" }) as never, ctx as never);
    expect(res.status).toBe(200);
    expect(setBin).toHaveBeenCalledWith(expect.objectContaining({ id: "i1" }), "u1", "top");
    expect(await res.json()).toEqual({ effectiveBucket: "top" });
  });
});
