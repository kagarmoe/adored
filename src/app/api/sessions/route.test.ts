// src/app/api/sessions/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, insertReturning, selectWhere, collectionRepo, membershipRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(),
  insertReturning: vi.fn(),
  selectWhere: vi.fn(),
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(function () { return collectionRepo; }) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(function () { return membershipRepo; }) }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  insertReturning.mockResolvedValue([{ id: "s1" }]);
  selectWhere.mockResolvedValue([{ max: 0 }]);
  mockGetDb.mockReturnValue({
    insert: () => ({ values: () => ({ returning: insertReturning }) }),
    select: () => ({ from: () => ({ where: selectWhere }) }),
  });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
});

const postReq = (body: any) => ({ json: async () => body }) as any;

describe("POST /api/sessions", () => {
  it("401 unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await POST(postReq({ collectionId: "c1" }))).status).toBe(401);
  });
  it("403 when not member or owner — and does NOT insert", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await POST(postReq({ collectionId: "c1" }));
    expect(res.status).toBe(403);
    expect(insertReturning).not.toHaveBeenCalled();
  });
  it("201 for a member", async () => {
    expect((await POST(postReq({ collectionId: "c1" }))).status).toBe(201);
  });
});
