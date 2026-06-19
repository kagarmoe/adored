# PR-lifecycle automation — Implementation Plan (v2, post adversarial-review)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Codify the per-PR keep-current rhythm — sync docs + refresh graph before push, close-out (bead/lessons/sdd) after merge — as two agent skills, a doc-sync step in the existing committed `.githooks/pre-push`, a doc-ownership map, and a CLAUDE.md protocol.

**Architecture:** Session-aware steps are agent-run skills the CLAUDE.md protocol fires at push/merge. The deterministic backstop is a doc-sync check **added to the already-tracked `.githooks/pre-push`** (this repo uses `core.hooksPath=.githooks`; hooks are committed, so there is nothing to install). A committed `docs/doc-ownership.md` map drives both the skill and the check, using **exact-path-or-directory-prefix** matching (no globs).

**Tech Stack:** Node (ESM `.mjs`) for the check logic, Vitest (runs in `test:ci`), POSIX sh for the hook step, Markdown for skills/map/CLAUDE.md.

## v2 changes (folded from the adversarial review — BLOCK verdict)

| Finding | Fix |
|---|---|
| **BLOCK** — repo uses `core.hooksPath=.githooks` with a committed `.githooks/pre-push` gate hook; the planned `install-hooks.sh`+`prepare` would mutate a *tracked* file on every `npm ci` and the smoke test passed for the wrong reason. | **Delete the installer + `prepare`.** Add the doc-check as a step in the committed `.githooks/pre-push`. Nothing to install. |
| **BLOCK** — sdd namespacing inconsistent: `<sanitized-branch>` undefined, writer never changed, `rm -rf` on an unverified path. | Define one sanitization `scope = git branch --show-current \| tr '/' '-'`; use it identically in the CLAUDE.md writer convention, the close-out read, and the delete; **guard against empty `scope`**. |
| **MED** — hand-rolled `globToRe` is gold-plating (10/11 entries are exact/prefix) and `**/*.css` had a real match bug (requires a slash → misses shallow CSS). | Drop globs. Map entries are **exact path** or **`dir/`** (trailing slash = prefix). Match: `f === e || (e.endsWith('/') && f.startsWith(e))`. |
| **MED** — fragile CLI guard `import.meta.url === file://${argv[1]}` false-passes on symlinked/abs paths. | Robust: `realpathSync(argv[1]) === realpathSync(fileURLToPath(import.meta.url))`. |
| **MED** — pre-push range `merge-base \|\| HEAD~1..HEAD` under-checks (misses earlier commits) on fresh branches. | Read the **actual pushed range from the hook's stdin** (`<localref> <localsha> <remoteref> <remotesha>`); new-branch (`remotesha` all-zeros) → merge-base with `origin/main` or root commit. |
| **LOW** — unquoted `$files` breaks on spaces. | Pipe the file list to `doc-check.mjs` via **stdin**, not argv word-splitting. |
| **MED** — "full resync" mode is speculative. | Cut it from `/sync-docs`; incremental only. |
| **QA** — deleted-file behavior undefined; leniency/union untested. | Hook excludes deletions (`--diff-filter=ACMRT`); add tests for any-one leniency, multi-entry union, prefix match. |

## Global Constraints

- **Branch:** `chore/pr-lifecycle-automation` (spec committed). Never commit to `main`.
- **No product-code changes** — only `scripts/hooks/**`, `.githooks/pre-push`, `.claude/skills/**`, `docs/**`, `vitest.config.mts` (one line), `CLAUDE.md`.
- **Hooks are committed via `core.hooksPath=.githooks`** — verified. No installer, no `package.json prepare`.
- **Match semantics:** a changed source file is "synced" iff **at least one** of its mapped docs is also in the diff (lenient by design — it's a nudge with a `--no-verify` escape, not a gate). PRODUCT.md / TONE.md are **never** a mapped target (deliberate edits only).
- **Hard rule (CLAUDE.md + close-out):** nothing destructive (bead close, sdd delete) before merge is confirmed.
- **sdd scope:** `scope=$(git branch --show-current | tr '/' '-')`; per-problem ledger at `.git/sdd/$scope/progress.md`; close-out `rm -rf` that path **only when `$scope` is non-empty**.
- **Testing:** the parse+match logic is non-trivial → vitest test in `test:ci` (Task 1 widens the include to `scripts/**`). The hook step + skills get verification/smoke, not unit tests (their logic lives in the tested `.mjs`); the plan names the untested seams honestly.

---

### Task 1: doc-ownership map + `doc-check` logic (TDD core)

**Files:**
- Create: `docs/doc-ownership.md`
- Create: `scripts/hooks/doc-check.mjs`
- Create: `scripts/hooks/doc-check.test.ts`
- Modify: `vitest.config.mts` (widen `include`)

**Interfaces:**
- Produces: `parseOwnership(md: string): {entry:string, docs:string[]}[]`; `checkDocSync(changedFiles: string[], entries): {file:string, missingDocs:string[]}[]` (empty = clean). CLI: reads filenames from argv or stdin; exits 1 + prints if any missing.

- [ ] **Step 0: Widen vitest include** in `vitest.config.mts`:
```
include: ["src/**/*.{test,spec}.{ts,tsx}", "scripts/**/*.{test,spec}.{ts,tsx}"],
```
(Leave `exclude` and coverage `include: ["src/**"]` unchanged.)

- [ ] **Step 1: Write `docs/doc-ownership.md`** (exact-path or `dir/` prefix; no globs):
```markdown
# Doc ownership map

Which source areas assert facts in which governance docs. `/sync-docs` and the
`.githooks/pre-push` doc-sync step read the block below. Each line is
`path-or-dir/ :: doc, doc` — a trailing `/` means "this directory and below".
PRODUCT.md and TONE.md are intentionally absent: first-order contracts, edited
deliberately, never auto-synced. An over-broad or stale entry is a `--no-verify`
+ a map fix — never a reason to weaken a doc.

<!-- ownership:start -->
src/lib/env.ts :: README.md, docs/ARCHITECTURE.md
src/lib/auth.ts :: README.md, docs/ARCHITECTURE.md
src/middleware.ts :: docs/ARCHITECTURE.md
src/lib/db/schema.ts :: README.md, docs/ARCHITECTURE.md, docs/purseinator_app_infra_spec.md
drizzle/ :: docs/ARCHITECTURE.md
src/server/dal/ :: docs/ARCHITECTURE.md
src/server/repositories/ :: docs/ARCHITECTURE.md
src/lib/design/ :: DESIGN.md
src/app/globals.css :: DESIGN.md
vercel.json :: docs/DEPLOYMENT.md
.github/workflows/ :: docs/ARCHITECTURE.md, docs/DEPLOYMENT.md
<!-- ownership:end -->
```

- [ ] **Step 2: Write the failing test** `scripts/hooks/doc-check.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseOwnership, checkDocSync } from "./doc-check.mjs";

const MAP = readFileSync(new URL("../../docs/doc-ownership.md", import.meta.url), "utf8");
const entries = parseOwnership(MAP);

describe("parseOwnership", () => {
  it("parses exact + prefix entries from the delimited block", () => {
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.find((e) => e.entry === "src/lib/env.ts")?.docs).toEqual(
      expect.arrayContaining(["README.md", "docs/ARCHITECTURE.md"]));
    expect(entries.find((e) => e.entry === "src/server/dal/")).toBeTruthy();
  });
  it("every mapped doc path exists on disk", () => {
    for (const e of entries) for (const d of e.docs)
      expect(() => readFileSync(new URL("../../" + d, import.meta.url))).not.toThrow();
  });
});

describe("checkDocSync", () => {
  it("flags an exact-mapped source whose docs weren't touched", () => {
    const out = checkDocSync(["src/lib/env.ts"], entries);
    expect(out).toHaveLength(1);
    expect(out[0].missingDocs).toEqual(expect.arrayContaining(["README.md", "docs/ARCHITECTURE.md"]));
  });
  it("flags a DIRECTORY-PREFIX-mapped source (dal/**) whose doc is untouched", () => {
    expect(checkDocSync(["src/server/dal/collection-access.ts"], entries)).toHaveLength(1);
  });
  it("is clean when ANY ONE mapped doc is touched (lenient backstop)", () => {
    // schema.ts maps to 3 docs; touching just README satisfies the nudge.
    expect(checkDocSync(["src/lib/db/schema.ts", "README.md"], entries)).toHaveLength(0);
  });
  it("ignores an unmapped source file", () => {
    expect(checkDocSync(["src/features/foo/Bar.tsx"], entries)).toHaveLength(0);
  });
  it("unions docs across multiple matching entries", () => {
    // src/lib/design/foo.css matches the src/lib/design/ prefix → needs DESIGN.md
    expect(checkDocSync(["src/lib/design/foo.css"], entries)[0].missingDocs).toContain("DESIGN.md");
  });
  it("never requires PRODUCT.md or TONE.md", () => {
    const all = entries.flatMap((e) => e.docs);
    expect(all).not.toContain("PRODUCT.md");
    expect(all).not.toContain("TONE.md");
  });
});
```

- [ ] **Step 3: Run, expect failure** — `npx vitest run scripts/hooks/doc-check.test.ts` → FAIL (module missing).

- [ ] **Step 4: Implement `scripts/hooks/doc-check.mjs`:**
```js
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
```

- [ ] **Step 5: Run tests (pass), commit**
```bash
npx vitest run scripts/hooks/doc-check.test.ts   # PASS
git add vitest.config.mts docs/doc-ownership.md scripts/hooks/doc-check.mjs scripts/hooks/doc-check.test.ts
git commit -m "feat(automation): doc-ownership map + doc-check (prefix match, tested, vitest include widened)"
```

---

### Task 2: doc-sync step in the committed `.githooks/pre-push`

**Files:**
- Modify: `.githooks/pre-push` (add a doc-sync step at the top; it's tracked → installed for everyone with `core.hooksPath=.githooks` enabled)

**Interfaces:**
- Consumes: `scripts/hooks/doc-check.mjs` (stdin CLI).

- [ ] **Step 1: Read the existing hook** — `.githooks/pre-push` is `#!/bin/sh`, `set -e`, runs lint → test:ci → build. Insert the doc-sync block **after `set -e` and before `npm run lint`** (fast fail before the slow gates).

- [ ] **Step 2: Add the block** (POSIX sh; reads git's pushed range from stdin; excludes deletions):
```sh
# Doc-sync backstop (soft): soft-block a push whose changed source files have
# un-synced docs (docs/doc-ownership.md). Override: git push --no-verify.
echo "pre-push: doc-sync check…"
while read -r _local_ref local_sha _remote_ref remote_sha; do
  [ "$local_sha" = "0000000000000000000000000000000000000000" ] && continue   # deleting a ref
  case "$remote_sha" in
    *[!0]*) base="$remote_sha" ;;                                             # existing remote branch
    *) base=$(git merge-base origin/main "$local_sha" 2>/dev/null \
              || git rev-list --max-parents=0 "$local_sha" | tail -1) ;;      # new branch
  esac
  files=$(git diff --name-only --diff-filter=ACMRT "$base".."$local_sha")
  [ -n "$files" ] && printf '%s\n' "$files" | node scripts/hooks/doc-check.mjs
done
```
> Deletions are excluded (`--diff-filter=ACMRT`) — removing a mapped file doesn't soft-block. `set -e` makes a `doc-check.mjs` exit-1 abort the push (the soft-block); `--no-verify` bypasses the whole hook.

- [ ] **Step 3: Verify behavior locally** (without a real push):
```bash
# clean: a mapped change WITH its doc
printf 'src/lib/env.ts\nREADME.md\ndocs/ARCHITECTURE.md\n' | node scripts/hooks/doc-check.mjs; echo "exit=$? (expect 0)"
# block: a mapped change WITHOUT its doc
printf 'src/lib/env.ts\n' | node scripts/hooks/doc-check.mjs; echo "exit=$? (expect 1)"
sh -n .githooks/pre-push && echo "hook syntax OK"
```

- [ ] **Step 4: Commit**
```bash
git add .githooks/pre-push
git commit -m "feat(automation): doc-sync backstop step in .githooks/pre-push"
```

---

### Task 3: `/sync-docs` skill (incremental only)

**Files:** Create `.claude/skills/sync-docs/SKILL.md`.

- [ ] **Step 1: Write it:**
```markdown
---
name: sync-docs
description: Use before pushing / opening a PR — update the governance docs (ARCHITECTURE/DEPLOYMENT/DESIGN/README; never PRODUCT/TONE) that this branch's changes affect, per docs/doc-ownership.md. Surgical, incremental.
---

# /sync-docs

Run **before pushing a feature branch** so doc updates land in the PR diff and are co-reviewed.

## Steps
1. `git diff --name-only --diff-filter=ACMRT $(git merge-base origin/main HEAD)..HEAD` — this branch's changed files.
2. Read `docs/doc-ownership.md`. For each changed source file, collect its mapped docs (exact path, or a `dir/` prefix).
3. For each mapped doc whose asserted fact this change actually moved, make a **targeted** edit. Never rewrite a doc wholesale. Never touch PRODUCT.md or TONE.md.
4. **Verify every claim against live code before writing it.**
5. For an architecture/auth/data decision, add or update the matching entry in `docs/ARCHITECTURE.md`'s decisions log.
6. Commit on the feature branch. The `.githooks/pre-push` doc-sync step backstops you — if it soft-blocks, you missed a mapped doc (or it's a `--no-verify` case because no documented fact changed).

## Never
- Rewrite a doc wholesale. Touch PRODUCT/TONE. Assert a fact you didn't verify in code.

(A rare full-doc resync after accumulated drift is a one-off human-directed task — not this skill.)
```

- [ ] **Step 2: Verify** — `head -4 .claude/skills/sync-docs/SKILL.md | grep -q "name: sync-docs" && grep -q "doc-ownership.md" .claude/skills/sync-docs/SKILL.md && echo OK`

- [ ] **Step 3: Commit** — `git add .claude/skills/sync-docs/SKILL.md && git commit -m "feat(automation): /sync-docs skill"`

---

### Task 4: `/close-out` skill (post-merge; defined sdd sanitization)

**Files:** Create `.claude/skills/close-out/SKILL.md`.

- [ ] **Step 1: Write it:**
```markdown
---
name: close-out
description: Use IMMEDIATELY AFTER merging a PR — close the bead, harvest durable lessons to bd memory (chat-first), and delete this branch's .git/sdd scratch. Never before merge is confirmed.
---

# /close-out

Run **right after `gh pr merge` succeeds.** Nothing here is destructive-before-merge: the bead and the sdd scratch must survive the whole review→fix→merge loop.

## Steps (any order)
1. **Close the bead(s):** `bd close <id> --reason "merged in #<PR>"` for the problem this PR resolved. (Skip if no bead.)
2. **Harvest lessons → memory:** scan the **conversation first**, then the ledger, for durable lessons / recurring problems (gotchas, non-obvious decisions). For each: `bd remember --key <slug> "<lesson>"`. Dedupe against `bd memories`; update in place if present. Skip session-only trivia and anything the code/CLAUDE.md already states.
3. **Delete this branch's scratch:**
   ```sh
   scope=$(git branch --show-current | tr '/' '-')
   [ -n "$scope" ] && rm -rf "$(git rev-parse --git-path sdd)/$scope"
   ```
   (The empty-`scope` guard prevents ever `rm -rf`-ing the whole `.git/sdd`.)

## Rules
- Chat is the primary lesson source (never clobbered); the ledger is supplementary.
- Never close a bead or delete scratch for work that has NOT merged.
- Idempotent: re-running after everything's closed is a no-op.
```

- [ ] **Step 2: Verify** — `grep -q "name: close-out" .claude/skills/close-out/SKILL.md && grep -q "Never before merge" .claude/skills/close-out/SKILL.md && grep -q 'tr ./. .-.' .claude/skills/close-out/SKILL.md && echo OK`

- [ ] **Step 3: Commit** — `git add .claude/skills/close-out/SKILL.md && git commit -m "feat(automation): /close-out skill (post-merge bead/lessons/sdd, safe sanitized rm)"`

---

### Task 5: CLAUDE.md "PR lifecycle" protocol (defines the ledger namespacing)

**Files:** Modify `CLAUDE.md` (append a section; leave the managed Beads block + other sections untouched).

- [ ] **Step 1: Add after the Workflow section:**
```markdown
## PR lifecycle automation

- **Before pushing / opening a PR:** run `/sync-docs` (update the governance docs this branch's
  changes affect, per `docs/doc-ownership.md`; never PRODUCT/TONE) and `/graphify --update` (refresh
  the committed graph). The `.githooks/pre-push` doc-sync step soft-blocks a code push whose mapped
  docs weren't touched — run `/sync-docs`, or `git push --no-verify` if no documented fact moved.
- **Immediately after `gh pr merge` succeeds:** run `/close-out` — close the bead(s), harvest lessons
  → `bd remember` (chat-first), delete this branch's `.git/sdd` scratch.
- **Hard rule:** never close a bead or delete `.git/sdd` scratch before the merge is confirmed. The
  bead is the "is it done?" truth; the scratch is the review loop's working context.
- **Multiple problems per session:** write each problem's ledger to
  `.git/sdd/$(git branch --show-current | tr '/' '-')/progress.md`, so a second problem never clobbers
  an in-flight one's scratch. `/close-out` deletes exactly that per-branch path.
- Hooks are committed in `.githooks/` (`core.hooksPath=.githooks`; enable once per clone:
  `git config core.hooksPath .githooks`). Nothing to install.
```

- [ ] **Step 2: Verify** — `grep -q "PR lifecycle automation" CLAUDE.md && grep -q "never close a bead" CLAUDE.md`; `git diff CLAUDE.md` shows only the added section (the `<!-- BEGIN BEADS INTEGRATION -->` block untouched).

- [ ] **Step 3: Commit** — `git add CLAUDE.md && git commit -m "docs(automation): CLAUDE.md PR-lifecycle protocol + ledger namespacing"`

---

### Task 6: Gates + PR + dogfood

- [ ] **Step 1: Full gates** — `npm run build`; `npm run test:ci` (grep the output for `doc-check` to confirm the new test ran); `npm run lint`. Expect green.
- [ ] **Step 2: Confirm the hook test ran in CI's gate** — the `test:ci` output lists `scripts/hooks/doc-check.test.ts` (Task 1 Step 0 widened the include). Absent → stop and fix. The `.githooks/pre-push` will also run this on the real push (Step 4).
- [ ] **Step 3: Dogfood `/sync-docs`** on this branch — it changed `scripts/hooks/**`, `.githooks/**`, `.claude/**`, `vitest.config.mts`, `CLAUDE.md`, `docs/**`. None is a mapped *source→product-doc* entry, so `/sync-docs` and the pre-push doc-check both pass clean (this feature changes no documented product fact). Note that as the expected first exercise.
- [ ] **Step 4: Push + PR** — `git push -u origin chore/pr-lifecycle-automation`. The committed `.githooks/pre-push` (now with the doc-sync step) runs locally on this push: expect lint+test+build green AND the doc-sync step clean (no mapped source changed). `gh pr create --base main --title "feat: PR-lifecycle automation (sync-docs + close-out skills, pre-push doc backstop)" --body "<summary>"`.
- [ ] **Step 5: Merge when green; then dogfood `/close-out`** — after merge, run `/close-out`: close any bead filed for this work, harvest lessons, clean this branch's scratch. First live use of the thing just built.

---

## Self-Review (v2)

**Review findings → all addressed:** installer/`prepare` removed, doc-check folded into committed `.githooks/pre-push` (Task 2); sdd sanitization defined once + empty-guard (Tasks 4/5); globs dropped for exact/prefix matching (Task 1) — kills the `**/*.css` bug; robust CLI guard + stdin range + stdin file list (Tasks 1/2); full-resync cut (Task 3); deletions excluded + leniency/union/prefix tested (Tasks 1/2). ✅

**Spec coverage:** sync-docs → Task 3; graph-update → CLAUDE.md (Task 5) via existing `/graphify`; close-out (bead+lessons+sdd) → Task 4; backstop → Tasks 1-2; map → Task 1; spine → Task 5; namespacing → Tasks 4/5; soft-block+override → Task 2. ✅

**Placeholder scan:** full content for map, mjs, hook block, both skills, CLAUDE.md section. PR `<summary>` filled at PR time. No TBD/TODO.

**Consistency:** `parseOwnership`/`checkDocSync` signatures + the `{entry,docs}` shape identical across mjs, test, and usage. `scope=$(git branch --show-current | tr '/' '-')` identical in close-out and CLAUDE.md. Skill names consistent. `docs/doc-ownership.md` path consistent everywhere.

**Honestly-named untested seams:** the `.githooks/pre-push` doc-sync block (bash; its decision logic is the tested `.mjs`, only the range/stdin plumbing is bash) and the two skills (agent instructions). These get verification/smoke steps, not unit tests — stated, not hidden.
