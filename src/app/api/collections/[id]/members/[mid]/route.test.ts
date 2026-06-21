import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, membershipRepo, collectionRepo, ctrl } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(function () { return ({}); }),
  membershipRepo: { findById: vi.fn(), findByUser: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  ctrl: { getMember: vi.fn(), isCollectionManager: vi.fn(), updateMember: vi.fn(), removeMember: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(function () { return membershipRepo; }) }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(function () { return collectionRepo; }) }));
vi.mock("@/server/api/members", () => ({ MemberController: vi.fn(function () { return ctrl; }) }));

import { GET, PATCH, DELETE } from "./route";

const req = (body?: any) => ({ json: async () => body }) as any;
const p = { id: "c1", mid: "m2" };

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  membershipRepo.findById.mockResolvedValue({ id: "m2", collectionId: "c1", userId: "u5" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  ctrl.getMember.mockResolvedValue({ id: "m2", collectionId: "c1" });
  ctrl.isCollectionManager.mockResolvedValue(true);
  ctrl.updateMember.mockResolvedValue({ id: "m2" });
  ctrl.removeMember.mockResolvedValue(undefined);
});

describe("/api/collections/[id]/members/[mid]", () => {
  it("GET 403 when caller is not member or owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: p })).status).toBe(403);
  });
  it("GET 404 when the membership belongs to another collection", async () => {
    membershipRepo.findById.mockResolvedValue({ id: "m2", collectionId: "OTHER", userId: "u5" });
    expect((await GET(req(), { params: p })).status).toBe(404);
  });
  it("GET 200 for a member", async () => {
    expect((await GET(req(), { params: p })).status).toBe(200);
  });
  it("PATCH 404 when the membership belongs to another collection — and does NOT update", async () => {
    membershipRepo.findById.mockResolvedValue({ id: "m2", collectionId: "OTHER", userId: "u5" });
    const res = await PATCH(req({ canAddItems: true }), { params: p });
    expect(res.status).toBe(404);
    expect(ctrl.updateMember).not.toHaveBeenCalled();
  });
  it("PATCH 403 when caller is not a manager", async () => {
    ctrl.isCollectionManager.mockResolvedValue(false);
    expect((await PATCH(req({ canAddItems: true }), { params: p })).status).toBe(403);
  });
  it("DELETE 404 when the membership belongs to another collection — and does NOT remove", async () => {
    membershipRepo.findById.mockResolvedValue({ id: "m2", collectionId: "OTHER", userId: "u5" });
    const res = await DELETE(req(), { params: p });
    expect(res.status).toBe(404);
    expect(ctrl.removeMember).not.toHaveBeenCalled();
  });
});
