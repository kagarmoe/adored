import { eq } from "drizzle-orm";
import { user, collectionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getTestDb, resetDb, closeDb } from "./db";
import { createBetterAuthUser } from "./better-auth";
import { sql } from "drizzle-orm";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultShareRepository } from "@/server/repositories/implementations/SortResultShareRepository";
import { SortResultService } from "@/server/services/SortResultService";
import { MembershipRepository } from "@/server/repositories/implementations/MembershipRepository";
import { DecisionEventRepository } from "@/server/repositories/implementations/DecisionEventRepository";
import { InvitationRepository } from "@/server/repositories/implementations/InvitationRepository";

// A known user every spec can log in as through better-auth (email+password).
export const BASELINE_USER = {
  email: "e2e@adored.test",
  password: "e2e-password-123", // ≥ 8 chars (signup rule)
  name: "E2E Tester",
} as const;

/**
 * Ensure a legacy `user` row for the baseline user exists and return its id
 * (idempotent by email). This is the ownerId every domain fixture seeds under.
 *
 * Two callers, one invariant — the returned id must equal the id the app's
 * getSession() reports for the baseline session:
 *  - e2e: auth.setup.ts signs up the baseline user via better-auth FIRST and
 *    mirrors a `user` row with the better-auth-generated id. Every later
 *    seedBaseline() call here finds that row by email and returns that same id,
 *    so seeded data is owned by the authenticated session.
 *  - DB integration tests (test:db): no server runs, so no better-auth signup
 *    happened. seedBaseline() inserts a plain `user` row itself. These tests
 *    call the DAL directly with this id — they never authenticate — so a
 *    self-consistent id is all that's required. No password: better-auth owns
 *    authentication; the legacy `password` column is unused post-cutover.
 */
export async function seedBaseline(): Promise<string> {
  const { db } = getTestDb();
  const existing = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, BASELINE_USER.email))
    .limit(1);
  if (existing.length) return existing[0].id;

  const id = generateId("user");
  await db.insert(user).values({
    id,
    email: BASELINE_USER.email,
    name: BASELINE_USER.name,
  });
  return id;
}

/**
 * Seed `count` collections owned by the given user. Used by the layout spec so
 * the collections grid actually renders (the page shows EmptyState with zero
 * collections, which never exercises the grid). Returns the created ids.
 */
export async function seedCollections(
  ownerId: string,
  count = 3,
): Promise<string[]> {
  const { db } = getTestDb();
  const ids: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = generateId("col");
    await db.insert(collectionsTable).values({
      id,
      ownerId,
      name: `E2E Collection ${i + 1}`,
    });
    ids.push(id);
  }
  return ids;
}

/**
 * Seed a complete triage scenario owned by `ownerId`: a collection (with slug),
 * one item, one hero photo (placeholder blobKey — the e2e intercepts /file), and
 * an active sort session. Returns the ids the spec needs.
 */
export async function seedTriageScenario(ownerId: string): Promise<{
  collectionId: string;
  slug: string;
  sessionNumber: number;
}> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  const slug = `e2e-triage-bags-${collectionId}`;
  await db.insert(collectionsTable).values({
    id: collectionId,
    ownerId,
    name: "E2E Triage Bags",
    slug,
  });
  const item = await new ItemRepository(db).create({ collectionId });
  await new PhotoRepository(db).create({
    itemId: item.id,
    collectionId,
    blobKey: "e2e-placeholder",
    filename: "e2e-placeholder.jpg",
    mimeType: "image/jpeg",
    fileSize: 1,
    uploadedBy: ownerId,
    isHero: true,
  });
  const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
  // URLs resolve sessions by their per-collection number now (#purses-9hl), not the ULID.
  if (session.number == null) throw new Error("seedTriageScenario: session.number was not allocated");
  return { collectionId, slug, sessionNumber: session.number };
}

/** Score/confidence/comparisonCount don't matter for presentation — only the
 *  bucket placement does (it drives which tier card and which rank an item lands
 *  in). Seeds three of the four buckets — top/high/low — leaving `medium` (Maybe)
 *  intentionally unpopulated; the page renders all four tier *labels* regardless of
 *  whether a bucket has items. (The low tier's live label is "Onward".) */
const SORT_SCENARIO_BUCKETS = ["top", "high", "low"] as const;

/**
 * Seed a fresh, UNTRIAGED journey scenario owned by `ownerId`: a collection
 * (with slug), `count` items each with a hero photo (placeholder blobKey — the
 * e2e intercepts /file), and an active sort session — but NO preferences. This
 * is the live-flow fixture: the journey test drives triage → compare →
 * SeeResultsCard → results entirely through the real UI/API, so the data must
 * start empty (no buckets), unlike seedSortScenario which pre-materializes a
 * result. `count` defaults to 2 so the compare step has a pair to choose from.
 * Returns the ids the spec needs.
 */
export async function seedJourneyScenario(
  ownerId: string,
  count = 2,
): Promise<{ collectionId: string; slug: string; sessionNumber: number; itemIds: string[] }> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  const slug = `e2e-journey-bags-${collectionId}`;
  await db.insert(collectionsTable).values({
    id: collectionId,
    ownerId,
    name: "E2E Journey Bags",
    slug,
  });

  const itemRepo = new ItemRepository(db);
  const photoRepo = new PhotoRepository(db);
  const itemIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const item = await itemRepo.create({ collectionId, name: `E2E Journey Item ${i + 1}` });
    await photoRepo.create({
      itemId: item.id,
      collectionId,
      blobKey: "e2e-placeholder",
      filename: "e2e-placeholder.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: true,
    });
    itemIds.push(item.id);
  }

  const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
  if (session.number == null) throw new Error("seedJourneyScenario: session.number was not allocated");
  return { collectionId, slug, sessionNumber: session.number, itemIds };
}

/** A seeded collection the workspace spec navigates to, keyed by slug. */
export interface SeededCollectionRef {
  collectionId: string;
  slug: string;
}

/**
 * Seed the four adaptive-workspace shapes the `/collections/[id]` page renders
 * (Task 4): the page derives its state from the two bounded preview row counts,
 * so each fixture differs only in whether loose pool photos and/or items exist.
 *
 *   - poolOnly  → loose pool photos, no items        → "pool-first"
 *   - itemsOnly → no pool photos, one item w/ hero   → "items-first"
 *   - both      → loose pool photos AND one item     → "pool-first" (pool then items)
 *   - empty     → neither                            → "empty"
 *
 * Pool photos are loose (`itemId: null`) so findPoolByCollection picks them up;
 * item photos are heroes so the ItemCard cover resolves. Placeholder blobKeys
 * ("e2e-placeholder") rely on the same `/file` intercept every image spec uses.
 * Uniquely-ided per call, so it is safe to seed per-test without resetDb()
 * (which would wipe the baseline user the shared storageState depends on).
 */
export async function seedWorkspaceStates(ownerId: string): Promise<{
  poolOnly: SeededCollectionRef;
  itemsOnly: SeededCollectionRef;
  both: SeededCollectionRef;
  empty: SeededCollectionRef;
}> {
  const { db } = getTestDb();
  const itemRepo = new ItemRepository(db);
  const photoRepo = new PhotoRepository(db);

  async function makeCollection(label: string): Promise<SeededCollectionRef> {
    const collectionId = generateId("col");
    const slug = `e2e-workspace-${label}-${collectionId}`;
    await db.insert(collectionsTable).values({
      id: collectionId,
      ownerId,
      name: `E2E Workspace ${label}`,
      slug,
    });
    return { collectionId, slug };
  }

  async function addPoolPhoto(collectionId: string, n: number): Promise<void> {
    await photoRepo.create({
      itemId: null, // loose in the pool — the workspace's pool-first signal
      collectionId,
      blobKey: "e2e-placeholder",
      filename: `pool-${n}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: false,
    });
  }

  async function addItemWithHero(collectionId: string, name: string): Promise<void> {
    const item = await itemRepo.create({ collectionId, name });
    await photoRepo.create({
      itemId: item.id,
      collectionId,
      blobKey: "e2e-placeholder",
      filename: `${name}.jpg`,
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: true,
    });
  }

  const poolOnly = await makeCollection("pool-only");
  await addPoolPhoto(poolOnly.collectionId, 1);
  await addPoolPhoto(poolOnly.collectionId, 2);

  const itemsOnly = await makeCollection("items-only");
  await addItemWithHero(itemsOnly.collectionId, "E2E Workspace Tote");

  const both = await makeCollection("both");
  await addPoolPhoto(both.collectionId, 1);
  await addItemWithHero(both.collectionId, "E2E Workspace Clutch");

  const empty = await makeCollection("empty");

  return { poolOnly, itemsOnly, both, empty };
}

/**
 * Seed a fully-populated sort *result* scenario owned by `ownerId`: a collection
 * (with slug), three items each with a hero photo, an active session, the owner's
 * `CollectionPreferenceItem` rows spread across buckets (top/high/low), AND a
 * draft `SortResult` built the correct way — via `SortResultService.createDraftResult`,
 * which reads those preferences and writes the ranked `SortResultItem` rows.
 *
 * This is RENDERER-ONLY scaffolding: it deliberately bypasses the live sort route
 * (which is broken) so the populated-results e2e proves *presentation*, not the
 * sort→result seam (that seam is pinned separately). Mirrors `seedTriageScenario`.
 *
 * Returns the ids the spec needs, including the result's per-collection `resultNumber`
 * (URLs resolve results by number now, #purses-9hl, not the ULID).
 */
export async function seedSortScenario(ownerId: string): Promise<{
  collectionId: string;
  slug: string;
  sessionNumber: number;
  itemIds: string[];
  resultNumber: number;
  finalizedResultNumber: number;
}> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  const slug = `e2e-sort-bags-${collectionId}`;
  await db.insert(collectionsTable).values({
    id: collectionId,
    ownerId,
    name: "E2E Sort Bags",
    slug,
  });

  const itemRepo = new ItemRepository(db);
  const photoRepo = new PhotoRepository(db);
  const prefRepo = new CollectionPreferenceItemRepository(db);

  const itemIds: string[] = [];
  for (let i = 0; i < SORT_SCENARIO_BUCKETS.length; i++) {
    const bucket = SORT_SCENARIO_BUCKETS[i];
    const item = await itemRepo.create({ collectionId, name: `E2E Sort Item ${i + 1}` });
    await photoRepo.create({
      itemId: item.id,
      collectionId,
      blobKey: "e2e-placeholder",
      filename: "e2e-placeholder.jpg",
      mimeType: "image/jpeg",
      fileSize: 1,
      uploadedBy: ownerId,
      isHero: true,
    });
    // Higher score = more loved, so createDraftResult ranks them top → low in order.
    await prefRepo.create({
      collectionId,
      curatorId: ownerId,
      itemId: item.id,
      score: 100 - i * 10,
      confidence: 1,
      rankBucket: bucket,
      comparisonCount: 3,
    });
    itemIds.push(item.id);
  }

  const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
  if (session.number == null) throw new Error("seedSortScenario: session.number was not allocated");

  // Epic S: usage answers so the Standing usage chip renders. item[0] becomes the
  // hero (no chip); put "uses" on item[1] ("In your life" in the full ranking) and
  // "not_uses" on item[2] ("Resting" in the Onward section). createDraftResult's
  // deriveCuratorUsage reads these, so the draft snapshot + live Decide page both
  // show the chips.
  const decisionRepo = new DecisionEventRepository(db);
  await decisionRepo.create({
    sessionId: session.id,
    type: "usage",
    decision: { itemId: itemIds[1], result: "uses" },
  });
  await decisionRepo.create({
    sessionId: session.id,
    type: "usage",
    decision: { itemId: itemIds[2], result: "not_uses" },
  });

  // The correct path: the service reads the seeded preferences and materializes
  // the ranked result items — same code the real finalize flow uses.
  const service = new SortResultService(
    new SortResultRepository(db),
    new SortResultItemRepository(db),
    prefRepo,
    db,
  );
  const result = await service.createDraftResult(collectionId, ownerId, "E2E Sort Result");
  if (result.number == null) throw new Error("seedSortScenario: result.number was not allocated");

  // Epic S: a FINALIZED result carrying the same usage snapshot, so the "Saved"
  // result surface can show the chip too. Built the DB-layer way (mirrors
  // seedRemovalScenario) so the existing draft stays intact.
  const resultRepo = new SortResultRepository(db);
  const resultItemRepo = new SortResultItemRepository(db);
  const finalized = await resultRepo.create({
    collectionId,
    curatorId: ownerId,
    name: "E2E Sort Result (Saved)",
    status: "finalized",
  });
  if (finalized.number == null) throw new Error("seedSortScenario: finalized.number was not allocated");
  const finalizedUsage = ["uses", "uses", "not_uses"] as const;
  for (let i = 0; i < itemIds.length; i++) {
    await resultItemRepo.create({
      sortResultId: finalized.id,
      itemId: itemIds[i],
      computedRank: i,
      computedBucket: SORT_SCENARIO_BUCKETS[i],
      usage: finalizedUsage[i],
    });
  }

  return {
    collectionId,
    slug,
    sessionNumber: session.number,
    itemIds,
    resultNumber: result.number,
    finalizedResultNumber: finalized.number,
  };
}

/**
 * Seed the members + invitations surface owned by `ownerId`: a collection (with
 * slug), an OWNER membership row for `ownerId`, and a CURATOR membership row for
 * a fresh 2nd user. Net-new because the members page reads only the `memberships`
 * table (`listMembers` → `findByCollection`); a collection's `ownerId` alone
 * produces ZERO membership rows, so the page would render an empty table with no
 * RoleBadge. Both rows are needed to exercise: the owner "Owner" badge, the
 * curator "Curator" badge + its Remove control, and the owner row having NO Remove.
 *
 * Uniquely-ided per call, so it is safe to seed per-test without resetDb()
 * (which would wipe the baseline user the shared storageState depends on).
 * Returns the ids the spec needs.
 */
export async function seedMembersScenario(ownerId: string): Promise<{
  collectionId: string;
  slug: string;
  curatorUserId: string;
  ownerMembershipId: string;
  curatorMembershipId: string;
}> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  const slug = `e2e-members-${collectionId}`;
  await db.insert(collectionsTable).values({
    id: collectionId,
    ownerId,
    name: "E2E Members Bags",
    slug,
  });

  const membershipRepo = new MembershipRepository(db);
  const ownerMembership = await membershipRepo.create({
    collectionId,
    userId: ownerId,
    role: "owner",
  });
  const curatorUserId = await seedUserRow("members-curator");
  const curatorMembership = await membershipRepo.create({
    collectionId,
    userId: curatorUserId,
    role: "curator",
  });

  return {
    collectionId,
    slug,
    curatorUserId,
    ownerMembershipId: ownerMembership.id,
    curatorMembershipId: curatorMembership.id,
  };
}

/** Credentials returned for a seeded user, ready to feed `apiContextFor`. */
export interface SeededUser {
  id: string;
  email: string;
  password: string;
}

const REMOVAL_PASSWORD = "removal-password-123"; // ≥ 8 chars (signup rule)

/**
 * Create a fresh user (unique email, known password) through better-auth so it
 * can be signed in via apiContextFor. Mirrors a legacy `user` row with the same
 * id (createBetterAuthUser) so domain FKs resolve.
 */
async function seedUser(label: string): Promise<SeededUser> {
  const email = `${label}-${generateId("user")}@adored.test`;
  const id = await createBetterAuthUser(email, REMOVAL_PASSWORD, label);
  return { id, email, password: REMOVAL_PASSWORD };
}

/**
 * Seed the item-removal workflow scenario (purses-u3p). Net-new fixture: the
 * existing seeds make a single user and only DRAFT results; this one creates:
 *   - TWO users: an `owner` and a `nonOwner` (distinct principals for the authz
 *     case — the non-owner is NOT a member of the collection),
 *   - a collection owned by `owner`,
 *   - one item with a hero photo (real http blobKey so the purge `del` filter
 *     fires; the e2e asserts API outcomes, not the blob store),
 *   - the item placed in BOTH a DRAFT result and a FINALIZED result.
 *
 * The finalized result is built the DB-layer way (`SortResultRepository.create`
 * with `status:"finalized"` + `SortResultItemRepository.create`), the same
 * pattern `sort-results-authz.integration.test.ts` uses — there is no live route
 * that finalizes with a pre-placed item, so this is fixture-only construction.
 *
 * Each call creates uniquely-ided rows, so it is safe to seed per-test without a
 * full `resetDb()` (which would wipe the baseline user other specs depend on).
 */
export async function seedRemovalScenario(): Promise<{
  owner: SeededUser;
  nonOwner: SeededUser;
  collectionId: string;
  itemId: string;
  photoId: string;
  draftResultId: string;
  draftResultItemId: string;
  finalizedResultId: string;
  finalizedResultItemId: string;
}> {
  const { db } = getTestDb();

  const owner = await seedUser("removal-owner");
  const nonOwner = await seedUser("removal-nonowner");

  const collectionId = generateId("col");
  await db.insert(collectionsTable).values({
    id: collectionId,
    ownerId: owner.id,
    name: "E2E Removal Bags",
    slug: `e2e-removal-bags-${collectionId}`,
  });

  const item = await new ItemRepository(db).create({
    collectionId,
    name: "E2E Removal Item",
  });
  const photo = await new PhotoRepository(db).create({
    itemId: item.id,
    collectionId,
    // A real http(s) URL so the purge blob `del` filter (startsWith "http")
    // actually selects it — the workflow exercises the cleanup path end to end.
    blobKey: "https://blob.example/e2e-removal-hero.jpg",
    filename: "e2e-removal-hero.jpg",
    mimeType: "image/jpeg",
    fileSize: 1,
    uploadedBy: owner.id,
    isHero: true,
  });

  const resultRepo = new SortResultRepository(db);
  const resultItemRepo = new SortResultItemRepository(db);

  // DRAFT result holding the item — cleared by remove-from-sorts.
  const draftResult = await resultRepo.create({
    collectionId,
    curatorId: owner.id,
    name: "E2E Removal Draft",
    status: "draft",
  });
  const draftResultItem = await resultItemRepo.create({
    sortResultId: draftResult.id,
    itemId: item.id,
    computedRank: 1,
    computedBucket: "top",
  });

  // FINALIZED result holding the same item — the hard purge block; survives
  // remove-from-sorts (draft-only).
  const finalizedResult = await resultRepo.create({
    collectionId,
    curatorId: owner.id,
    name: "E2E Removal Finalized",
    status: "finalized",
  });
  const finalizedResultItem = await resultItemRepo.create({
    sortResultId: finalizedResult.id,
    itemId: item.id,
    computedRank: 1,
    computedBucket: "top",
  });

  return {
    owner,
    nonOwner,
    collectionId,
    itemId: item.id,
    photoId: photo.id,
    draftResultId: draftResult.id,
    draftResultItemId: draftResultItem.id,
    finalizedResultId: finalizedResult.id,
    finalizedResultItemId: finalizedResultItem.id,
  };
}

// Two distinct real http blob keys used by seedFullCollection — exported so
// tests that assert blob deletions can reference the same constants.
export const FULL_SEED_HTTP_KEY_ACTIVE = "https://blob.example/active.jpg";
export const FULL_SEED_HTTP_KEY_SOFT = "https://blob.example/soft.jpg";

const FULL_SEED_COLLECTION_NAME = "My Beloved Bags";

/** All ids returned by seedFullCollection — used in route integration tests. */
export interface FullSeedIds {
  collectionId: string;
  name: string;
  memberId: string;
  itemAId: string;
  itemBId: string;
  sessionId: string;
}

/**
 * Seed a bare collection owned by `ownerId` (no items, members, or cascade rows).
 * Returns the generated collectionId.
 */
export async function seedBareCollection(ownerId: string): Promise<string> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, slug, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, ${"Test Collection"}, ${`slug-${collectionId}`}, 'active', now(), now())
  `);
  return collectionId;
}

/**
 * Insert a bare user row (auth is mocked in integration tests, so no password
 * needed). Returns the generated user id.
 */
export async function seedUserRow(label: string): Promise<string> {
  const { db } = getTestDb();
  const id = generateId("user");
  await db
    .insert((await import("@/lib/db/schema")).user)
    .values({ id, email: `${label}-${id}@adored.test`, name: label });
  return id;
}

/**
 * Seed a FULL collection owned by `ownerId`, populating EVERY cascade table so
 * every empty-after assertion is non-vacuous:
 *   - a 2nd member (membership row),
 *   - 2 items,
 *   - 2 photos with distinct http blobKeys (one soft-deleted),
 *   - a session (owner) + 1 decision_event,
 *   - the 2nd member's preference (1 row, on item B),
 *   - a DRAFT result + 1 result-item,
 *   - a FINALIZED result + 1 result-item + 1 share,
 *   - 1 invitation.
 *
 * Used by the purge integration test and the route integration test harness.
 */
export async function seedFullCollection(ownerId: string): Promise<FullSeedIds> {
  const { db } = getTestDb();
  const collectionId = generateId("col");
  await db.execute(sql`
    INSERT INTO collections (id, owner_id, name, slug, status, created_at, updated_at)
    VALUES (${collectionId}, ${ownerId}, ${FULL_SEED_COLLECTION_NAME}, ${`slug-${collectionId}`}, 'active', now(), now())
  `);

  // A 2nd member (curator) — not the owner.
  const memberId = await seedUserRow("member");
  await new MembershipRepository(db).create({
    collectionId,
    userId: memberId,
    role: "curator",
  });

  const itemRepo = new ItemRepository(db);
  const itemA = await itemRepo.create({ collectionId });
  const itemB = await itemRepo.create({ collectionId });

  const photoRepo = new PhotoRepository(db);
  await photoRepo.create({
    itemId: itemA.id,
    collectionId,
    blobKey: FULL_SEED_HTTP_KEY_ACTIVE,
    filename: "active.jpg",
    mimeType: "image/jpeg",
    fileSize: 1,
    uploadedBy: ownerId,
    isHero: true,
  });
  const softPhoto = await photoRepo.create({
    itemId: itemB.id,
    collectionId,
    blobKey: FULL_SEED_HTTP_KEY_SOFT,
    filename: "soft.jpg",
    mimeType: "image/jpeg",
    fileSize: 1,
    uploadedBy: ownerId,
    isHero: false,
  });
  await photoRepo.softDelete(softPhoto.id);

  const session = await new SessionRepository(db).create({ collectionId, curatorId: ownerId });
  await new DecisionEventRepository(db).create({
    sessionId: session.id,
    type: "triage",
    decision: { itemId: itemA.id, result: "top" },
  });

  await new CollectionPreferenceItemRepository(db).create({
    collectionId,
    curatorId: memberId,
    itemId: itemB.id,
    score: 0.5,
    confidence: 1,
    rankBucket: "medium",
    comparisonCount: 0,
  });

  const resultRepo = new SortResultRepository(db);
  const resultItemRepo = new SortResultItemRepository(db);

  const draft = await resultRepo.create({
    collectionId,
    curatorId: ownerId,
    name: "Draft ranking",
    status: "draft",
  });
  await resultItemRepo.create({
    sortResultId: draft.id,
    itemId: itemA.id,
    computedRank: 1,
    computedBucket: "top",
  });

  const finalized = await resultRepo.create({
    collectionId,
    curatorId: ownerId,
    name: "Finalized ranking",
    status: "finalized",
  });
  await resultItemRepo.create({
    sortResultId: finalized.id,
    itemId: itemB.id,
    computedRank: 1,
    computedBucket: "high",
  });
  await new SortResultShareRepository(db).create({
    sortResultId: finalized.id,
    shareToken: generateId("tok"),
  });

  await new InvitationRepository(db).create({
    collectionId,
    email: "invitee@adored.test",
    token: generateId("invtok"),
  });

  return {
    collectionId,
    name: FULL_SEED_COLLECTION_NAME,
    memberId,
    itemAId: itemA.id,
    itemBId: itemB.id,
    sessionId: session.id,
  };
}

// Allow running directly (tsx e2e/fixtures/seed.ts) for manual verification.
if (require.main === module) {
  (async () => {
    await resetDb();
    const id = await seedBaseline();
    const idAgain = await seedBaseline(); // idempotency check
    // eslint-disable-next-line no-console
    console.log(
      `seeded baseline user ${id}; second call returned ${idAgain} (idempotent: ${id === idAgain})`,
    );

    const triage = await seedTriageScenario(id);
    // eslint-disable-next-line no-console
    console.log(
      `seeded triage scenario: collection ${triage.collectionId} (slug ${triage.slug}), session #${triage.sessionNumber}`,
    );

    const sort = await seedSortScenario(id);
    // eslint-disable-next-line no-console
    console.log(
      `seeded sort scenario: collection ${sort.collectionId} (slug ${sort.slug}), session #${sort.sessionNumber}, ` +
        `${sort.itemIds.length} items, result #${sort.resultNumber}`,
    );

    await closeDb();
  })();
}
