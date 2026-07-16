import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";

const execFileAsync = promisify(execFile);

export default async function globalSetup() {
  const script = path.resolve(process.cwd(), "e2e/fixtures/test-db.sh");
  await execFileAsync("bash", [script, "up"], {
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
