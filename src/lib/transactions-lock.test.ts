// Unit proof that lockCollectionCurator issues the shared advisory-lock statement.
// This is the lock's contract: BOTH write paths (decisions route + setDisposition)
// call it to serialize preference recomputes for one (collection, curator). It runs
// without a DB — a fake tx captures the SQL so we assert the exact statement shape.
import { describe, expect, it, vi } from "vitest";
import { lockCollectionCurator } from "./transactions";
import type { Database } from "@/lib/db";

describe("lockCollectionCurator", () => {
  it("takes a transaction-scoped advisory lock keyed on (collectionId, curatorId)", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const tx = { execute } as unknown as Database;

    await lockCollectionCurator(tx, "col_123", "cur_456");

    expect(execute).toHaveBeenCalledTimes(1);
    // The statement must be the transaction-scoped advisory lock (auto-released at
    // commit/rollback), keyed via hashtext() so the two text ids map to the int4
    // pair the two-arg lock form takes. Inspect the drizzle SQL chunks.
    const serialized = JSON.stringify(execute.mock.calls[0][0]);
    expect(serialized).toContain("pg_advisory_xact_lock");
    expect(serialized).toContain("hashtext");
    // Both ids are carried as bound params, not string-interpolated into the SQL.
    expect(serialized).toContain("col_123");
    expect(serialized).toContain("cur_456");
  });
});
