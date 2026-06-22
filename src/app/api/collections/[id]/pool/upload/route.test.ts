import { beforeEach, describe, expect, it, vi } from "vitest";

// KEEP-UNIT (Phase 3): pool/upload generates a @vercel/blob/client upload token
// and writes NO DB row in the request path (the durable row is written later by
// Blob's async onUploadCompleted callback). So this stays a plain mocked unit
// test — NOT a RUN_DB_TESTS integration test. It covers only what lives here:
// token-generation + the authorize gate (assertCanAddPhotos). The DB-backed pool
// routes are covered by src/lib/db/pool-routes.integration.test.ts.
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
    // Drive onBeforeGenerateToken so we exercise the real authorize path AND can
    // assert the generated token's shape (allowlist + size cap + signed payload).
    mockHandleUpload.mockImplementation(async (opts: any) => {
      const token = await opts.onBeforeGenerateToken("photos/x.jpg", null, false);
      return { token };
    });
  });

  it("401 when unauthenticated — no token generated", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(401);
  });

  it("403 when the user lacks canAddPhotos and is not owner — no token generated", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ canAddPhotos: false });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u2" });
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(403);
  });

  it("404 when the collection does not exist — no token generated", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue(null);
    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(404);
  });

  it("generates a token for the owner: invokes handleUpload and returns its response", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue(null);
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u1" });

    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(mockHandleUpload).toHaveBeenCalledOnce();

    // The generated token carries the upload contract + a signed payload binding
    // the upload to this collection and uploader.
    const body = (await res.json()) as { token: any };
    expect(body.token.maximumSizeInBytes).toBeGreaterThan(0);
    expect(Array.isArray(body.token.allowedContentTypes)).toBe(true);
    expect(body.token.allowedContentTypes.length).toBeGreaterThan(0);
    expect(JSON.parse(body.token.tokenPayload)).toEqual({ collectionId: "c1", uploadedBy: "u1" });
  });

  it("generates a token for a member with canAddPhotos", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    membershipRepo.findByUser.mockResolvedValue({ canAddPhotos: true });
    collectionRepo.findById.mockResolvedValue({ id: "c1", ownerId: "u2" });

    const res = await POST(makeReq(), { params: { id: "c1" } });
    expect(res.status).toBe(200);
    expect(mockHandleUpload).toHaveBeenCalledOnce();
    const body = (await res.json()) as { token: any };
    expect(JSON.parse(body.token.tokenPayload)).toEqual({ collectionId: "c1", uploadedBy: "u1" });
  });
});
