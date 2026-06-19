import { readFileSync, realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

export function parseOwnership(md) {
  const m = md.match(/<!-- ownership:start -->([\s\S]*?)<!-- ownership:end -->/);
  if (!m) return [];
  return m[1].split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [entry, docs] = line.split("::").map((s) => s.trim());
    return { entry, docs: docs.split(",").map((d) => d.trim()).filter(Boolean) };
  });
}

const matches = (file, entry) => file === entry || (entry.endsWith("/") && file.startsWith(entry));

export function checkDocSync(changedFiles, entries) {
  const changed = new Set(changedFiles);
  const out = [];
  for (const f of changedFiles) {
    const docs = new Set();
    for (const e of entries) if (matches(f, e.entry)) e.docs.forEach((d) => docs.add(d));
    if (docs.size === 0) continue;                       // unmapped source
    if (![...docs].some((d) => changed.has(d))) out.push({ file: f, missingDocs: [...docs] });
  }
  return out;
}

// CLI: filenames from argv, else newline-separated on stdin. Exit 1 if any missing.
const isMain = (() => {
  try { return process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); }
  catch { return false; }
})();
if (isMain) {
  const argv = process.argv.slice(2);
  const files = (argv.length ? argv : readFileSync(0, "utf8").split("\n"))
    .map((s) => s.trim()).filter(Boolean);
  const mapUrl = new URL("../../docs/doc-ownership.md", import.meta.url);
  const findings = checkDocSync(files, parseOwnership(readFileSync(mapUrl, "utf8")));
  for (const f of findings) console.error(`  ${f.file} changed but its docs weren't: ${f.missingDocs.join(", ")}`);
  process.exit(findings.length ? 1 : 0);
}
