// src/lib/db/triage-decision.integration.test.ts
//
// purses-t9l: triage decisions. RULE — each user sorts INDEPENDENTLY; you may only
// record decisions in your OWN session. Cross-curator triage is forbidden.
//
// Original bug: a session's curatorId is its creator, but the decisions route
// recomputed preferences for the TRIAGING user and the triage page reads preferences
// for the triaging user, while ScoringService.computePreferences gathers decisions
// only from sessions where curatorId === that user. So a member triaging an owner's
// session wrote a decision_event but produced no preference for themselves and the
// item never advanced (201, silent). The fix enforces the rule: the decisions route
// 403s a non-curator, so cross-curator triage can't happen at all.
//
// Drives the REAL POST /api/sessions/[id]/decisions handler against the ephemeral
// Postgres, mocking only the two true boundaries (auth + db).
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { sql } from "drizzle-orm";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline } from "../../../e2e/fixtures/seed";
import { generateId } from "@/lib/id";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";

const { mockGetSession } = vi.hoisted(() => ({ mockGetSession: vi.fn() }));
// Flat-replace form: the spread form pulls in uninstalled nodemailer and errors.
vi.mock("@/lib/auth", () => ({ getSession: mockGetSession }));
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));

// Route imported via the @/ alias ([id] is a real dir).
import { POST } from "@/app/api/sessions/[id]/decisions/route";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

/** Build a POST request whose JSON body the route reads via req.json(). */
function decisionReq(body: unknown): Request {
  return new Request("http://localhost/api/sessions/x/decisions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Mirror of the triage page's "current item" predicate (triage/page.tsx:44-45):
 * an item is still untriaged for `userId` iff no preferences row exists for
 * (item, userId). Returns the untriaged item ids for the collection+user.
 */
async function untriagedItemIds(collectionId: string, userId: string): Promise<string[]> {
  const { db } = getTestDb();
  const items = await new ItemRepository(db).findByCollection(collectionId);
  const prefs = await new CollectionPreferenceItemRepository(db).findByCollection(
    collectionId,
    userId,
  );
  const triaged = new Set(prefs.map((p) => p.itemId));
  return items.filter((i) => !triaged.has(i.id)).map((i) => i.id);
}

describeDb("triage decision flow (route -> DB) — purses-t9l", () => {
  let ownerId: string;

  beforeEach(async () => {
    await resetDb();
    ownerId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  /**
   * Seed a collection + one item + an active session whose curator is `curatorId`.
   * Returns the ids the scenario needs.
   */
  async function seedCollectionItemSession(curatorId: string) {
    const { db } = getTestDb();
    const collectionId = generateId("col");
    await db.execute(sql`
      INSERT INTO collections (id, owner_id, name, status, created_at, updated_at)
      VALUES (${collectionId}, ${ownerId}, 'Triage repro', 'active', now(), now())
    `);
    const item = await new ItemRepository(db).create({ collectionId });
    const session = await new SessionRepository(db).create({ collectionId, curatorId });
    return { collectionId, itemId: item.id, sessionId: session.id };
  }

  it("A) OWNER triages own session: decision persists, preference is created, item advances", async () => {
    const { db } = getTestDb();
    const { collectionId, itemId, sessionId } = await seedCollectionItemSession(ownerId);

    mockGetSession.mockResolvedValue({ user: { id: ownerId } });
    const res = await POST(decisionReq({ type: "triage", decision: { itemId, result: "top" } }) as any, {
      params: { id: sessionId },
    });

    // Route status
    expect(res.status).toBe(201);

    // decision_events row written for this session
    const events = await new DecisionEventRepository(db).findBySession(sessionId);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe("triage");

    // preferences row exists for (collection, owner, item)
    const pref = await new CollectionPreferenceItemRepository(db).findByItem(itemId, ownerId);
    expect(pref).not.toBeNull();
    expect(pref!.rankBucket).toBe("top");

    // The triage page's untriaged predicate now EXCLUDES the item.
    const untriaged = await untriagedItemIds(collectionId, ownerId);
    expect(untriaged).not.toContain(itemId);
    expect(untriaged).toHaveLength(0);
  });

  /** Add a distinct member user with full sort access to `collectionId`. */
  async function addMember(collectionId: string): Promise<string> {
    const { db } = getTestDb();
    const memberId = generateId("user");
    await db.insert((await import("@/lib/db/schema")).user).values({
      id: memberId,
      email: `member-${memberId}@adored.test`,
      name: "Member Curator",
    });
    await new MembershipRepository(db).create({
      collectionId,
      userId: memberId,
      role: "curator",
      canManageCollection: false,
      canInviteMembers: false,
      canAddItems: true,
      canEditMetadata: true,
      canAddPhotos: true,
      canDeletePhotos: false,
      canSort: true,
      canViewOutputs: true,
    });
    return memberId;
  }

  it("B) MEMBER triages an OWNER-created session: BLOCKED (403), nothing written", async () => {
    const { db } = getTestDb();
    // Session curator is the OWNER.
    const { collectionId, itemId, sessionId } = await seedCollectionItemSession(ownerId);
    const memberId = await addMember(collectionId);

    // The MEMBER attempts to triage the OWNER's session — forbidden by the rule.
    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    const res = await POST(decisionReq({ type: "triage", decision: { itemId, result: "top" } }) as any, {
      params: { id: sessionId },
    });

    expect(res.status).toBe(403);

    // Nothing is written: no decision_events on the owner's session, no preference
    // for the member OR the owner from this blocked attempt.
    const events = await new DecisionEventRepository(db).findBySession(sessionId);
    expect(events).toHaveLength(0);
    expect(await new CollectionPreferenceItemRepository(db).findByItem(itemId, memberId)).toBeNull();
    expect(await new CollectionPreferenceItemRepository(db).findByItem(itemId, ownerId)).toBeNull();
  });

  it("C) MEMBER triages their OWN session: independent sort works (preference created, item advances)", async () => {
    const { db } = getTestDb();
    // Owner already has a session in the collection; the member creates THEIRS
    // (sessions_active_unique is per (collection, curator), so both can coexist).
    const { collectionId, itemId } = await seedCollectionItemSession(ownerId);
    const memberId = await addMember(collectionId);
    const memberSession = await new SessionRepository(db).create({ collectionId, curatorId: memberId });

    mockGetSession.mockResolvedValue({ user: { id: memberId } });
    const res = await POST(decisionReq({ type: "triage", decision: { itemId, result: "high" } }) as any, {
      params: { id: memberSession.id },
    });

    expect(res.status).toBe(201);
    const events = await new DecisionEventRepository(db).findBySession(memberSession.id);
    expect(events).toHaveLength(1);

    // The member's OWN preference is created and the item advances for them, while
    // the owner's independent sort is untouched.
    const memberPref = await new CollectionPreferenceItemRepository(db).findByItem(itemId, memberId);
    expect(memberPref).not.toBeNull();
    expect(memberPref!.rankBucket).toBe("high");
    expect(await untriagedItemIds(collectionId, memberId)).not.toContain(itemId);
    expect(await new CollectionPreferenceItemRepository(db).findByItem(itemId, ownerId)).toBeNull();
  });
});
