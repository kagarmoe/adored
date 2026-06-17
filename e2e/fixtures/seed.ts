import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { user, collectionsTable } from "@/lib/db/schema";
import { generateId } from "@/lib/id";
import { getTestDb, resetDb, closeDb } from "./db";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";
import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";

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
  sessionId: string;
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
  return { collectionId, slug, sessionId: session.id };
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
    await closeDb();
  })();
}
