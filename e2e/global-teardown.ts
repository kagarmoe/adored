import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { releaseDbLock } from "../scripts/db-lock";

const execFileAsync = promisify(execFile);

export default async function globalTeardown() {
  const script = path.resolve(process.cwd(), "e2e/fixtures/test-db.sh");
  await execFileAsync("bash", [script, "down"], {
    cwd: process.cwd(),
    env: process.env,
  });
  releaseDbLock();
}
