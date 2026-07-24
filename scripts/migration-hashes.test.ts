import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
 * Journal integrity guard (purses-mebk.1 / ARCHITECTURE decision 33).
 *
 * drizzle's migrator compares ONLY the journal `when` timestamp against the
 * newest applied row; the SHA-256 it writes to __drizzle_migrations is never
 * read back. So editing an already-applied .sql — or re-baselining drizzle/ —
 * is invisible to every gate: CI builds the schema from empty and goes green,
 * and only the production deploy (which replays against a real DB) goes red.
 *
 * Pinning the content hash moves that failure from deploy time to review time.
 * A migration is append-only: to change the schema, add a new .sql. If a
 * deliberate re-baseline lands, update APPLIED below in the same commit — the
 * point is that it can't happen silently.
 */
const MIGRATIONS_DIR = new URL("../drizzle/", import.meta.url);

const APPLIED: Record<string, string> = {
  "0000_init.sql":
    "3981d91e99ea8e664b851101c6e33975cf958d09d998b16d4ae273944e7f04d3",
  "0001_clumsy_ser_duncan.sql":
    "aceebe52c3e65fe02b7b1a42964544fb221908ddc854e078dd5f230780d9ecf1",
  "0002_illegal_the_watchers.sql":
    "aaf60879b5a57b8698a9c1075a7f98918c8dbe2d26692198806ca436ba734472",
  "0003_jazzy_psynapse.sql":
    "b49fdad679225fd8d3a52e1683b672adedcf10f6a92fd24f251746421760d958",
};

function sha256(file: string): string {
  return createHash("sha256")
    .update(readFileSync(new URL(file, MIGRATIONS_DIR)))
    .digest("hex");
}

describe("drizzle migration content hashes", () => {
  const onDisk = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  it("no migration is added or removed without pinning it", () => {
    expect(onDisk).toEqual(Object.keys(APPLIED).sort());
  });

  it.each(Object.keys(APPLIED))("%s content is unchanged", (file) => {
    expect(sha256(file)).toBe(APPLIED[file]);
  });
});
