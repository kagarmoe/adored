# Cookbook: Add screenshots to a PR (so they render inline)

UI PRs must include **light + dark screenshots that render inline in the PR description** — reviewers can't approve UI they can't see. This repo is **private**, which trips people up. Follow this exactly.

## The one fact that confuses everyone

> An **anonymous** fetch of a release-asset image URL (`curl`, an image proxy, a logged-out tab) returns **`404`**. **This is expected and does NOT mean the image is broken.**

GitHub serves a private repo's release assets to a **signed-in collaborator's browser** using their session — and a private-repo PR is only ever viewed by signed-in collaborators. So the inline image renders for everyone who can see the PR. It is **not** a public/private problem and **not** an image-proxy (Camo) problem.

**Do not** "diagnose" a broken image with `curl` and switch methods. If a freshly-created release's images look missing, **give it a moment to propagate** and refresh — don't change anything.

## The method (proven: PR #143, #181)

Release assets + inline `![]()` embeds. Five steps.

### 1. Capture light + dark

Run the app logged-in and screenshot with the Playwright MCP, tablet viewport (e.g. 1024×768), toggling the header light/dark control between shots. Two ways to get a logged-in session with content on screen:

- **Dev server** — `npm run dev` (port 3000; auto-loads `.env.local` → dev Neon). Use Google login with a seeded/dev collection, or use the local e2e harness below when you need a deterministic signed-in user.
- **Local e2e harness** — bring up the throwaway DB (`bash e2e/fixtures/test-db.sh up`), seed it, run `next start` against it. Baseline auth is written by `e2e/auth.setup.ts` as a Google-linked Better Auth session for `e2e@adored.test`. Pooled-photo screenshots need real Blob keys — upload the fixture (`public/onboarding/blue-mixing-bowl.webp`) to Blob and insert photo rows pointing at the returned URLs.

Save as descriptive, unique names: `<feature>-<surface>-{light,dark}.png`.

### 2. Open the PR first (you need its number)

The release is named `pr-<N>-images`, so create the PR before the release:

```bash
gh pr create --base main --head <branch> --title "…" --body "…"   # note the PR number N
```

### 3. Create a prerelease holding the PNGs

```bash
gh release create "pr-<N>-images" shot-light.png shot-dark.png \
  --prerelease \
  --title "PR #<N> screenshots" \
  --notes "Image assets for PR #<N> — do NOT delete (the PR body references them)."
```

Confirm both assets uploaded:

```bash
gh release view "pr-<N>-images" --json assets --jq '[.assets[]|{name,state}]'   # state: "uploaded"
```

### 4. Embed inline in the PR body

Use **inline `![]()` markdown** (not links), pointing at the release **download** URLs. A two-column light/dark table reads well:

```markdown
## Screenshots

_<one line: what the shot shows>_

| Light | Dark |
| --- | --- |
| ![… light](https://github.com/<owner>/<repo>/releases/download/pr-<N>-images/shot-light.png) | ![… dark](https://github.com/<owner>/<repo>/releases/download/pr-<N>-images/shot-dark.png) |
```

The URL is each asset's `browser_download_url` (`gh release view pr-<N>-images --json assets --jq '.assets[].browser_download_url'`), which is always `…/releases/download/<tag>/<name>`.

```bash
gh pr edit <N> --body-file body.md
```

### 5. Verify the right way

- `gh release view pr-<N>-images --json assets` → both assets `uploaded`.
- **Open the PR in your browser, signed in.** The images render inline. (Allow a short propagation delay right after step 3.)
- An anonymous `curl` returning `404` is **not** a failure signal — ignore it.

## Don't

- ❌ **Don't delete the release after merge.** The merged PR body still references those asset URLs — deleting permanently breaks the images. The prerelease is their durable home.
- ❌ **Don't switch to links / declare it broken because an anonymous `curl` 404'd.** See "The one fact" above.
- ❌ **Don't commit PNGs to `main` or a feature branch.** The release is the home (keeps binaries out of the tree).

## Fallback: clickable links via the `assets` branch (PR #117)

Only if you specifically can't use a release. Gives **clickable links, not inline images**.

```bash
git worktree add /tmp/wt assets            # the long-lived 'assets' branch
mkdir -p /tmp/wt/<N> && cp shot-*.png /tmp/wt/<N>/
git -C /tmp/wt add <N>/ && git -C /tmp/wt commit -m "assets: PR #<N> screenshots"
git -C /tmp/wt push --no-verify origin assets   # --no-verify: the worktree has no node_modules, so the pre-push lint hook would fail
git worktree remove /tmp/wt
```

In the PR body, link them (a `blob/` URL renders GitHub's file page, not an image — so link, don't `![]`):

```markdown
> Repo is private, so inline images don't render here — links to PNGs on the `assets` branch (open while signed in).
- 📷 [… light](https://github.com/<owner>/<repo>/blob/assets/<N>/shot-light.png)
```

## TL;DR

1. PR first (get `N`). 2. `gh release create pr-N-images *.png --prerelease`. 3. Inline `![]()` with the `releases/download/pr-N-images/…` URLs. 4. Verify in the **signed-in browser**, not `curl`. 5. Never delete the release.
