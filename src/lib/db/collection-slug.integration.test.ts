import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { CollectionRepository } from "@/server/repositories/implementations/CollectionRepository";
import { generateId } from "@/lib/id";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("collection slug generation (repo -> DB)", () => {
  const ownerId = "user_slug_test";

  function repo() {
    return new CollectionRepository(getTestDb().db);
  }

  async function seedOwner() {
    const { db } = getTestDb();
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`
      INSERT INTO "user" (id, name, email)
      VALUES (${ownerId}, 'Slug Tester', 'slug@test.dev')
      ON CONFLICT (id) DO NOTHING
    `);
  }

  beforeEach(async () => {
    await resetDb();
    await seedOwner();
  });

  afterAll(async () => {
    await closeDb();
  });

  // The pure name→slug mapping ("Summer Bags" → "summer-bags") is unit-covered by
  // src/lib/collections/slug.test.ts; the dedupe case below proves create() wires
  // slugifyName in (a second "Summer Bags" only becomes "summer-bags-2" if the
  // first resolved to "summer-bags").

  it("dedupes same-named collections globally", async () => {
    await repo().create({ id: generateId("coll"), ownerId, name: "Summer Bags" });
    const second = await repo().create({ id: generateId("coll"), ownerId, name: "Summer Bags" });
    expect(second.slug).toBe("summer-bags-2");
  });

  it("never assigns a reserved slug", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "New" });
    expect(c.slug).toBe("new-2");
  });

  it("falls back to a random slug for emoji-only names", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "👜👜" });
    expect(c.slug).toMatch(/^[a-z0-9]{6}$/);
  });

  it("regenerates the slug on rename and frees the old one", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Old Name" });
    const renamed = await repo().update(c.id, { name: "New Name" });
    expect(renamed.slug).toBe("new-name");
    expect(await repo().findBySlug("new-name")).not.toBeNull();
    expect(await repo().findBySlug("old-name")).toBeNull();
  });

  it("does not bump its own slug on a no-op rename", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Stable" });
    const again = await repo().update(c.id, { name: "Stable" });
    expect(again.slug).toBe("stable");
  });

  it("findBySlug excludes soft-deleted, but the slug stays reserved", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Gone" });
    await repo().softDelete(c.id);
    expect(await repo().findBySlug("gone")).toBeNull();
    const fresh = await repo().create({ id: generateId("coll"), ownerId, name: "Gone" });
    expect(fresh.slug).toBe("gone-2");
  });

  it("resolveCollection finds by slug AND by ULID, and blocks non-members", async () => {
    const { resolveCollection } = await import("@/lib/collection-access");
    const { db } = getTestDb();
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Resolve Me" });

    expect((await resolveCollection(db, c.slug!, ownerId))?.id).toBe(c.id);
    expect((await resolveCollection(db, c.id, ownerId))?.id).toBe(c.id);
    expect(await resolveCollection(db, c.slug!, "user_stranger")).toBeNull();
  });

  it("un-mocked layer crossing: slug resolves, then items fetch by collection.id", async () => {
    const { resolveCollection } = await import("@/lib/collection-access");
    const { ItemRepository } = await import(
      "@/server/repositories/implementations/ItemRepository"
    );
    const { db } = getTestDb();
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "With Items" });
    const itemRepo = new ItemRepository(db);
    await itemRepo.create({ collectionId: c.id, name: "Thing" });

    const resolved = await resolveCollection(db, c.slug!, ownerId);
    const items = await itemRepo.findByCollection(resolved!.id);
    expect(items).toHaveLength(1);
  });
});
