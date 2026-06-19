# PR-lifecycle automation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Codify the per-PR keep-current rhythm — sync docs + refresh graph before push, close-out (bead/lessons/sdd) after merge — as two agent skills, a deterministic pre-push backstop, a doc-ownership map, and a CLAUDE.md protocol.

**Architecture:** Session-aware steps are agent-run skills the CLAUDE.md protocol fires at push/merge. A `pre-push` git hook (pure Node logic, vitest-tested) is the deterministic backstop that soft-blocks a code push whose mapped docs weren't touched. A committed `docs/doc-ownership.md` map drives both the skill and the hook.

**Tech Stack:** Node (ESM `.mjs`) for the hook logic, Vitest for its test (runs in `test:ci`), Bash for the hook + installer, Markdown for skills/map/CLAUDE.md.

## Global Constraints

- **Branch:** `chore/pr-lifecycle-automation` (spec committed). Never commit to `main`.
- **No product-code changes** — only `scripts/**`, `.claude/skills/**`, `docs/**`, `package.json` (one `prepare` line), `CLAUDE.md`.
- **Resolved decisions (spec):** hook install via committed `scripts/install-hooks.sh` + `package.json` `"prepare"`; pre-push **soft-blocks** with `--no-verify` override; `.git/sdd` scratch **namespaced per branch**.
- **Hard rule (must appear in CLAUDE.md + close-out):** nothing destructive (bead close, sdd delete) happens **before** merge is confirmed.
- **Doc map is the source of truth** — skills + hook are thin over `docs/doc-ownership.md`. PRODUCT.md / TONE.md are **never** auto-synced (deliberate edits only); they appear as no source glob's required target.
- **Testing:** the hook's decision logic is non-trivial (glob match + map parse) → vitest test in `test:ci`. Installer + skills get a smoke/verification step, not a unit test. The hook test MUST run in CI (it's a `src`-adjacent `*.test.ts` picked up by vitest; confirm in Task 1).
- **Idempotent installer:** `prepare` runs on every `npm install`/`npm ci` incl. CI — the installer must no-op safely when there's no `.git` work tree.

---

### Task 1: doc-ownership map + `doc-check` logic (TDD core)

**Files:**
- Create: `docs/doc-ownership.md` (the map, with a machine-readable block)
- Create: `scripts/hooks/doc-check.mjs` (pure function + CLI — `.mjs` so the shell hook can `node` it directly)
- Create: `scripts/hooks/doc-check.test.ts` (vitest)
- Modify: `vitest.config.mts` (widen `include` to cover `scripts/`)

**Pre-req (vitest include):** the current include is `["src/**/*.{test,spec}.{ts,tsx}"]` — it would NOT run a test under `scripts/`. Widen it FIRST (Step 0) so the hook test runs in `test:ci`; coverage `include: ["src/**"]` is separate and stays unchanged.

**Interfaces:**
- Produces: `parseOwnership(markdown: string): {glob:string, docs:string[]}[]` and `checkDocSync(changedFiles: string[], entries): {file:string, missingDocs:string[]}[]` (empty array = clean). CLI: `node scripts/hooks/doc-check.mjs <file...>` exits 1 + prints if any missing, 0 if clean.

- [ ] **Step 0: Widen the vitest include** in `vitest.config.mts` so `scripts/` tests run in `test:ci`:

```
include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.{ts,tsx}"],
```
(Leave `exclude` and the coverage `include: ["src/**"]` unchanged.)

- [ ] **Step 1: Write `docs/doc-ownership.md`** with an HTML-comment-delimited block (humans read the table; the parser reads between the markers; `::` separates glob from comma-list of docs):

```markdown
# Doc ownership map

Which source areas assert facts in which governance docs. `/sync-docs` and the
pre-push backstop read the block below. PRODUCT.md and TONE.md are intentionally
absent — they are first-order contracts, edited deliberately, never auto-synced.

<!-- ownership:start -->
src/lib/env.ts :: README.md, docs/ARCHITECTURE.md
src/lib/auth.ts :: README.md, docs/ARCHITECTURE.md
src/middleware.ts :: docs/ARCHITECTURE.md
src/lib/db/schema.ts :: README.md, docs/ARCHITECTURE.md, docs/purseinator_app_infra_spec.md
drizzle/** :: docs/ARCHITECTURE.md
src/server/dal/** :: docs/ARCHITECTURE.md
src/server/repositories/** :: docs/ARCHITECTURE.md
src/lib/design/** :: DESIGN.md
**/*.css :: DESIGN.md
vercel.json :: docs/DEPLOYMENT.md
.github/workflows/** :: docs/ARCHITECTURE.md, docs/DEPLOYMENT.md
<!-- ownership:end -->
```

- [ ] **Step 2: Write the failing test** `scripts/hooks/doc-check.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOwnership, checkDocSync } from "./doc-check.mjs";

const MAP = readFileSync(new URL("../../docs/doc-ownership.md", import.meta.url), "utf8");
const entries = parseOwnership(MAP);

describe("doc-ownership map", () => {
  it("parses the delimited block into glob→docs entries", () => {
    expect(entries.length).toBeGreaterThan(5);
    const env = entries.find((e) => e.glob === "src/lib/env.ts");
    expect(env?.docs).toContain("README.md");
    expect(env?.docs).toContain("docs/ARCHITECTURE.md");
  });
  it("every mapped doc path exists on disk", () => {
    for (const e of entries) for (const d of e.docs) {
      expect(() => readFileSync(new URL("../../" + d, import.meta.url))).not.toThrow();
    }
  });
});

describe("checkDocSync", () => {
  it("flags a mapped source change whose docs weren't touched", () => {
    const out = checkDocSync(["src/lib/env.ts"], entries);
    expect(out).toHaveLength(1);
    expect(out[0].missingDocs).toEqual(expect.arrayContaining(["README.md", "docs/ARCHITECTURE.md"]));
  });
  it("passes when at least... the source change is accompanied by a mapped doc", () => {
    expect(checkDocSync(["src/lib/env.ts", "README.md", "docs/ARCHITECTURE.md"], entries)).toHaveLength(0);
  });
  it("ignores an unmapped source file", () => {
    expect(checkDocSync(["src/features/foo/Bar.tsx"], entries)).toHaveLength(0);
  });
  it("matches ** globs (dal change requires ARCHITECTURE)", () => {
    expect(checkDocSync(["src/server/dal/collection-access.ts"], entries)).toHaveLength(1);
  });
  it("never requires PRODUCT.md or TONE.md (they are no glob's target)", () => {
    const allDocs = entries.flatMap((e) => e.docs);
    expect(allDocs).not.toContain("PRODUCT.md");
    expect(allDocs).not.toContain("TONE.md");
  });
});
```

- [ ] **Step 3: Run it, expect failure** — `npx vitest run scripts/hooks/doc-check.test.ts` → FAIL (module not found).

- [ ] **Step 4: Implement `scripts/hooks/doc-check.mjs`:**

```js
import { readFileSync } from "node:fs";

export function parseOwnership(md) {
  const m = md.match(/<!-- ownership:start -->([\s\S]*?)<!-- ownership:end -->/);
  if (!m) return [];
  return m[1].split("\n").map((l) => l.trim()).filter(Boolean).map((line) => {
    const [glob, docs] = line.split("::").map((s) => s.trim());
    return { glob, docs: docs.split(",").map((d) => d.trim()).filter(Boolean) };
  });
}

// glob → RegExp: ** => any depth, * => within a path segment.
function globToRe(glob) {
  let re = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*" && glob[i + 1] === "*") { re += ".*"; i++; }
    else if (c === "*") re += "[^/]*";
    else if (".+?^${}()|[]\\".includes(c)) re += "\\" + c;
    else re += c;
  }
  return new RegExp("^" + re + "$");
}

export function checkDocSync(changedFiles, entries) {
  const changed = new Set(changedFiles);
  const out = [];
  for (const f of changedFiles) {
    const docsForF = new Set();
    for (const e of entries) if (globToRe(e.glob).test(f)) e.docs.forEach((d) => docsForF.add(d));
    if (docsForF.size === 0) continue; // unmapped source
    const touched = [...docsForF].some((d) => changed.has(d));
    if (!touched) out.push({ file: f, missingDocs: [...docsForF] });
  }
  return out;
}

// CLI: node doc-check.mjs <changed-file...>
if (import.meta.url === `file://${process.argv[1]}`) {
  const mapUrl = new URL("../../docs/doc-ownership.md", import.meta.url);
  const entries = parseOwnership(readFileSync(mapUrl, "utf8"));
  const findings = checkDocSync(process.argv.slice(2), entries);
  if (findings.length) {
    for (const f of findings) console.error(`  ${f.file} changed but its docs weren't: ${f.missingDocs.join(", ")}`);
    process.exit(1);
  }
  process.exit(0);
}
```

- [ ] **Step 5: Run tests, expect pass; commit**

`npx vitest run scripts/hooks/doc-check.test.ts` → PASS.
```bash
git add vitest.config.mts docs/doc-ownership.md scripts/hooks/doc-check.mjs scripts/hooks/doc-check.test.ts
git commit -m "feat(automation): doc-ownership map + doc-check logic (tested, vitest include widened)"
```

---

### Task 2: pre-push hook + installer + prepare wiring

**Files:**
- Create: `scripts/hooks/pre-push` (bash)
- Create: `scripts/install-hooks.sh` (bash, idempotent)
- Modify: `package.json` (add `"prepare"`)

**Interfaces:**
- Consumes: `scripts/hooks/doc-check.mjs` (CLI).
- Produces: `.git/hooks/pre-push` (installed) that soft-blocks on missing doc-sync.

- [ ] **Step 1: Write `scripts/hooks/pre-push`:**

```bash
#!/usr/bin/env bash
# Doc-sync backstop: soft-block a push whose changed source files have un-synced
# docs (per docs/doc-ownership.md). Override with `git push --no-verify`.
set -euo pipefail
REMOTE_MAIN="origin/main"
# changed files on this branch vs main (merge-base); fall back to last commit.
base=$(git merge-base "$REMOTE_MAIN" HEAD 2>/dev/null || echo "")
range=${base:+"$base"..HEAD}
files=$(git diff --name-only ${range:-HEAD~1..HEAD} 2>/dev/null || true)
[ -z "$files" ] && exit 0
if ! node scripts/hooks/doc-check.mjs $files; then
  echo ""
  echo "↑ docs may be stale for this change. Run /sync-docs (update the doc on this branch),"
  echo "  or 'git push --no-verify' to override if no documented fact actually changed."
  exit 1
fi
exit 0
```

- [ ] **Step 2: Write `scripts/install-hooks.sh` (idempotent, no-op without .git):**

```bash
#!/usr/bin/env bash
set -euo pipefail
[ -d .git ] || { echo "install-hooks: no .git work tree, skipping"; exit 0; }
hookdir=$(git rev-parse --git-path hooks)
mkdir -p "$hookdir"
src="scripts/hooks/pre-push"
dest="$hookdir/pre-push"
# Append-safe: if a pre-push already exists and isn't ours, append a call; else install.
marker="# >>> adored doc-sync backstop >>>"
if [ -f "$dest" ] && ! grep -q "$marker" "$dest"; then
  { echo ""; echo "$marker"; echo "bash \"$(pwd)/$src\" \"\$@\" || exit 1"; echo "# <<< adored doc-sync backstop <<<"; } >> "$dest"
else
  printf '#!/usr/bin/env bash\n%s\nbash "%s/%s" "$@"\n' "$marker" "$(pwd)" "$src" > "$dest"
fi
chmod +x "$dest" "$src"
echo "install-hooks: pre-push installed at $dest"
```

- [ ] **Step 3: Wire `package.json` `"prepare"`** — add to scripts: `"prepare": "bash scripts/install-hooks.sh"`. (If a `prepare` already exists, chain with `&&`.)

- [ ] **Step 4: Smoke-test the installer + hook**

```bash
chmod +x scripts/hooks/pre-push scripts/install-hooks.sh
bash scripts/install-hooks.sh   # expect: pre-push installed
test -x "$(git rev-parse --git-path hooks)/pre-push" && echo "hook executable OK"
# logic smoke: a mapped change with no doc → exit 1; with doc → exit 0
node scripts/hooks/doc-check.mjs src/lib/env.ts; echo "exit=$? (expect 1)"
node scripts/hooks/doc-check.mjs src/lib/env.ts README.md docs/ARCHITECTURE.md; echo "exit=$? (expect 0)"
```

- [ ] **Step 5: Commit**

```bash
git add scripts/hooks/pre-push scripts/install-hooks.sh package.json
git commit -m "feat(automation): pre-push doc-sync backstop + idempotent installer + prepare"
```

---

### Task 3: `/sync-docs` skill

**Files:** Create `.claude/skills/sync-docs/SKILL.md`.

- [ ] **Step 1: Write the skill** (full content):

```markdown
---
name: sync-docs
description: Use before opening or updating a PR — update the governance docs (ARCHITECTURE/DEPLOYMENT/DESIGN/README, never PRODUCT/TONE) that this branch's changes affect, from the session + diff. Surgical, driven by docs/doc-ownership.md.
---

# /sync-docs

Run **before pushing a feature branch**, so doc updates land in the PR diff and are co-reviewed.

## Steps
1. `git diff --name-only $(git merge-base origin/main HEAD)..HEAD` — the branch's changed files.
2. Read `docs/doc-ownership.md`. For each changed source file, collect its mapped docs.
3. For each mapped doc whose asserted fact actually moved: make a **targeted** edit. Do NOT rewrite the doc. Do NOT touch PRODUCT.md or TONE.md (deliberate edits only).
4. **Verify every claim against live code before writing it** (the deleted plans were often stale — never copy a claim you haven't confirmed).
5. For a decision (architecture/auth/data/etc.), add or update the matching entry in `docs/ARCHITECTURE.md`'s decisions log.
6. Commit on the feature branch. The pre-push hook backstops you — if it soft-blocks, you missed a mapped doc.

## Scope
- **Incremental** (default): only the docs whose facts this PR moved.
- **Full resync** (rare, its own PR): sweep the whole session against all docs — only when drift has accumulated (the 2026-06-18 cleanup was one). Not a per-PR action.

## Never
- Rewrite a doc wholesale on a normal PR. Touch PRODUCT/TONE. Assert a fact you didn't verify in code.
```

- [ ] **Step 2: Verify** — skill is valid frontmatter + references `docs/doc-ownership.md`:
```bash
head -4 .claude/skills/sync-docs/SKILL.md | grep -q "name: sync-docs" && echo "frontmatter OK"
grep -q "doc-ownership.md" .claude/skills/sync-docs/SKILL.md && echo "references map OK"
```

- [ ] **Step 3: Commit** — `git add .claude/skills/sync-docs/SKILL.md && git commit -m "feat(automation): /sync-docs skill"`

---

### Task 4: `/close-out` skill (post-merge) + sdd namespacing convention

**Files:** Create `.claude/skills/close-out/SKILL.md`.

- [ ] **Step 1: Write the skill** (full content):

```markdown
---
name: close-out
description: Use IMMEDIATELY AFTER merging a PR — close the bead, harvest durable lessons to bd memory (chat-first), and delete this branch's .git/sdd scratch. Never run before a merge is confirmed.
---

# /close-out

Run **right after `gh pr merge` succeeds.** Nothing here is destructive-before-merge: the bead and the sdd scratch must survive the whole review→fix→merge loop.

## Steps (any order)
1. **Close the bead(s):** `bd close <id> --reason "merged in #<PR>"` for the problem this PR resolved. (Skip if the work had no bead.)
2. **Harvest lessons → memory:** scan the **conversation first**, then the ledger (`$(git rev-parse --git-path sdd)/<branch>/progress.md`), for durable lessons and recurring problems (gotchas, non-obvious decisions, things that bit us). For each: `bd remember --key <slug> "<lesson>"`. Dedupe against `bd memories`; update in place if it already exists. Do NOT record session-only trivia or anything the code/CLAUDE.md already states.
3. **Delete this branch's scratch:** `rm -rf "$(git rev-parse --git-path sdd)/<sanitized-branch>"` and any flat transient task files this problem created. Leave other branches' scratch untouched.

## Rules
- Chat is the primary lesson source — it is never clobbered. The ledger is supplementary.
- Never close a bead or delete scratch for work that has NOT merged.
- One `/close-out` per merged PR (idempotent — re-running after everything's closed is a no-op).
```

- [ ] **Step 2: Verify** — `head -4 .claude/skills/close-out/SKILL.md | grep -q "name: close-out" && echo OK`; confirm it contains "Never run before a merge".

- [ ] **Step 3: Commit** — `git add .claude/skills/close-out/SKILL.md && git commit -m "feat(automation): /close-out skill (post-merge bead/lessons/sdd)"`

---

### Task 5: CLAUDE.md "PR lifecycle" protocol

**Files:** Modify `CLAUDE.md` (append a new section; do not disturb the managed Beads block or existing sections).

- [ ] **Step 1: Add the section** after the Workflow section:

```markdown
## PR lifecycle automation

Codified per-PR rhythm (skills are global-or-project `/sync-docs` and `/close-out`):

- **Before pushing / opening a PR:** run `/sync-docs` (update the governance docs this branch's
  changes affect, per `docs/doc-ownership.md`; never PRODUCT/TONE) and `/graphify --update`
  (refresh the committed graph). The `pre-push` hook soft-blocks a code push whose mapped docs
  weren't touched — run `/sync-docs` or `git push --no-verify` if no documented fact moved.
- **Immediately after `gh pr merge` succeeds:** run `/close-out` — close the bead(s), harvest
  lessons → `bd remember` (chat-first), delete this branch's `.git/sdd` scratch.
- **Hard rule:** never close a bead or delete `.git/sdd` scratch before the merge is confirmed.
  The bead is the "is it done?" truth; the scratch is the review loop's working context.
- **Multiple problems per session:** keep each problem's ledger under
  `.git/sdd/<branch>/progress.md` so a second problem never clobbers an in-flight one's scratch.
- Git hooks install on `npm install` via `scripts/install-hooks.sh` (the `prepare` script).
```

- [ ] **Step 2: Verify** — `grep -q "PR lifecycle automation" CLAUDE.md && grep -q "never close a bead" CLAUDE.md && echo OK`. Confirm the managed `<!-- BEGIN BEADS INTEGRATION -->` block is untouched (`git diff CLAUDE.md` shows only the added section).

- [ ] **Step 3: Commit** — `git add CLAUDE.md && git commit -m "docs(automation): CLAUDE.md PR-lifecycle protocol"`

---

### Task 6: Gates + PR

- [ ] **Step 1: Full gates** — `npm run build`, `npm run test:ci` (confirms `doc-check.test.ts` ran — grep the output for `doc-check`), `npm run lint`. Expect green; the doc-check test in the run.
- [ ] **Step 2: Confirm the hook test ran in CI** — the `test:ci` output from Step 1 must list `scripts/hooks/doc-check.test.ts` (Task 1 Step 0 widened the include to make this so). If it's absent, the gate isn't covering it — stop and fix before proceeding. (Non-negotiable: the test runs in the gate.)
- [ ] **Step 3: Self-dogfood** — run `/sync-docs` on this very branch: it changed `scripts/**` and `package.json` and `CLAUDE.md`; doc-ownership maps none of those to a doc, so `/sync-docs` and the hook should both pass clean (this feature doesn't change a documented product fact). Note that as the expected first real exercise.
- [ ] **Step 4: Push + PR** — `git push -u origin chore/pr-lifecycle-automation` (the newly-installed hook runs on this push — expect it to pass, since no mapped source changed); `gh pr create --base main --title "feat: PR-lifecycle automation (sync-docs + close-out skills, pre-push backstop)" --body "<summary>"`.
- [ ] **Step 5: Merge when green; then dogfood `/close-out`** — after merge, run `/close-out` for this work (no bead unless one was filed; harvest any lessons; clean scratch). This is the first live use of the thing just built.

---

## Self-Review

**Spec coverage:** doc-sync skill → Task 3; graph-update → CLAUDE.md line (Task 5) using existing `/graphify`; close-out (bead+lessons+sdd) → Task 4; pre-push backstop → Tasks 1-2; doc-ownership map → Task 1; CLAUDE.md spine → Task 5; sdd namespacing → Task 4 skill + Task 5 CLAUDE.md; install mechanism → Task 2; soft-block → Task 2 hook. ✅

**Placeholder scan:** skill bodies + hook + map are full content. PR `<summary>` filled at PR time. No TBD/TODO.

**Type/name consistency:** `parseOwnership` / `checkDocSync` signatures identical across doc-check.mjs, its test, and the pre-push hook's CLI call. `docs/doc-ownership.md` path consistent in the map, skill, test, and mjs. Skill names (`sync-docs`, `close-out`) consistent in frontmatter, CLAUDE.md, and the protocol.

**Resolved during planning:** (a) vitest include was `src/**` only — Task 1 Step 0 now widens it to cover `scripts/**` so the hook test runs in `test:ci`. (b) Confirmed `package.json` has no existing `prepare` script — Task 2 Step 3 adds a fresh one (no chaining needed).
