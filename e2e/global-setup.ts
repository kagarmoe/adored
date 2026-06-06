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
}
