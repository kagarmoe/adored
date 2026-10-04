import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { acquireDbLock } from "../scripts/db-lock";

const execFileAsync = promisify(execFile);

export default async function globalSetup() {
  await acquireDbLock(); // one run at a time on the shared test DB (purses-w7ss.24)
  const script = path.resolve(process.cwd(), "e2e/fixtures/test-db.sh");
  // recycle: e2e always starts on a fresh DB, never test:db's leftovers (memory e2e-needs-fresh-container-after-test-db)
  await execFileAsync("bash", [script, "reset"], {
    cwd: process.cwd(),
    env: process.env,
  });
  // Regenerate per-spec labeled test images; a non-zero exit (missing/undersized
  // output) fails the whole run loudly — specs never assert on pixels themselves.
  await execFileAsync("node", ["scripts/label-test-images.mjs"], {
    cwd: process.cwd(),
    env: process.env,
  });
}
