import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { user, collectionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getTestDb, resetDb, closeDb } from "./db";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
import { CollectionPreferenceItemRepository } from "@/server/repositories/implementations/CollectionPreferenceItemRepository";
import { SortResultRepository } from "@/server/repositories/implementations/SortResultRepository";
import { SortResultItemRepository } from "@/server/repositories/implementations/SortResultItemRepository";
import { SortResultService } from "@/server/services/SortResultService";

// A known user every spec can log in as via the Credentials provider.
export const BASELINE_USER = {
  email: "e2e@adored.test",
  password: "e2e-password-123", // ≥ 8 chars (signup rule)
  name: "E2E Tester",
} as const;

/**
 * Insert the baseline user (idempotent after resetDb). Returns its id.
 * Safe to call repeatedly: if the user exists, returns the existing id.
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
  const hashed = await bcrypt.hash(BASELINE_USER.password, 12);
  await db.insert(user).values({
    id,
    email: BASELINE_USER.email,
    name: BASELINE_USER.name,
    password: hashed,
    emailVerified: new Date(),
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
 *  whether a bucket has items. (The low tier's live label is "Release", not the
 *  not-yet-shipped "Onward".) */
const SORT_SCENARIO_BUCKETS = ["top", "high", "low"] as const;

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

  // The correct path: the service reads the seeded preferences and materializes
  // the ranked result items — same code the real finalize flow uses.
  const service = new SortResultService(
    new SortResultRepository(db),
    new SortResultItemRepository(db),
    prefRepo,
  );
  const result = await service.createDraftResult(collectionId, ownerId, "E2E Sort Result");
  if (result.number == null) throw new Error("seedSortScenario: result.number was not allocated");

  return { collectionId, slug, sessionNumber: session.number, itemIds, resultNumber: result.number };
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
