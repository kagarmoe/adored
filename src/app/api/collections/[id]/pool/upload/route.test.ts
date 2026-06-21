import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGetSession, mockGetDb, membershipRepo, collectionRepo, mockHandleUpload } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    membershipRepo: { findByUser: vi.fn() },
    collectionRepo: { findById: vi.fn() },
    mockHandleUpload: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/repositories/implementations/MembershipRepository", () => ({
  MembershipRepository: vi.fn().mockImplementation(function () { return membershipRepo; }),
}));
vi.mock("@/server/repositories/implementations/CollectionRepository", () => ({
  CollectionRepository: vi.fn().mockImplementation(function () { return collectionRepo; }),
}));
vi.mock("@/server/repositories/implementations/PhotoRepository", () => ({
  PhotoRepository: vi.fn().mockImplementation(function () { return ({ create: vi.fn() }); }),
}));
vi.mock("@vercel/blob/client", () => ({ handleUpload: mockHandleUpload }));

import { POST } from "./route";

function makeReq() {
  return new Request("http://localhost/api/collections/c1/pool/upload", {
    method: "POST",
    body: JSON.stringify({ type: "blob.generate-client-token" }),
  }) as any;
}

describe("POST /api/collections/[id]/pool/upload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetDb.mockReturnValue({ db: "fake" });
    // Drive onBeforeGenerateToken so we exercise the real authorize path.
    mockHandleUpload.mockImplementation(async (opts: any) => {
      await opts.onBeforeGenerateToken("photos/x.jpg", null, false);
      return { ok: true };
    });
  });

  it("401 when unauthenticated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("403 when the user cannot add photos and is not owner", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ canAddPhotos: false });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u2" });
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });

  it("passes for the owner and returns the handleUpload response", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });

  it("passes for a member with canAddPhotos and returns the handleUpload response", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ canAddPhotos: true });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u2" });
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ok: true });
  });
});
