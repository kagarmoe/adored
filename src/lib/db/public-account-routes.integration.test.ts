// @vitest-environment node
//
// Real-DB integration tests for three routes:
//   - GET /api/shared-results/[token]                (public, no auth required)
//   - GET /api/shared-results/[token]/photos/[photoId] (public, token-scoped photo bytes)
//   - GET/PATCH/DELETE /api/users/me                 (session-gated, self-only)
//
// Harness: real Postgres via getTestDb; mocks only getSession, getDb, and
// (for the photo route) @vercel/blob's `get` — the one true external boundary
// servePhotoFile crosses, mirroring file-route-authz.integration.test.ts.
// Run with: RUN_DB_TESTS=1 npx vitest run src/lib/db/public-account-routes.integration.test.ts

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedFullCollection, seedUserRow } from "../../../e2e/fixtures/seed";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { generateId } from "@/lib/id";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { user as userTable } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

// ---- hoisted spies ---------------------------------------------------------
const { mockGetSession, mockBlobGet } = vi.hoisted(() => ({
  mockGetSession: vi.fn(),
  mockBlobGet: vi.fn(),
}));

vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));
vi.mock("@vercel/blob", () => ({ get: mockBlobGet }));

// Routes imported AFTER mocks are wired.
import { GET as sharedResultsGet } from "@/app/api/shared-results/[token]/route";
import { GET as sharedPhotoGet } from "@/app/api/shared-results/[token]/photos/[photoId]/route";
import { GET as meGet, PATCH as mePatch, DELETE as meDelete } from "@/app/api/users/me/route";

// ---- gate ------------------------------------------------------------------
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// ---- helpers ---------------------------------------------------------------

function makeRequest(method: string, body?: unknown): Request {
  return new Request(`http://localhost/test`, {
    method,
    headers: body !== undefined ? { "content-type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

/** Read a raw user row directly — bypasses the repo's mapToUser so we see
 *  exactly what is (and isn't) in the DB. Returns null when the row is absent. */
async function rawUserRow(id: string) {
  const { db } = getTestDb();
  const [row] = await db.select().from(userTable).where(eq(userTable.id, id));
  return row ?? null;
}

// ============================================================================
describeDb("GET /api/shared-results/[token] (public route)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("valid active share token returns the share object (no session needed)", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection(ownerId);

    // seedFullCollection creates a share on the finalized result; find its token.
    const [shareRow] = await db.execute(
      sql`SELECT share_token FROM sort_result_shares
          WHERE sort_result_id IN (
            SELECT id FROM sort_results WHERE collection_id = ${seed.collectionId} AND status = 'finalized'
          ) LIMIT 1`,
    );
    const token = (shareRow as { share_token: string }).share_token;
    expect(token).toBeTruthy();

    // No session set — the route MUST NOT require auth.
    mockGetSession.mockResolvedValue(null);

    const res = await sharedResultsGet(makeRequest("GET") as any, {
      params: Promise.resolve({ token }),
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    // Handler returns the share object: shareToken, status, sortResultId present.
    expect(body).toMatchObject({
      shareToken: token,
      status: "active",
    });
    expect(typeof body.sortResultId).toBe("string");
  });

  it("unknown token returns 404", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await sharedResultsGet(makeRequest("GET") as any, {
      params: Promise.resolve({ token: "tok-does-not-exist" }),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("revoked share token returns 404 (not the share data)", async () => {
    const { db } = getTestDb();
    await seedFullCollection(ownerId);

    // Create a fresh share and immediately revoke it.
    const [row] = await db.execute(
      sql`SELECT id FROM sort_results WHERE collection_id IN (
            SELECT id FROM collections WHERE owner_id = ${ownerId}
          ) LIMIT 1`,
    );
    const sortResultId = (row as { id: string }).id;

    const shareRepo = new SortResultShareRepository(db);
    const token = generateId("tok-revoked");
    const share = await shareRepo.create({ sortResultId, shareToken: token });
    await shareRepo.update(share.id, { status: "revoked" });

    mockGetSession.mockResolvedValue(null);

    const res = await sharedResultsGet(makeRequest("GET") as any, {
      params: Promise.resolve({ token }),
    });

    expect(res.status).toBe(404);
  });

  it("does NOT require auth — a null session still returns the share", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection(ownerId);
    const [shareRow] = await db.execute(
      sql`SELECT share_token FROM sort_result_shares
          WHERE sort_result_id IN (
            SELECT id FROM sort_results WHERE collection_id = ${seed.collectionId}
          ) LIMIT 1`,
    );
    const token = (shareRow as { share_token: string }).share_token;

    // Explicitly null session — the public route must not reject unauthenticated callers.
    mockGetSession.mockResolvedValue(null);

    const res = await sharedResultsGet(makeRequest("GET") as any, {
      params: Promise.resolve({ token }),
    });

    expect(res.status).toBe(200);
  });
});

// ============================================================================
// purses-21x5.1: the token-scoped photo byte route. servePhotoFile's own
// resize/etag/cache behavior is covered elsewhere (file-route-authz, item-photo
// routes) — this suite is the un-mocked crossing the testing principle demands:
// a real share row, a real finalized result, a real ranked-result-item, and a
// real photo row, reached with NO session, through the actual route → repo →
// Postgres stack. @vercel/blob's `get` is mocked (the one true external
// boundary), so "200 with image bytes" here means "servePhotoFile's own
// success path executed for real bytes it received from that mocked read" —
// the same honesty bar file-route-authz.integration.test.ts already sets.
describeDb("GET /api/shared-results/[token]/photos/[photoId] (public route)", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    mockBlobGet.mockResolvedValue({
      statusCode: 200,
      stream: new Response(new Uint8Array([1, 2, 3])).body,
      blob: { contentType: "image/jpeg" },
    });
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  function photoCtx(token: string, photoId: string) {
    return { params: Promise.resolve({ token, photoId }) } as never;
  }

  it("200s with image bytes for a photo whose item IS ranked in the shared (finalized) result — no session needed", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection(ownerId);

    // itemB is the finalized result's ranked item (see seedFullCollection), but
    // its only seeded photo is soft-deleted — create a fresh active one.
    const photo = await new PhotoRepository(db).create({
      itemId: seed.itemBId,
      collectionId: seed.collectionId,
      blobKey: "https://blob.example/shared-b.jpg",
      filename: "shared-b.jpg",
      mimeType: "image/jpeg",
      fileSize: 3,
      uploadedBy: ownerId,
      isHero: true,
    });

    const [shareRow] = await db.execute(
      sql`SELECT share_token FROM sort_result_shares
          WHERE sort_result_id IN (
            SELECT id FROM sort_results WHERE collection_id = ${seed.collectionId} AND status = 'finalized'
          ) LIMIT 1`,
    );
    const token = (shareRow as { share_token: string }).share_token;

    mockGetSession.mockResolvedValue(null);
    const res = await sharedPhotoGet(makeRequest("GET") as any, photoCtx(token, photo.id));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/jpeg");
    const bytes = new Uint8Array(await res.arrayBuffer());
    expect(bytes).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("404s for a photo whose item is NOT ranked in the shared result — a share token can't reach an unrelated collection photo", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection(ownerId);

    // itemA carries an active photo but is only in the DRAFT result, never the
    // finalized one that's shared.
    const [activePhoto] = await new PhotoRepository(db).findByItem(seed.itemAId);

    const [shareRow] = await db.execute(
      sql`SELECT share_token FROM sort_result_shares
          WHERE sort_result_id IN (
            SELECT id FROM sort_results WHERE collection_id = ${seed.collectionId} AND status = 'finalized'
          ) LIMIT 1`,
    );
    const token = (shareRow as { share_token: string }).share_token;

    mockGetSession.mockResolvedValue(null);
    const res = await sharedPhotoGet(makeRequest("GET") as any, photoCtx(token, activePhoto.id));

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("404s for a revoked share — never reaches servePhotoFile", async () => {
    const { db } = getTestDb();
    const seed = await seedFullCollection(ownerId);
    const photo = await new PhotoRepository(db).create({
      itemId: seed.itemBId,
      collectionId: seed.collectionId,
      blobKey: "https://blob.example/shared-b2.jpg",
      filename: "shared-b2.jpg",
      mimeType: "image/jpeg",
      fileSize: 3,
      uploadedBy: ownerId,
      isHero: false,
    });

    const [row] = await db.execute(
      sql`SELECT id FROM sort_results WHERE collection_id = ${seed.collectionId} AND status = 'finalized'`,
    );
    const sortResultId = (row as { id: string }).id;
    const shareRepo = new SortResultShareRepository(db);
    const token = generateId("tok-revoked-photo");
    const share = await shareRepo.create({ sortResultId, shareToken: token });
    await shareRepo.update(share.id, { status: "revoked" });

    mockGetSession.mockResolvedValue(null);
    const res = await sharedPhotoGet(makeRequest("GET") as any, photoCtx(token, photo.id));

    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });

  it("404s for an unknown token", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await sharedPhotoGet(makeRequest("GET") as any, photoCtx("tok-does-not-exist", "photo-does-not-exist"));
    expect(res.status).toBe(404);
    expect(mockBlobGet).not.toHaveBeenCalled();
  });
});

// ============================================================================
describeDb("GET /api/users/me", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("returns the current user keyed by session id", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await meGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ownerId);
    expect(body.email).toBe("e2e@adored.test");
  });

  it("401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await meGet();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toHaveProperty("error");
  });

  it("returns the caller's OWN user, not another user's (session id is the sole key)", async () => {
    // Create a second user and ensure GET /me for ownerId does NOT return that user.
    const otherId = await seedUserRow("other-user");
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await meGet();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.id).toBe(ownerId);
    expect(body.id).not.toBe(otherId);
  });
});

// ============================================================================
describeDb("PATCH /api/users/me", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("updates the user's name and the DB row reflects the change", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    const res = await mePatch(makeRequest("PATCH", { name: "Updated Name" }) as any);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.name).toBe("Updated Name");

    // Real DB assertion — the change actually persisted.
    const row = await rawUserRow(ownerId);
    expect(row?.name).toBe("Updated Name");
  });

  it("ignores an email field (name-only endpoint)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Email mutation is intentionally out of scope here (spec §5.1): the schema
    // strips `email`, so this body parses to {} and is a no-op. The endpoint
    // returns 200 and the seeded email is left UNCHANGED.
    const res = await mePatch(makeRequest("PATCH", { email: "new@adored.test" }) as any);
    expect(res.status).toBe(200);

    const row = await rawUserRow(ownerId);
    expect(row?.email).toBe("e2e@adored.test");
  });

  it("401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await mePatch(makeRequest("PATCH", { name: "x" }) as any);
    expect(res.status).toBe(401);
  });

  it("400 on malformed JSON body", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Send a Request with a broken JSON body.
    const bad = new Request("http://localhost/test", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: "{ not valid json",
    });
    const res = await mePatch(bad as any);
    expect(res.status).toBe(400);
  });

  it("empty name clears it to the email local-part (200)", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Name-only + empty-clears contract (spec §5.1): an empty name is NOT a 400.
    // better-auth's `user.name` is NOT NULL, so clearing falls back to the email
    // local-part (keeps the session header non-empty) and returns 200.
    const res = await mePatch(makeRequest("PATCH", { name: "" }) as any);
    expect(res.status).toBe(200);

    const row = await rawUserRow(ownerId);
    // Baseline user email is e2e@adored.test → local-part "e2e".
    expect(row?.name).toBe("e2e");
  });
});

// ============================================================================
describeDb("DELETE /api/users/me", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const res = await meDelete();
    expect(res.status).toBe(401);
  });

  it("DELETE scrubs PII: email + name tombstoned, emailVerified reset", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });

    // Confirm the row exists before DELETE.
    const before = await rawUserRow(ownerId);
    expect(before).not.toBeNull();

    const res = await meDelete();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("User account deleted");

    // User row kept as tombstone — PII scrubbed. name is NOT NULL (better-auth),
    // so it is tombstoned rather than nulled.
    const after = await rawUserRow(ownerId);
    expect(after).not.toBeNull();
    expect(after?.email).toBe(`deleted+${ownerId}@deleted.invalid`);
    expect(after?.name).toBe(`deleted+${ownerId}@deleted.invalid`);
    expect(after?.emailVerified).toBe(false);
  });

  it("DELETE keys off session id — a user cannot delete another user's account", async () => {
    // The route has no id param; it uses session.user.id exclusively.
    // Create a second user and verify DELETE for ownerId leaves the second user untouched.
    const otherId = await seedUserRow("other-to-survive");

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await meDelete();
    expect(res.status).toBe(200);

    // The other user's row is unaffected.
    const otherRow = await rawUserRow(otherId);
    expect(otherRow).not.toBeNull();
  });
});
