import { spawn } from "node:child_process";
import { constants } from "node:os";
import { acquireDbLock, HELD_ENV } from "./db-lock";

// tsx scripts/with-db-lock.ts <cmd> [args…]: run one command holding the test-DB lock.
// The lock is released by acquireDbLock's exit hook once the child has finished.
async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  await acquireDbLock();
  // HELD_ENV tells a nested acquireDbLock (Playwright's globalSetup) that we hold it already.
  const child = spawn(cmd, args, { stdio: "inherit", env: { ...process.env, [HELD_ENV]: String(process.pid) } });
  // ^C reaches the child through the terminal's process group; stay alive until it exits so the
  // lock is released after it, not under it. A SIGTERM aimed at us alone is passed on.
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  // A child killed by a signal exits the shell way, 128 + the signal number (SIGTERM → 143).
  child.on("close", (code, signal) => process.exit(code ?? (signal ? 128 + constants.signals[signal] : 0)));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
