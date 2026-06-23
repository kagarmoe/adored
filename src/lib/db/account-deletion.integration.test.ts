// @vitest-environment node
//
// Integration tests for AccountDeletionService via DELETE /api/users/me.
//
// Seed: user U owns collection CA (items, photos, session, sort-result + items
// + share, preferences); U is ALSO a curator member of collection CB owned by V
// (with U's own session + sort-result + items + shares + decision-events +
// preferences + membership in CB; V's OWN rows in CB too).
//
// Assert BEFORE: every table populated (non-vacuous).
// Call DELETE /api/users/me as U.
// Assert AFTER: CA fully gone; U's borrowed-slice in CB gone; V's own rows in CB
// INTACT; U's user row PII scrubbed; U's account/session/verificationToken gone;
// blob del called for CA's photo keys.
//
// Run with:
//   RUN_DB_TESTS=1 DATABASE_URL_TEST=postgresql://postgres:test@localhost:5433/app_test \
//   npx vitest run --no-file-parallelism src/lib/db/account-deletion.integration.test.ts

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { mockAuth } from "../../../e2e/fixtures/mock-auth";
import { generateId } from "@/lib/id";

import {
  user as userTable,
  account as accountTable,
  session as sessionTable,
  verificationToken as verificationTokenTable,
  collectionsTable,
  itemsTable,
  photosTable,
  sessionsTable,
  decisionEventsTable,
  preferencesTable,
  sortResultsTable,
  sortResultItemsTable,
  sortResultSharesTable,
  invitationsTable,
  membershipsTable,
} from "@/lib/db/schema";

// ---- hoisted mocks ---------------------------------------------------------
const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
vi.mock("@/lib/auth", () => mockAuth(mockGetSession));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Mock @vercel/blob so del calls are tracked without hitting real storage.
const mockDel = vi.fn().mockResolvedValue(undefined);
vi.mock("@vercel/blob", () => ({ del: (...args: unknown[]) => mockDel(...args) }));

// deleteVariants calls del internally — stub it to a no-op too.
vi.mock("@/lib/photo-variants", async (importOriginal) => {
  const orig = await importOriginal<typeof import("@/lib/photo-variants")>();
  return { ...orig, deleteVariants: vi.fn().mockResolvedValue(undefined) };
});

// Route imported AFTER mocks are wired.
import { DELETE as meDelete } from "@/app/api/users/me/route";

// ---- gate ------------------------------------------------------------------
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

// ---- helpers ---------------------------------------------------------------

/** Read raw user row — bypasses mapToUser so we see exactly what's in the DB. */
async function rawUserRow(id: string) {
  const { db } = getTestDb();
  const [row] = await db.select().from(userTable).where(eq(userTable.id, id));
  return row ?? null;
}

async function countRows(
  db: ReturnType<typeof getTestDb>["db"],
  table: any,
  where: any,
): Promise<number> {
  const rows = await db.select().from(table).where(where);
  return rows.length;
}

// ============================================================================
describeDb("AccountDeletionService via DELETE /api/users/me", () => {
  let userId: string; // U — the user being deleted
  let otherUserId: string; // V — owner of the borrowed collection CB

  // IDs seeded for owned collection CA
  let caCollectionId: string;
  let caItemId: string;
  let caPhotoId: string;
  let caPhotoKey: string;
  let caSessionId: string;
  let caDecisionEventId: string;
  let caPrefId: string;
  let caDraftResultId: string;
  let caDraftResultItemId: string;
  let caFinalizedResultId: string;
  let caFinalizedResultItemId: string;
  let caShareId: string;
  let caInvitationId: string;
  let caMembershipId: string; // U's owner membership in CA

  // IDs seeded for borrowed collection CB (owned by V)
  let cbCollectionId: string;
  let cbItemId: string; // V's item in CB
  let cbVSessionId: string; // V's session in CB
  let cbVResultId: string; // V's result in CB
  let cbVResultItemId: string; // V's result-item in CB
  let uMembershipId: string; // U's curator membership in CB
  let uCbSessionId: string; // U's session in CB
  let uCbDecisionEventId: string; // U's decision event in CB
  let uCbPrefId: string; // U's preference in CB
  let uCbResultId: string; // U's sort result in CB
  let uCbResultItemId: string; // U's result-item in CB
  let uCbShareId: string; // U's share in CB

  beforeEach(async () => {
    await resetDb();
    vi.clearAllMocks();
    mockDel.mockResolvedValue(undefined);

    const { db } = getTestDb();

    // ---- Seed users --------------------------------------------------------
    userId = generateId("user");
    otherUserId = generateId("user");
    caPhotoKey = "https://blob.example/ca-hero.jpg";

    await db.insert(userTable).values([
      {
        id: userId,
        email: `u-${userId}@adored.test`,
        name: "User U",
        password: "hashed",
        emailVerified: new Date(),
      },
      {
        id: otherUserId,
        email: `v-${otherUserId}@adored.test`,
        name: "User V",
        emailVerified: new Date(),
      },
    ]);

    // Seed an account row + NextAuth session row for U (so purge deletes them).
    await db.insert(accountTable).values({
      userId,
      type: "credentials",
      provider: "credentials",
      providerAccountId: userId,
    });
    await db.insert(sessionTable).values({
      sessionToken: generateId("ntok"),
      userId,
      expires: new Date(Date.now() + 86400_000),
    });
    // Seed a verificationToken for U's email.
    await db.insert(verificationTokenTable).values({
      identifier: `u-${userId}@adored.test`,
      token: generateId("vtok"),
      expires: new Date(Date.now() + 3600_000),
    });

    // ---- Seed owned collection CA (full cascade) --------------------------
    caCollectionId = generateId("col");
    await db.insert(collectionsTable).values({
      id: caCollectionId,
      ownerId: userId,
      name: "CA Collection",
      slug: `ca-${caCollectionId}`,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Item
    caItemId = generateId("item");
    await db.insert(itemsTable).values({
      id: caItemId,
      collectionId: caCollectionId,
      name: "CA Item",
      unit: "imperial",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Photo (real http key so blob del fires)
    caPhotoId = generateId("photo");
    await db.insert(photosTable).values({
      id: caPhotoId,
      itemId: caItemId,
      collectionId: caCollectionId,
      blobKey: caPhotoKey,
      filename: "ca-hero.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: userId,
      isHero: true,
      rotation: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Session (application sort session, not NextAuth)
    caSessionId = generateId("sess");
    await db.insert(sessionsTable).values({
      id: caSessionId,
      collectionId: caCollectionId,
      curatorId: userId,
      number: 1,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Decision event
    caDecisionEventId = generateId("evt");
    await db.insert(decisionEventsTable).values({
      id: caDecisionEventId,
      sessionId: caSessionId,
      type: "triage",
      decision: { itemId: caItemId, result: "top" },
      createdAt: new Date(),
    });

    // Preference
    caPrefId = generateId("pref");
    await db.insert(preferencesTable).values({
      id: caPrefId,
      collectionId: caCollectionId,
      curatorId: userId,
      itemId: caItemId,
      score: "0.9",
      confidence: "1.0",
      rankBucket: "top",
      comparisonCount: 3,
      lastSeen: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Draft result + item
    caDraftResultId = generateId("result");
    await db.insert(sortResultsTable).values({
      id: caDraftResultId,
      collectionId: caCollectionId,
      curatorId: userId,
      number: 1,
      status: "draft",
      name: "CA Draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    caDraftResultItemId = generateId("sri");
    await db.insert(sortResultItemsTable).values({
      id: caDraftResultItemId,
      sortResultId: caDraftResultId,
      itemId: caItemId,
      computedRank: 1,
      computedBucket: "top",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Finalized result + item + share
    caFinalizedResultId = generateId("result");
    await db.insert(sortResultsTable).values({
      id: caFinalizedResultId,
      collectionId: caCollectionId,
      curatorId: userId,
      number: 2,
      status: "finalized",
      name: "CA Finalized",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    caFinalizedResultItemId = generateId("sri");
    await db.insert(sortResultItemsTable).values({
      id: caFinalizedResultItemId,
      sortResultId: caFinalizedResultId,
      itemId: caItemId,
      computedRank: 1,
      computedBucket: "top",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    caShareId = generateId("share");
    await db.insert(sortResultSharesTable).values({
      id: caShareId,
      sortResultId: caFinalizedResultId,
      shareToken: generateId("tok"),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Invitation to CA
    caInvitationId = generateId("inv");
    await db.insert(invitationsTable).values({
      id: caInvitationId,
      collectionId: caCollectionId,
      email: "invitee@adored.test",
      token: generateId("invtok"),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Membership: U is "owner" in CA (created alongside collection per PR3 pattern)
    caMembershipId = generateId("mem");
    await db.insert(membershipsTable).values({
      id: caMembershipId,
      collectionId: caCollectionId,
      userId,
      role: "owner",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // ---- Seed borrowed collection CB (owned by V) --------------------------
    cbCollectionId = generateId("col");
    await db.insert(collectionsTable).values({
      id: cbCollectionId,
      ownerId: otherUserId,
      name: "CB Collection",
      slug: `cb-${cbCollectionId}`,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // V's own item in CB
    cbItemId = generateId("item");
    await db.insert(itemsTable).values({
      id: cbItemId,
      collectionId: cbCollectionId,
      name: "CB Item (V owns)",
      unit: "imperial",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // V's sort session in CB
    cbVSessionId = generateId("sess");
    await db.insert(sessionsTable).values({
      id: cbVSessionId,
      collectionId: cbCollectionId,
      curatorId: otherUserId,
      number: 1,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // V's sort result + result-item in CB
    cbVResultId = generateId("result");
    await db.insert(sortResultsTable).values({
      id: cbVResultId,
      collectionId: cbCollectionId,
      curatorId: otherUserId,
      number: 1,
      status: "draft",
      name: "CB V Draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    cbVResultItemId = generateId("sri");
    await db.insert(sortResultItemsTable).values({
      id: cbVResultItemId,
      sortResultId: cbVResultId,
      itemId: cbItemId,
      computedRank: 1,
      computedBucket: "top",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // U's curator membership in CB
    uMembershipId = generateId("mem");
    await db.insert(membershipsTable).values({
      id: uMembershipId,
      collectionId: cbCollectionId,
      userId,
      role: "curator",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // U's sort session in CB
    uCbSessionId = generateId("sess");
    await db.insert(sessionsTable).values({
      id: uCbSessionId,
      collectionId: cbCollectionId,
      curatorId: userId,
      number: 2,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // U's decision event in CB
    uCbDecisionEventId = generateId("evt");
    await db.insert(decisionEventsTable).values({
      id: uCbDecisionEventId,
      sessionId: uCbSessionId,
      type: "triage",
      decision: { itemId: cbItemId, result: "high" },
      createdAt: new Date(),
    });

    // U's preference in CB
    uCbPrefId = generateId("pref");
    await db.insert(preferencesTable).values({
      id: uCbPrefId,
      collectionId: cbCollectionId,
      curatorId: userId,
      itemId: cbItemId,
      score: "0.5",
      confidence: "1.0",
      rankBucket: "high",
      comparisonCount: 1,
      lastSeen: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // U's sort result + result-item + share in CB
    uCbResultId = generateId("result");
    await db.insert(sortResultsTable).values({
      id: uCbResultId,
      collectionId: cbCollectionId,
      curatorId: userId,
      number: 2,
      status: "draft",
      name: "CB U Draft",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    uCbResultItemId = generateId("sri");
    await db.insert(sortResultItemsTable).values({
      id: uCbResultItemId,
      sortResultId: uCbResultId,
      itemId: cbItemId,
      computedRank: 1,
      computedBucket: "high",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    uCbShareId = generateId("share");
    await db.insert(sortResultSharesTable).values({
      id: uCbShareId,
      sortResultId: uCbResultId,
      shareToken: generateId("tok"),
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  afterAll(async () => {
    await closeDb();
  });

  // --------------------------------------------------------------------------
  it("full cascade: owned collection gone, borrowed slice gone, V's rows intact, PII scrubbed, blobs deleted", async () => {
    const { db } = getTestDb();

    // ---- BEFORE assertions (prove non-vacuous) ----------------------------
    expect(await countRows(db, collectionsTable, eq(collectionsTable.id, caCollectionId))).toBe(1);
    expect(await countRows(db, itemsTable, eq(itemsTable.id, caItemId))).toBe(1);
    expect(await countRows(db, photosTable, eq(photosTable.id, caPhotoId))).toBe(1);
    expect(await countRows(db, sessionsTable, eq(sessionsTable.id, caSessionId))).toBe(1);
    expect(await countRows(db, decisionEventsTable, eq(decisionEventsTable.id, caDecisionEventId))).toBe(1);
    expect(await countRows(db, preferencesTable, eq(preferencesTable.id, caPrefId))).toBe(1);
    expect(await countRows(db, sortResultsTable, eq(sortResultsTable.id, caDraftResultId))).toBe(1);
    expect(await countRows(db, sortResultItemsTable, eq(sortResultItemsTable.id, caDraftResultItemId))).toBe(1);
    expect(await countRows(db, sortResultSharesTable, eq(sortResultSharesTable.id, caShareId))).toBe(1);
    expect(await countRows(db, invitationsTable, eq(invitationsTable.id, caInvitationId))).toBe(1);
    expect(await countRows(db, membershipsTable, eq(membershipsTable.id, caMembershipId))).toBe(1);
    // Borrowed-slice BEFORE
    expect(await countRows(db, membershipsTable, eq(membershipsTable.id, uMembershipId))).toBe(1);
    expect(await countRows(db, sessionsTable, eq(sessionsTable.id, uCbSessionId))).toBe(1);
    expect(await countRows(db, decisionEventsTable, eq(decisionEventsTable.id, uCbDecisionEventId))).toBe(1);
    expect(await countRows(db, preferencesTable, eq(preferencesTable.id, uCbPrefId))).toBe(1);
    expect(await countRows(db, sortResultsTable, eq(sortResultsTable.id, uCbResultId))).toBe(1);
    expect(await countRows(db, sortResultItemsTable, eq(sortResultItemsTable.id, uCbResultItemId))).toBe(1);
    expect(await countRows(db, sortResultSharesTable, eq(sortResultSharesTable.id, uCbShareId))).toBe(1);
    // V's rows BEFORE (must survive)
    expect(await countRows(db, collectionsTable, eq(collectionsTable.id, cbCollectionId))).toBe(1);
    expect(await countRows(db, itemsTable, eq(itemsTable.id, cbItemId))).toBe(1);
    expect(await countRows(db, sessionsTable, eq(sessionsTable.id, cbVSessionId))).toBe(1);
    expect(await countRows(db, sortResultsTable, eq(sortResultsTable.id, cbVResultId))).toBe(1);
    expect(await countRows(db, sortResultItemsTable, eq(sortResultItemsTable.id, cbVResultItemId))).toBe(1);

    // ---- Call DELETE /api/users/me as U ----------------------------------
    mockGetSession.mockResolvedValue({ user: { id: userId } });
    const res = await meDelete();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.message).toBe("User account deleted");

    // ---- AFTER: owned collection CA fully gone ----------------------------
    expect(await countRows(db, collectionsTable, eq(collectionsTable.id, caCollectionId))).toBe(0);
    expect(await countRows(db, itemsTable, eq(itemsTable.id, caItemId))).toBe(0);
    expect(await countRows(db, photosTable, eq(photosTable.id, caPhotoId))).toBe(0);
    expect(await countRows(db, sessionsTable, eq(sessionsTable.id, caSessionId))).toBe(0);
    expect(await countRows(db, decisionEventsTable, eq(decisionEventsTable.id, caDecisionEventId))).toBe(0);
    expect(await countRows(db, preferencesTable, eq(preferencesTable.id, caPrefId))).toBe(0);
    expect(await countRows(db, sortResultsTable, eq(sortResultsTable.id, caDraftResultId))).toBe(0);
    expect(await countRows(db, sortResultsTable, eq(sortResultsTable.id, caFinalizedResultId))).toBe(0);
    expect(await countRows(db, sortResultItemsTable, eq(sortResultItemsTable.id, caDraftResultItemId))).toBe(0);
    expect(await countRows(db, sortResultItemsTable, eq(sortResultItemsTable.id, caFinalizedResultItemId))).toBe(0);
    expect(await countRows(db, sortResultSharesTable, eq(sortResultSharesTable.id, caShareId))).toBe(0);
    expect(await countRows(db, invitationsTable, eq(invitationsTable.id, caInvitationId))).toBe(0);
    expect(await countRows(db, membershipsTable, eq(membershipsTable.id, caMembershipId))).toBe(0);

    // ---- AFTER: U's borrowed slice in CB gone -----------------------------
    expect(await countRows(db, membershipsTable, eq(membershipsTable.id, uMembershipId))).toBe(0);
    expect(await countRows(db, sessionsTable, eq(sessionsTable.id, uCbSessionId))).toBe(0);
    expect(await countRows(db, decisionEventsTable, eq(decisionEventsTable.id, uCbDecisionEventId))).toBe(0);
    expect(await countRows(db, preferencesTable, eq(preferencesTable.id, uCbPrefId))).toBe(0);
    expect(await countRows(db, sortResultsTable, eq(sortResultsTable.id, uCbResultId))).toBe(0);
    expect(await countRows(db, sortResultItemsTable, eq(sortResultItemsTable.id, uCbResultItemId))).toBe(0);
    expect(await countRows(db, sortResultSharesTable, eq(sortResultSharesTable.id, uCbShareId))).toBe(0);

    // ---- AFTER: V's rows in CB INTACT ------------------------------------
    expect(await countRows(db, collectionsTable, eq(collectionsTable.id, cbCollectionId))).toBe(1);
    expect(await countRows(db, itemsTable, eq(itemsTable.id, cbItemId))).toBe(1);
    expect(await countRows(db, sessionsTable, eq(sessionsTable.id, cbVSessionId))).toBe(1);
    expect(await countRows(db, sortResultsTable, eq(sortResultsTable.id, cbVResultId))).toBe(1);
    expect(await countRows(db, sortResultItemsTable, eq(sortResultItemsTable.id, cbVResultItemId))).toBe(1);

    // ---- AFTER: PII scrubbed on U's user row -----------------------------
    const userRow = await rawUserRow(userId);
    expect(userRow).not.toBeNull(); // row kept (tombstone)
    expect(userRow!.email).toBe(`deleted+${userId}@deleted.invalid`);
    expect(userRow!.name).toBeNull();
    expect(userRow!.image).toBeNull();
    expect(userRow!.password).toBeNull();
    expect(userRow!.emailVerified).toBeNull();

    // ---- AFTER: account + session rows gone ------------------------------
    const acctRows = await db.select().from(accountTable).where(eq(accountTable.userId, userId));
    expect(acctRows).toHaveLength(0);
    const sessRows = await db.select().from(sessionTable).where(eq(sessionTable.userId, userId));
    expect(sessRows).toHaveLength(0);

    // ---- AFTER: verificationToken for old email gone ---------------------
    const vtRows = await db
      .select()
      .from(verificationTokenTable)
      .where(eq(verificationTokenTable.identifier, `u-${userId}@adored.test`));
    expect(vtRows).toHaveLength(0);

    // ---- AFTER: blob del called with CA photo key -----------------------
    expect(mockDel).toHaveBeenCalledWith(caPhotoKey);
  });

  // --------------------------------------------------------------------------
  it("401 when no session", async () => {
    mockGetSession.mockResolvedValue(null);
    const res = await meDelete();
    expect(res.status).toBe(401);
  });

  // --------------------------------------------------------------------------
  it("DELETE keys off session id — cannot delete another user's account", async () => {
    // Log in as U; V's row must survive.
    mockGetSession.mockResolvedValue({ user: { id: userId } });
    const res = await meDelete();
    expect(res.status).toBe(200);

    // V's user row is untouched.
    const vRow = await rawUserRow(otherUserId);
    expect(vRow).not.toBeNull();
    expect(vRow!.email).toBe(`v-${otherUserId}@adored.test`);
  });

  // --------------------------------------------------------------------------
  it("non-vacuous proof: dropping one delete makes the test fail (session not erased without deleteByCurator)", async () => {
    // Directly call the service with a sabotaged DB that skips the
    // borrowed-slice session delete, then verify the session row stays.
    const { db } = getTestDb();

    // Patch: temporarily override SessionRepository.deleteByCurator to a no-op.
    const { SessionRepository } = await import(
      "@/server/repositories/implementations/SessionRepository"
    );
    const original = SessionRepository.prototype.deleteByCurator;
    SessionRepository.prototype.deleteByCurator = async () => {};

    try {
      const { AccountDeletionService } = await import(
        "@/server/services/AccountDeletionService"
      );
      await new AccountDeletionService(db).deleteCurrentUser(userId);

      // U's CB session should still be there (the delete was sabotaged).
      const surviving = await db
        .select()
        .from(sessionsTable)
        .where(eq(sessionsTable.id, uCbSessionId));
      expect(surviving).toHaveLength(1); // non-vacuous: the row survived
    } finally {
      SessionRepository.prototype.deleteByCurator = original;
    }
  });
});
