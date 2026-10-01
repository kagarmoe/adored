# Tutorials Area Design

## Goal

Add a small Tutorials area reachable from Profile before introducing any header/account-menu complexity.

## Current State

- `/tutorial` is a public wrapper around the existing sort walkthrough.
- `/welcome` remains the first-run gated walkthrough.
- Profile has a single "New to Adored?" row linking to `/welcome`.
- `src/proxy.ts` allows public `/tutorial` and `/onboarding/*`.

## Proposed IA

- `/tutorials`: quiet Tutorials index.
- `/tutorials/collection`: Start a collection.
- `/tutorials/sort`: Sort and refine, using the current completed walkthrough.
- `/tutorials/sharing`: Invite and share.
- `/tutorials/timers`: Round timers.
- `/tutorial`: redirect to `/tutorials/sort` so old links keep working.

Profile replaces "New to Adored?" with:

- Title: `Tutorials`
- Body: `Revisit any part of Adored when you want a quick refresher.`
- Links:
  - `Start a collection`
  - `Sort and refine`
  - `Invite and share`
  - `Round timers`

## Surface Decisions

- Keep Header unchanged. No dropdown yet.
- Keep the Tutorials surfaces public, matching the existing public `/tutorial`.
- Keep non-sort tutorial pages intentionally simple until their real interactive tutorials are built.
- Use existing cards, links, spacing, and AppLayout rather than inventing a help-center visual system.

## Review Notes Folded In

- **QA:** Unit tests must cover Profile links, `/tutorial` redirect, `/tutorials` index, and `/tutorials/sort` rendering the walkthrough.
- **UX:** Do not make placeholder routes look complete. They should say what the future tutorial covers without pretending the walkthrough exists.
- **Security/Auth:** Update proxy allowlist from `/tutorial` to `/tutorials/*` plus `/tutorial` redirect. These pages contain no private data.
- **CI-minutes:** Run mapped Playwright locally for profile/tutorial navigation on tablet and phone before opening a PR.

## Acceptance

- Profile shows the Tutorials section with four links and no "New to Adored?" section.
- `/tutorials` lists the four tutorials with the requested titles and descriptions.
- `/tutorials/sort` renders the existing completed tutorial.
- `/tutorial` redirects to `/tutorials/sort`.
- `/tutorials/collection`, `/tutorials/sharing`, and `/tutorials/timers` exist and describe their scope.
- Public routing works without login for `/tutorials` and `/tutorials/*`.
