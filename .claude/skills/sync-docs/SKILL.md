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
