import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

// KEEP-UNIT (Phase 3): pool/upload generates a @vercel/blob/client upload token
// and writes NO DB row in the request path (the durable row is written later by
// Blob's async onUploadCompleted callback). So this stays a plain mocked unit
// test — NOT a RUN_DB_TESTS integration test. It covers only what lives here:
// token-generation + the authorize gate (requireApiCapability). The DB-backed pool
// routes are covered by src/lib/db/pool-routes.integration.test.ts.
const { mockGetSession, mockGetDb, mockRequireApiCapability, mockHandleUpload } =
  vi.hoisted(() => ({
    mockGetSession: vi.fn(),
    mockGetDb: vi.fn(),
    mockRequireApiCapability: vi.fn(),
    mockHandleUpload: vi.fn(),
  }));

vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: mockGetDb }));
vi.mock("@/server/dal/collection-access", () => ({
  requireApiCapability: mockRequireApiCapability,
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
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(401);
  });

  it("403 when requireApiCapability returns a 403 response (non-member)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockRequireApiCapability.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(403);
  });

  it("404 when requireApiCapability returns a 404 response (absent collection)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    mockRequireApiCapability.mockResolvedValue(
      NextResponse.json({ error: "Not found" }, { status: 404 }),
    );
    const res = await POST(makeReq(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(404);
  });

  it("generates a token for the owner (photos:write = curator): invokes handleUpload and returns its response", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    // requireApiCapability returns the collection on success (not a NextResponse)
    mockRequireApiCapability.mockResolvedValue({ id: "c1", ownerId: "u1" });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: "c1" }) });
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

  it("generates a token for a curator member (full-curator model — canAddPhotos flag is inert)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "u1" } });
    // Any curator is allowed — requireApiCapability resolves to the collection.
    mockRequireApiCapability.mockResolvedValue({ id: "c1", ownerId: "u2" });

    const res = await POST(makeReq(), { params: Promise.resolve({ id: "c1" }) });
    expect(res.status).toBe(200);
    expect(mockHandleUpload).toHaveBeenCalledOnce();
    const body = (await res.json()) as { token: any };
    expect(JSON.parse(body.token.tokenPayload)).toEqual({ collectionId: "c1", uploadedBy: "u1" });
  });
});
