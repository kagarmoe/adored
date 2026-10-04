import { beforeEach, describe, expect, it, vi } from "vitest";

// A share can vanish between the route's ownership check and its write (a
// revision, purge or account deletion removes it). The UPDATE then hits zero
// rows; that must answer 404, not a 500.
const { mockGetDb } = vi.hoisted(() => ({ mockGetDb: vi.fn() }));

vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/lib/auth", () => ({
  requireAuth: vi.fn().mockResolvedValue({ id: "user-1", email: "a@b.c" }),
  UnauthorizedError: class UnauthorizedError extends Error {},
}));
vi.mock("@/server/dal/collection-access", () => ({
  requireApiResultAccess: vi.fn().mockResolvedValue({ ok: true }),
}));

import { DELETE, PATCH } from "./route";

const row = {
  id: "share-1",
  sortResultId: "result-1",
  shareToken: "tok",
  status: "active",
  expiresAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// The share is visible to the pre-check read, but gone by the time the UPDATE runs.
function vanishingShareDb() {
  // `.where()` is awaited directly by select and via `.returning()` by update.
  const rows = (result: unknown[]) => ({
    where: () => ({
      returning: async () => result,
      then: (resolve: (v: unknown[]) => unknown) => resolve(result),
    }),
  });
  return {
    select: () => ({ from: () => rows([row]) }),
    update: () => ({ set: () => rows([]) }),
  };
}

const params = { params: Promise.resolve({ id: "result-1", sid: "share-1" }) };

describe("share PATCH/DELETE when the share vanishes mid-request", () => {
  beforeEach(() => {
    mockGetDb.mockReturnValue(vanishingShareDb());
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("PATCH answers 404", async () => {
    const req = { json: async () => ({ status: "revoked" }) };
    const res = await PATCH(req as never, params);
    expect(res.status).toBe(404);
  });

  it("DELETE answers 404", async () => {
    const res = await DELETE({} as never, params);
    expect(res.status).toBe(404);
  });
});
