import { readFileSync, realpathSync } from "node:fs";
import { matchesGlob } from "node:path";
import { fileURLToPath } from "node:url";

// Same list CI's `codefilter` step reads (dorny "every" quantifier: "**" minus the "!" paths).
const { code, docmap } = JSON.parse(readFileSync(new URL("../../.github/code-paths.json", import.meta.url), "utf8"));
const nonCode = code.filter((p) => p.startsWith("!")).map((p) => p.slice(1));

// shortcut: matchesGlob skips dot dirs under "**", so e.g. .github/x.md counts as code (safe direction).
const isCode = (f) => docmap.some((p) => matchesGlob(f, p)) || !nonCode.some((p) => matchesGlob(f, p));

export const codeChanged = (files) => files.length === 0 || files.some(isCode);

// CLI: newline-separated files on stdin. Exit 0 = code changed (run the full gate), 1 = docs/config only.
const isMain = (() => {
  try { return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (isMain) {
  const files = readFileSync(0, "utf8").split("\n").map((s) => s.trim()).filter(Boolean);
  process.exit(codeChanged(files) ? 0 : 1);
}
