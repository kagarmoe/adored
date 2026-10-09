import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { matchesGlob } from "node:path";

// Shared with CI's `dbfilter` step so local and CI agree on what can move a DB test.
export const DB_PATTERNS: string[] = JSON.parse(
  readFileSync(new URL("../.github/db-test-paths.json", import.meta.url), "utf8"),
).db;

export const dbRelevant = (files: string[]) =>
  files.filter((f) => DB_PATTERNS.some((p) => matchesGlob(f, p)));

const git = (...args: string[]) =>
  execFileSync("git", args, { encoding: "utf8" }).split("\n").filter(Boolean);

// Branch diff vs main + uncommitted + untracked. null = can't tell, so run.
function changedFiles(): string[] | null {
  try {
    return [
      ...git("diff", "--name-only", "origin/main...HEAD"),
      ...git("diff", "--name-only", "HEAD"),
      ...git("ls-files", "--others", "--exclude-standard"),
    ];
  } catch {
    return null;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const files = changedFiles();
  const hits = files && dbRelevant(files);
  if (hits && hits.length === 0) {
    console.log("test:db skipped: no DB-relevant changes vs origin/main (.github/db-test-paths.json).");
    process.exit(0);
  }
  console.log(hits ? `DB-relevant changes: ${hits.slice(0, 5).join(", ")}${hits.length > 5 ? ", …" : ""}` : "Could not diff vs origin/main; running test:db.");
  process.exit(spawnSync("npm", ["run", "test:db"], { stdio: "inherit" }).status ?? 1);
}
