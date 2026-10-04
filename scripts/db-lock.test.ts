import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireDbLock, releaseDbLock } from "./db-lock";

const freshPath = () => join(mkdtempSync(join(tmpdir(), "db-lock-")), "lock");
function heldBy(path: string, pid: number) {
  mkdirSync(path);
  writeFileSync(join(path, "pid"), String(pid));
}

describe("the local test-DB lock", () => {
  it("a live holder blocks: a second run waits, then gives up naming the holder", async () => {
    const path = freshPath();
    heldBy(path, process.ppid); // alive, and not us
    await expect(acquireDbLock({ path, timeoutMs: 50, pollMs: 10 })).rejects.toThrow(`pid ${process.ppid}`);
  });

  it("a lock left by a dead run (crash, ^C) is taken over, and release frees it", async () => {
    const path = freshPath();
    heldBy(path, spawnSync("true").pid!); // exited and reaped: dead
    await acquireDbLock({ path, timeoutMs: 1_000, pollMs: 10 });
    expect(readFileSync(join(path, "pid"), "utf8")).toBe(String(process.pid));
    releaseDbLock(path);
    expect(existsSync(path)).toBe(false);
  });

  it("under a live with-db-lock wrapper (ADORED_DB_LOCK_HELD), acquire is a no-op: no wait on itself", async () => {
    const path = freshPath();
    process.env.ADORED_DB_LOCK_HELD = String(process.ppid); // alive
    try {
      await acquireDbLock({ path, timeoutMs: 50, pollMs: 10 });
      expect(existsSync(path)).toBe(false);
    } finally {
      delete process.env.ADORED_DB_LOCK_HELD;
    }
  });
});
