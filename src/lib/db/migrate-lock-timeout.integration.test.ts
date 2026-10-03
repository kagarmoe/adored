// @vitest-environment node
// scripts/migrate.ts against the real test DB: while another transaction holds
// ACCESS EXCLUSIVE on the migrator's ledger, the migrator must give up after its
// lock_timeout (exit 1, "lock timeout") instead of waiting forever and queueing
// every read behind it (purses-w7ss.8).
import { spawn } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { closeDb, getTestDb, TEST_DATABASE_URL } from "../../../e2e/fixtures/db";

const describeDb = process.env.RUN_DB_TESTS === "1" ? describe : describe.skip;

function runMigrate(deadlineMs: number): Promise<{ code: number | null; output: string }> {
  return new Promise((resolve) => {
    // One process (node + the tsx loader), so SIGKILL reaches the migrator itself.
    const child = spawn(process.execPath, ["--import", "tsx", "scripts/migrate.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, DATABASE_URL: TEST_DATABASE_URL },
    });
    let output = "";
    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));
    // Without lock_timeout the child waits forever; kill it before the holder
    // releases the lock. (Best-effort: if the kill lands late, an up-to-date test
    // DB has nothing pending, so the migrator would run nothing.)
    const timer = setTimeout(() => child.kill("SIGKILL"), deadlineMs);
    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({ code: null, output: `${output}\nspawn error: ${err.message}` });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

describeDb("db:migrate lock_timeout (script -> Postgres)", () => {
  afterAll(async () => {
    await closeDb();
  });

  it("fails fast with a lock timeout when the ledger is locked, and never waits indefinitely", async () => {
    const { client } = getTestDb();
    const started = Date.now();
    const result = await client.begin(async (tx) => {
      await tx`lock table drizzle.__drizzle_migrations in access exclusive mode`;
      return runMigrate(20_000);
    });
    expect(result.code).toBe(1);
    expect(result.output).toMatch(/lock timeout/i);
    expect(Date.now() - started).toBeLessThan(12_000);
  }, 30_000);
});
