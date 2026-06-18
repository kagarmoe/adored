// purses-51h: the preferences routes were requireAuth()-only — they self-scope to
// user.id (a member can't read/clear another's prefs) but a NON-member could still
// call them against any collection. The DELETE (clears prefs) is a write with no
// tenant gate. RULE — preferences are collection-scoped: only a member-or-owner may
// read/clear, AND the clear stays self-scoped to the caller. Drives REAL handlers +
// the shared guard against ephemeral Postgres; mocks only auth + db.
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace BOTH exports the routes use, derived from one spy (spread form pulls in nodemailer).
vi.mock("@/lib/auth", () => ({
  getSession: mockGetSession,
  requireAuth: async () => {
    const s = await mockGetSession();
    if (!s?.user) throw new Error("Unauthorized");
    return s.user;
  },
}));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

import { GET as flatPrefs } from "@/app/api/preferences/[collectionId]/route";
import { GET as nestedPrefs, DELETE as clearPrefs } from "@/app/api/collections/[id]/preferences/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Seed a collection owned by ownerId. Returns its id. */
async function seedCollection(ownerId: string): Promise<string> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, 'Prefs authz', 'active', now(), now())
  `);
  return collectionId;
}

/** Add a distinct member (curator role, full sort access) to the collection. */
async function addMember(collectionId: string): Promise<string> {
  const { db } = getTestDb();
  const memberId = generateId("user");
  await db.insert((await import("@/lib/db/schema")).user).values({
    id: memberId, email: `m-${memberId}@adored.test`, name: "Member",
  });
  await new MembershipRepository(db).create({
    collectionId, userId: memberId, role: "curator",
    canManageCollection: false, canInviteMembers: false, canAddItems: true,
    canEditMetadata: true, canAddPhotos: true, canDeletePhotos: false,
    canSort: true, canViewOutputs: true,
  });
  return memberId;
}

/** Seed one preference row for `curatorId` in `collectionId` (creates its FK item). */
async function seedPreference(collectionId: string, curatorId: string): Promise<void> {
  const { db } = getTestDb();
  const item = await new ItemRepository(db).create({ collectionId });
  await new CollectionPreferenceItemRepository(db).create({
    collectionId, curatorId, itemId: item.id,
    score: 1, confidence: 0.5, rankBucket: "top", comparisonCount: 1,
  });
}

describeDb("preferences routes membership gate (handlers -> DB) — purses-51h", () => {
  let ownerId: string;
  let collectionId: string;
  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
    collectionId = await seedCollection(ownerId);
  });
  afterAll(async () => { await closeDb(); });

  it("flat GET 403s a non-member", async () => {
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await flatPrefs(new Request("http://localhost/x") as any, { params: { collectionId } });
    expect(res.status).toBe(403);
  });

  it("flat GET 200s the owner", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await flatPrefs(new Request("http://localhost/x") as any, { params: { collectionId } });
    expect(res.status).toBe(200);
  });

  it("nested GET 200s a member", async () => {
    const memberId = await addMember(collectionId);
    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    const res = await nestedPrefs(new Request("http://localhost/x") as any, { params: { id: collectionId } });
    expect(res.status).toBe(200);
  });

  it("nested GET 200s the owner", async () => {
    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await nestedPrefs(new Request("http://localhost/x") as any, { params: { id: collectionId } });
    expect(res.status).toBe(200);
  });

  it("nested DELETE 403s a non-member and leaves prefs intact (IDOR write)", async () => {
    const { db } = getTestDb();
    await seedPreference(collectionId, ownerId);
    mockGetSession.mockResolvedValue({ user: { id: "intruder_user" } });
    const res = await clearPrefs(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: collectionId } });
    expect(res.status).toBe(403);
    const survivors = await new CollectionPreferenceItemRepository(db).findByCollection(collectionId, ownerId);
    expect(survivors).toHaveLength(1);
  });

  it("nested DELETE 200s the owner and clears only the owner's prefs (self-scope)", async () => {
    const { db } = getTestDb();
    const memberId = await addMember(collectionId);
    await seedPreference(collectionId, ownerId);
    await seedPreference(collectionId, memberId);

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await clearPrefs(new Request("http://localhost/x", { method: "DELETE" }) as any, { params: { id: collectionId } });
    expect(res.status).toBe(200);

    const repo = new CollectionPreferenceItemRepository(db);
    expect(await repo.findByCollection(collectionId, ownerId)).toHaveLength(0);
    expect(await repo.findByCollection(collectionId, memberId)).toHaveLength(1);
  });
});
