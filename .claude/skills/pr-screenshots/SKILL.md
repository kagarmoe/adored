---
name: pr-screenshots
description: Capture light+dark screenshots and embed them inline in a UI-affecting PR. Use BEFORE opening/updating any PR that changes user-visible UI (components, styling, layout, anything that alters what a reviewer would see). Turns the standing "UI PRs include screenshots" rule into one runnable step.
---

# /pr-screenshots

A UI-affecting PR must ship **light + dark screenshots that render inline in the PR body** — reviewers can't approve UI they can't see. This skill makes that a single command plus the embed steps, so it never gets skipped.

**When this applies:** the diff changes anything user-visible — a component, Tailwind/CSS, tokens, layout, copy in the UI, an image/render path. A purely server-side or config change with no visible delta does not need shots (say so in the PR instead).

## Steps

1. **Docker must be running** (the capture reuses the e2e throwaway Postgres). If `docker info` fails, tell the user and stop — capture later; don't fake it.

2. **Capture** — from the repo root:
   ```bash
   npm run screenshots
   ```
   This runs `e2e/screenshots/capture.ts` via `playwright.screenshots.config.ts`: builds the app, brings up the seeded test DB, logs in as the baseline user, and writes light+dark shots of the collections grid, items grid, and item detail on **tablet + phone** to `pr-screenshots/` (gitignored).
   - Need a different surface? Edit the `surfaces` list in `e2e/screenshots/capture.ts`.
   - Capture exercises the real UI; `/file` is fulfilled with a real fixture photo (no local blob emulator), same as every image e2e.

3. **Embed in the PR** — follow [`docs/cookbook/add-images-to-pr.md`](../../../docs/cookbook/add-images-to-pr.md) exactly: open the PR first (need its number `N`), `gh release create pr-N-images pr-screenshots/*.png --prerelease`, then put inline `![](…/releases/download/pr-N-images/…)` in the body (a Light | Dark table per surface reads well).

4. **Verify in the signed-in browser**, not `curl`. An anonymous `curl` of a private-repo release asset returns `404` — that is expected and NOT a broken image. Never delete the release after merge (the merged body still references it).

## Don't
- ❌ Skip shots on a visible change because "it's small."
- ❌ Commit PNGs to the tree — the release is their home (`pr-screenshots/` is gitignored).
- ❌ Declare the inline image broken from a `curl` 404 — see the cookbook's "one fact."

Related: memory `ui-prs-include-screenshots`; the cookbook is the source of truth for the embed mechanics.
