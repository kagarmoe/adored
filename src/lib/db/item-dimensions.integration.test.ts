// Un-mocked DB-integration proof that item dimensions survive the round trip
// through the REAL ItemRepository → ephemeral Postgres → read-back, including a
// decimal ("11.5") and the `unit` default. The columns are `numeric`/`text` and
// Drizzle returns strings, so this pins the string-in / string-out contract the
// dimension schema (src/server/api/items.ts) and the display chip rely on.
//
// Gated by RUN_DB_TESTS (the CI `db-tests` job globs only src/lib/db); skipped
// locally without Docker — expected.
// @vitest-environment node
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closeDb, getTestDb, resetDb } from "../../../e2e/fixtures/db";
import { seedBaseline, seedBareCollection } from "../../../e2e/fixtures/seed";
import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

describeDb("item dimensions round-trip through ItemRepository", () => {
  let curatorId: string;

  beforeEach(async () => {
    await resetDb();
    curatorId = await seedBaseline();
  });

  afterAll(async () => {
    await closeDb();
  });

  it("persists decimal dimensions + unit and reads them back unchanged", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(curatorId);
    const repo = new ItemRepository(db);

    const created = await repo.create({
      collectionId,
      name: "Measured Bag",
      height: "9",
      width: "11.5",
      depth: "4",
      weight: "1.2",
      unit: "metric",
    });

    const readBack = await repo.findById(created.id);
    expect(readBack).not.toBeNull();
    expect(readBack!.height).toBe("9");
    expect(readBack!.width).toBe("11.5");
    expect(readBack!.depth).toBe("4");
    expect(readBack!.weight).toBe("1.2");
    expect(readBack!.unit).toBe("metric");
  });

  it("defaults unit to imperial and leaves dimensions null when omitted", async () => {
    const { db } = getTestDb();
    const collectionId = await seedBareCollection(curatorId);
    const repo = new ItemRepository(db);

    const created = await repo.create({ collectionId, name: "Plain Bag" });

    const readBack = await repo.findById(created.id);
    expect(readBack!.unit).toBe("imperial");
    expect(readBack!.height).toBeNull();
    expect(readBack!.width).toBeNull();
    expect(readBack!.depth).toBeNull();
    expect(readBack!.weight).toBeNull();
  });
});
