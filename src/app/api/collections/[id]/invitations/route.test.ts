import { describe, expect, it, vi, beforeEach } from "vitest";

const { mockGetSession, mockGetDb, collectionRepo, membershipRepo, invRepo } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockGetDb: vi.fn(() => ({})),
  collectionRepo: { findById: vi.fn() },
  membershipRepo: { findByUser: vi.fn() },
  invRepo: { findByCollection: vi.fn(), create: vi.fn() },
}));
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({ CollectionRepository: vi.fn(() => collectionRepo) }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({ MembershipRepository: vi.fn(() => membershipRepo) }));
vi.mock("@/server/repositories/implementations/InvitationRepository", () => ({ InvitationRepository: vi.fn(() => invRepo) }));

import { GET, POST } from "./route";

const req = (body?: any) => ({ json: async () => body, url: "http://localhost" }) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockGetSession.mockResolvedValue({ user: { id: "u1" } });
  collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u9" });
  membershipRepo.findByUser.mockResolvedValue({ id: "m1" });
  invRepo.findByCollection.mockResolvedValue([{ id: "inv1", collectionId: "c1" }]);
  invRepo.create.mockResolvedValue({ id: "inv2", collectionId: "c1" });
});

describe("GET invitations", () => {
  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(401);
  });
  it("403 when neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(403);
  });
  it("returns only this collection's invitations for a member", async () => {
    const res = await GET(req(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(invRepo.findByCollection).toHaveBeenCalledWith("c1");
  });
  it("allows the owner without a membership row", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    expect((await GET(req(), { params: { id: "c1" } })).status).toBe(200);
  });
});

describe("POST invitations", () => {
  it("403 when neither member nor owner", async () => {
    membershipRepo.findByUser.mockResolvedValue(null);
    expect((await POST(req({ email: "x@example.com" }), { params: { id: "c1" } })).status).toBe(403);
  });
  it("creates for a member", async () => {
    expect((await POST(req({ email: "x@example.com" }), { params: { id: "c1" } })).status).toBe(201);
  });
});
