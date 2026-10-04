import { spawn } from "node:child_process";
import { acquireDbLock } from "./db-lock";

// tsx scripts/with-db-lock.ts <cmd> [args…]: run one command holding the test-DB lock.
// The lock is released by acquireDbLock's exit hook once the child has finished.
async function main(): Promise<void> {
  const [cmd, ...args] = process.argv.slice(2);
  await acquireDbLock();
  const child = spawn(cmd, args, { stdio: "inherit" });
  // ^C reaches the child through the terminal's process group; stay alive until it exits so the
  // lock is released after it, not under it. A SIGTERM aimed at us alone is passed on.
  process.on("SIGINT", () => {});
  process.on("SIGTERM", () => child.kill("SIGTERM"));
  child.on("close", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}
main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
