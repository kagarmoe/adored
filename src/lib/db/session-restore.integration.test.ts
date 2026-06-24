// Un-mocked DB-integration proof for Epic C PR3: a set-aside (soft-deleted)
// session is unreachable via findById (it filters isNull(deletedAt)), so undo
// needs an include-deleted lookup + a restore. Real repo -> ephemeral Postgres;
// mocks ONLY the @/lib/db boundary (-> test db).
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
vi.mock("@/lib/db", () => ({ getDb: () => getTestDb().db }));
import { SessionRepository } from "@/server/repositories/implementations/SessionRepository";
const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("SessionRepository restore", () => {
  beforeEach(() => resetDb());
  afterAll(() => closeDb());
  it("findByIdIncludingDeleted sees a soft-deleted session; restore re-activates it", async () => {
    const { db } = getTestDb();
    const curatorId = await seedBaseline();
    const collectionId = await seedBareCollection(curatorId);
    const repo = new SessionRepository(db);
    const s = await repo.create({ collectionId, curatorId });
    await repo.softDelete(s.id);
    expect(await repo.findById(s.id)).toBeNull();
    const deleted = await repo.findByIdIncludingDeleted(s.id);
    expect(deleted?.deletedAt).not.toBeNull();
    const restored = await repo.restore(s.id);
    expect(restored.deletedAt).toBeNull();
    expect(restored.status).toBe("active");
    expect(await repo.findById(s.id)).not.toBeNull();
  });
});
