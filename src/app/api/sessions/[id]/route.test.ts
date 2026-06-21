// src/app/api/sessions/[id]/route.test.ts
import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, sessionRepo, collectionRepo, membershipRepo, ctrl } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(function () { return ({}); }),
  sessionRepo: { findById: vi.fn() },
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  ctrl: { getSession: vi.fn(), updateSession: vi.fn(), deleteSession: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/SessionRepository", () => ({ SessionRepository: vi.fn(function () { return sessionRepo; }) }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(function () { return collectionRepo; }) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(function () { return membershipRepo; }) }));
vi.mock("@/server/api/sessions", () => ({ SessionController: vi.fn(function () { return ctrl; }) }));

import { GET, PATCH, DELETE } from "./route";

const req = (body?: any) => ({ json: async () => body }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  // Default: the requester (u1) IS the session's curator.
  sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "c1", curatorId: "u1" });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  ctrl.getSession.mockResolvedValue({ id: "s1" });
  ctrl.updateSession.mockResolvedValue({ id: "s1" });
  ctrl.deleteSession.mockResolvedValue(undefined);
});

describe("/api/sessions/[id]", () => {
  it("GET 404 when the session does not exist", async () => {
    sessionRepo.findById.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "s1" } })).status).toBe(404);
  });
  it("GET 403 when the session's collection isn't accessible", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "s1" } })).status).toBe(403);
  });
  it("GET 200 for the session's curator", async () => {
    expect((await GET(req(), { params: { id: "s1" } })).status).toBe(200);
  });
  it("PATCH 403 when not accessible — and does NOT update", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await PATCH(req({ goal: "x" }), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(ctrl.updateSession).not.toHaveBeenCalled();
  });
  it("DELETE 403 when not accessible — and does NOT delete", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    const res = await DELETE(req(), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(ctrl.deleteSession).not.toHaveBeenCalled();
  });
  it("DELETE 200 for the owner who is also the session's curator (no membership row)", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await DELETE(req(), { params: { id: "s1" } })).status).toBe(200);
  });

  // purses-t9l: each user sorts independently — a member who is not the session's
  // curator may not read/update/delete it, even with collection access.
  it("GET 403 when the requester is not the session's curator", async () => {
    sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "c1", curatorId: "u9" });
    expect((await GET(req(), { params: { id: "s1" } })).status).toBe(403);
  });
  it("PATCH 403 when the requester is not the session's curator — and does NOT update", async () => {
    sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "c1", curatorId: "u9" });
    const res = await PATCH(req({ goal: "x" }), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(ctrl.updateSession).not.toHaveBeenCalled();
  });
  it("DELETE 403 when the requester is not the session's curator — and does NOT delete", async () => {
    sessionRepo.findById.mockResolvedValue({ id: "s1", collectionId: "c1", curatorId: "u9" });
    const res = await DELETE(req(), { params: { id: "s1" } });
    expect(res.status).toBe(403);
    expect(ctrl.deleteSession).not.toHaveBeenCalled();
  });
});
