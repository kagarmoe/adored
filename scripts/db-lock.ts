import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// One lock for every run on the shared local test Postgres (pi-e2e-db, :5433): test:db, Playwright
// e2e and the screenshot capture. Concurrent runs TRUNCATE each other or deadlock (memories
// db-test-parallel-deadlock, orchestration-log-marker-races). macOS has no flock(1), so the lock
// is a directory that appears atomically with its holder's pid inside; a dead holder's lock is
// taken over. (Two runs taking over the same stale lock in the same instant is a two-syscall
// window; accepted for a dev-machine lock.)
export const DB_LOCK = "/tmp/adored-db.lock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // exists, owned by someone else
  }
}
function holder(path: string): number | null {
  try {
    return Number(readFileSync(join(path, "pid"), "utf8"));
  } catch {
    return null; // released between our attempt and this read
  }
}

export async function acquireDbLock({ path = DB_LOCK, timeoutMs = 30 * 60_000, pollMs = 2_000 } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  const tmp = `${path}.${process.pid}`;
  let said = false;
  for (;;) {
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, "pid"), String(process.pid));
    try {
      renameSync(tmp, path); // fails while the lock dir exists (it is never empty)
      // Normal exit, process.exit and a handled ^C all end in "exit"; a hard kill leaves a dead
      // pid that the next run takes over.
      process.once("exit", () => releaseDbLock(path));
      return;
    } catch {
      rmSync(tmp, { recursive: true, force: true });
    }
    const pid = holder(path);
    if (pid !== null && !alive(pid)) {
      const stale = `${path}.stale.${process.pid}`;
      try {
        renameSync(path, stale); // move aside atomically: only one taker gets the stale dir
        rmSync(stale, { recursive: true, force: true });
      } catch {
        // someone else took it over first; go round again
      }
      continue;
    }
    if (Date.now() >= deadline) throw new Error(`test DB is busy: ${path} is held by pid ${pid}`);
    if (!said) console.error(`test DB is busy (pid ${pid}); waiting for ${path}…`);
    said = true;
    await sleep(pollMs);
  }
}

export function releaseDbLock(path = DB_LOCK): void {
  if (holder(path) === process.pid) rmSync(path, { recursive: true, force: true });
}
