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

  it("generates a slug from the name on create", async () => {
    const c = await repo().create({ id: generateId("coll"), ownerId, name: "Summer Bags" });
    expect(c.slug).toBe("summer-bags");
  });

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
});
