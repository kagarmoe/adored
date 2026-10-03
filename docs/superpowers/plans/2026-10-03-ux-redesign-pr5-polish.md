# Adored UX redesign — PR 5 (polish) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax. Track work in beads (`bd`), never TodoWrite. Never run two implementer
> subagents at once (memory `sdd-never-overlap-implementers`); implementers never run
> `graphify update .` (memory `sdd-implementers-must-not-run-graphify-update`).

**Goal:** Close the epic's polish beads: no inline alpha tints left, the pool's selection bar
matches the PR 3 bottom bar, the archived card's Bring back no longer looks misaligned or overflows,
the PR 2 residual minors are fixed, dead and duplicated sort-client plumbing is removed, the CI e2e
map is fixed, and `eslint-config-next` matches `next`. Appended at pre-flight: the collection home
drops the mode chips (`.14`), and the local test infra is hardened. That means one DB lock, a fresh
DB for e2e, a Homebrew fallback, doc-check skipping tests, and the charter's CI rules (`.24`–`.27`).

**Architecture:** No schema, no migration, no new route, no new colour token. The inline-tint ban
gets a source-scan guard, plus one new `Card` variant (`danger`, built from existing tokens). The
pool's `PoolActionBar` keeps its own component (it is fixed at every width, so it can't be
`ActionBar`, which turns into an inline row at `md`). It takes `ActionBar`'s surface treatment and
reserves its height through one `globals.css` rule keyed on `data-selection-bar`. The
storage-unavailable fallback POST, now copied in five places, moves into one helper,
`src/features/sorting/directSubmit.ts`.

**Tech Stack:** Next.js 16 App Router, React 19, Tailwind 4, vitest + Testing Library (jsdom/node),
Drizzle/Postgres (one DB test edited), Playwright (WebKit tablet project in CI).

**Spec:** `docs/superpowers/specs/2026-10-01-adored-ux-redesign-design.md` §5 (Frosted shelf:
"Per-component inline tints are banned"; glass-strong ≥ 0.85 + blur for text-carrying bars; a
fixed bottom action bar on phone), §7 (every test runs in CI at the cheapest tier), §8
(light/dark/phone screenshots). Bead texts: `purses-w7ss.4`, `.13`, `.17`, `.11`, `.9`, `.15`,
`.14`, `.24`, `.25`, `.26`, `.27`, `purses-ejvl`. Context: `docs/superpowers/plans/2026-10-02-ux-redesign-pr3-lists-home.md` (Task 4,
`ActionBar`; Task 7, the phone-bar geometry pattern) and
`docs/superpowers/plans/2026-10-01-ux-redesign-pr2-sort.md` (the queue, `PendingNotices`,
`RankingList`). PR 4 (#373, merge `820fb647c`) **is** on this branch (rebased onto `bee445411`;
pre-flight re-verified every reference below against it). PR 4 did not touch `ActionBar`,
`ArchivedItemCard`, `AsyncActionButton`, `BringBackButton` or any `src/features/sorting/` file. It
did add the `result-revision-note` beat to `e2e/screenshots/capture.ts` (Tasks 2 and 4 edit around
it), relabel rows in `contrast.test.ts`, delete `updateResultName`, add `createMany` /
`findBySessions`, and add decision 44 to ARCHITECTURE.md.

## Global Constraints

- **Tokens only.** Spec §5 / DESIGN.md §2: "Per-component inline tints are banned — use the
  tokens." No `/NN` opacity modifier on a colour utility in `src/**/*.tsx`. No new colour token in
  this PR.
- **Glass:** a text-carrying bar is `bg-glass-strong` + `backdrop-blur-md` + `shadow-lift` + a
  `border-hairline` top edge (the PR 3 `ActionBar` treatment), `z-30` (below the `z-40` header).
- **Tap targets** ≥ 44px (`h-11` / `min-h-11`). WCAG 2.1 AA in both themes; every new colour
  pairing gets a row in `src/lib/design/contrast.test.ts` (it reads `globals.css` directly).
- **TONE:** never "error"/"failed"/"invalid" in person-side copy. Red only on destructive,
  irreversible actions, and kept sober.
- **Tests:** TDD (failing test first). DB tier only for real DB crossings. e2e runs on the tablet
  project in CI. A viewport-sensitive check sets `page.setViewportSize({ width: 390, height: 664 })`
  inside that project (precedent: `e2e/lists-and-home.spec.ts` "phone: the bar is pinned…"). Every
  test must run in the CI gate: no `.skip`, and DB tests sit behind `RUN_DB_TESTS=1` in
  `src/lib/db/`.
- **Git:** stay on `feat/ux-redesign-pr5-polish`. Never `git add -A`. The untracked
  `.beads.gate.lock`, `.codex/` and `pr-screenshots/` are never staged. One logical change per
  commit. Do not push without the owner's go-ahead.

## Review Focus

These five inputs or conditions are the most likely to bite a person, and no task's main tests
exercise them. The test that pins each one is added in the task named.

1. **Pool bar with the Move to… chooser open on a phone.** The bar grows upward by up to `max-h-64`.
   Expected: the bar stays pinned to the bottom edge, and the chooser scrolls inside itself.
   Pinned in Task 2 (the e2e opens the chooser and re-checks bottom == viewport height).
2. **Bring back while busy on the narrowest phone card.** The old busy label "Bringing it back…"
   is wider than a 390px two-column card. Expected: the label fits inside the pill, and the pill
   fits inside the card. Pinned in Task 3 (the e2e holds the restore request open and measures the
   busy pill).
3. **A 401 mid-round, and a 401 during recovery.** Today nothing renders mid-round, because the
   sign-in line exists only inside the recovery gate; and a notice raised before a surface mounts
   is lost. Expected: one quiet "sign in again" line with a Sign in link that returns to the round,
   never two, and never lost on a remount. Pinned in Task 5 (the engine's sticky-notice test, a
   PendingNotices unit test, and the gate test whose children include a real `<PendingNotices/>`
   and which counts `getAllByText(...)` = 1 after reveal, and again after a second 401).
4. **A tap after the sort was closed elsewhere.** Expected: the cards, Tie, Skip and Undo hold still
   (`aria-disabled`), and nothing new is queued, including an Undo tap on an answer that settled
   before the 409. Pinned in Task 5.
5. **Storage blocked (private mode) after the fallback refactor.** Expected: the same request each
   island sent before (same route, method and body), a network throw read as "did not land", and
   the island's own gentle line. Pinned in Task 7 (`directSubmit` unit table, plus the existing
   caller fallback tests kept green).

Accepted, not pinned: the over-cap line (selecting more than 50 photos) makes the phone bar taller.
The 14rem reserve is sized to cover it by arithmetic (Task 2, Step 3). Seeding 51 photos in e2e
costs more than the check is worth.

---

## Decisions this plan takes where the spec is silent

1. **No scrim token.** The scrims bead `.4` named (`SortHelpDialog`, `RoundLengthDialog`) were
   deleted along with `RoundShell` in PR 2 (`2e015fc97`). `ImageViewer` already uses `bg-ground`,
   and no `<dialog>`/`backdrop:` scrim is left in `src/`. So no scrim token is proposed.
2. **The inline-tint sweep covers the rule, not only the bead's list.** Besides the bead's
   `DeleteAccountSection`/`DeleteCollectionSection` (`bg-error-soft/30`), `ItemPhotoCarousel`
   (`bg-ink-soft/70`) and `ThemeToggle` (`hover:bg-content-soft/40`), the same scan finds
   `ring-ink/10` (×3: carousel expand badge, carousel arrows, `PhotoViewControl`),
   `text-ink-soft/70` (`MostLovedHero`) and `text-ink-soft/50` (`CollectionCard`,
   `PhotoPoolPreview`). All ten are fixed, and a source-scan test keeps the count at zero. The scan
   works like a lint rule: it catches a real regression of a written ban that no other tier sees,
   and it proves it scanned a non-empty file set.
3. **Mappings onto existing tokens:** `ring-ink/10` → `ring-hairline`; `text-ink-soft/70|50` →
   `text-ink-soft` (the precedent is `ArchivedItemCard`'s fallback initial; ink-soft on content-soft
   is already gated at 6.2/6.4). `hover:bg-content-soft/40` → `hover:bg-content-soft` (the precedent
   is `Button` ghost and the `RankingList` controls).
4. **Carousel dots:** inactive `bg-ink-soft` (solid, gated on ground/surface/card). The active dot
   stays `bg-primary` and becomes a 16px pill (`w-4`). Primary and ink-soft differ too little in
   hue, so shape carries "current" (DESIGN "Colour is never the sole signal"); `aria-current`
   already carries it for assistive tech.
5. **Danger sections** use `<Card variant="danger">` = `bg-card shadow-card border border-error`.
   The pink wash goes; a sober error rim on the ordinary card replaces it. The two fighting `bg-*`
   utilities go with it. New contrast row: `error` on `card` ≥ 3.0 (light 6.42, dark 4.46).
6. **`PoolActionBar` is not `ActionBar`.** `ActionBar` turns into an inline row from `md` up, but
   the pool's selection bar must stay fixed on tablet: the person selects tiles anywhere in a long
   grid, and the actions must follow them. So the pool bar takes `ActionBar`'s surface (z-30,
   blur-md, shadow-lift, hairline top edge, static on a short viewport). No `mb-0`: the bar is the
   last child of `PoolPhotoGrid`'s `space-y-4`, which only margins following siblings. It drops the dead safe-area padding (the viewport is not `viewportFit: cover`, so the
   inset is always 0; see `ActionBar`'s comment). It replaces the in-grid `h-20` spacer, which never
   covered the footer and is shorter than the phone bar, with a `globals.css` reserve keyed on
   `data-selection-bar`: 14rem below `sm`, 9rem from `sm`, none on a short viewport, applied to the
   `AppLayout` root (new `data-app-shell` attribute) and as `scroll-padding-bottom`.
7. **Archived item card:** Bring back becomes a **secondary pill** at natural width
   (`AsyncActionButton` gains `variant="secondary"`). Its visible edge then lines up with the name
   column at the card's `p-3`, with no negative margin and nothing clipped past `overflow-hidden`.
   The busy label becomes "One moment…" (controller ruling: "Bringing it back…" does not fit a
   147px phone card column, and "Just a moment…" is expected to be too close to fit on one line).
   `ArchivedNotice`'s own "Bringing it back…" sits in a full-width notice, so it is unchanged.
8. **PR 2 residuals:** the phone ordinal stays visible at `text-xs`/`w-5`. The phone Unpin control
   shows the word **Unpin** at every width (spec §4 "a small Unpin"); the glyph goes. After a 409
   the compare controls hold (`aria-disabled`, taps ignored). Notices become **sticky in the
   engine** (see Rulings): `PendingNotices` reads the current set on mount, keeps one
   always-mounted `role="status"` region, and voices `auth_required` (not dismissible; a Sign in
   link back to the current path) and `session_conflict` (a Reload button). The sign-in copy moves
   from the gate's `GATE_SIGNIN_LINE` to `pendingNotices.tsx` as `AUTH_REQUIRED_NOTICE` (same
   words). The gate renders its own `PendingNotices` only until reveal; after reveal the page's
   single one speaks, so the line is never doubled by construction.
9. **CI filter paths must exist.** `scripts/ci-e2e-map.test.ts` gains a check that every pattern
   in the `changes` job's path filters matches at least one path (`fs.globSync`). It flags four
   dead patterns: `src/lib/pairwise-selection.ts` (the bead's), `tailwind.config.ts` (×2; Tailwind 4
   has none) and `src/hooks/**` (no such directory). All four are removed in the same task. One
   exemption: root-level extension catch-alls (`*.js` under `code:`) are deliberate "any future
   root config" guards for the CI gate itself; `*.js` matches nothing today, and deleting it would
   let a new root `.js` file skip CI.
10. **Dead `session` arms are deleted, not kept "for later".** Every shipped caller of
    `DecisionControls`, `DeferControl` and `SetAsideButton` passes `kind: "local"` (`TriageRound`,
    `WelcomeTriage`). So the prop collapses to `onDecision`. `DecisionControls`' never-varied
    `type` prop goes too (only `"triage"` is ever passed). `TriageUndoProvider.defer` has no caller
    once `DeferControl`'s session arm is gone (`TriageRound` defers through its own `handleNotYet`),
    so it goes as well. `SetAsideUndo.test.tsx` keeps every provider test, driven by a three-line
    test consumer of `useTriageUndo()` instead of the deleted session button.
11. **`getDraftResult` is deleted.** Its only reference is its own definition (grep across `src`,
    `e2e`, `scripts`). `updateResultName` was already deleted on `main` by PR 4 (`820fb647c`) and
    is out of scope here.
12. **`eslint-config-next`:** `npm install -D eslint-config-next@^16.3.8` (rather than a bare
    `npm update`). The range floor then matches `next`'s `^16.3.8`, so the two can't drift apart
    again within 16.x. The `braces` osv ignore stays: no fixed version exists, and the transitive
    chain is unchanged.
13. **CI map (`.15`):** the `sort` area adds `e2e/lists-and-home.spec.ts`. No new test: an
    assertion that the line contains the string would just restate the config. The existing
    `ci-e2e-map.test.ts` must still pass.

## Owner-veto list (put in the PR body with screenshots)

- **No new token.** (Decision 1: none was needed.)
- **Danger sections:** the pink wash is replaced by an error-red rim on the ordinary card
  (Profile → Delete your account; Collection settings → Delete this collection).
- **Carousel dots:** inactive dots are solid ink-soft (darker than before), and the active dot is a
  short pill.
- **Faint rings and placeholder glyphs:** `ring-hairline` instead of ink at 10% on the photo
  controls (in dark mode, a visible teal rim). Collection-card and pool-preview placeholder glyphs
  and the Most-loved fallback initial are solid ink-soft (stronger than before).
- **Theme toggle hover:** a full `content-soft` fill instead of 40%.
- **Pool selection bar:** a stronger blur, a shadow, a hairline top edge instead of the white rim,
  and room reserved below the page. On a short (zoomed) viewport the bar scrolls with the page. Its
  stacking moves to `z-30` (under the header; cosmetic).
- **Archived item card:** Bring back is a bordered secondary pill (it was a borderless ghost), and
  its busy text is "One moment…" (copy change; was "Bringing it back…").
- **Ranking on phone:** a small position number shows on every row, and the phone Unpin control
  shows the word "Unpin" (it was a pin glyph alone).
- **Mid-round sign-out:** the sign-in line moves into the notices region with a Sign in link that
  returns to the round: "Sign in again and your answers will finish saving on their own". It has no
  Okay (signing in is the way to clear it).
- **Sort closed elsewhere:** after a sort is closed elsewhere the compare cards dim and hold, and
  Reload is offered (in place of Okay) beside "This sort was wrapped up somewhere else…".
- **Collection home without mode chips** (`purses-w7ss.14`, owner decision 2026-10-03): the
  Build / Sort / Decide chips are gone from the collection home. The home keeps Start/Keep sorting,
  the Add photos pill and See your ranking (tablet). The chips stay on the Photos and Decide
  section pages.

## Rulings (controller)

1. **Task 5 sticky notices.** The notice engine (`decisionFlusher.ts`, `subscribeNotices`) keeps
   the current notice set. A new subscriber receives it on subscribe. `dismissNotice(kind)` clears an
   entry, and so does resolution: `auth_required` clears on the next 2xx; a reload clears all.
   `session_conflict` carries its `sessionId`, and `CompareChoice` / `PendingNotices` ignore
   another session's conflict, so a sticky conflict from an earlier sort can never hold (or
   mislabel) a new sort in the same tab. (Plan-time addition: without the scoping, sticky replay
   would deadlock a new sort's compare after a client-side navigation.)
   `PendingNotices` reads the set on mount, so a remount loses nothing. `PendingDecisionsGate`
   renders its `PendingNotices` only until reveal, in one fixed tree shape; after reveal the page's
   single `PendingNotices` shows everything. "Never two" is structural.
2. **Unpin word over glyph** on phone (spec §4 "a small Unpin").
3. **"One moment…"** is the archived card's busy label.
4. **Danger rim via the existing `error` token.** No new token.

## Rejected review findings

- **A separate `useOptimisticRound.submitDecision` fallback test.** Already pinned through the
  real hook by `TriageRound.test.tsx:280` ("a fallback that does not land keeps the piece in place
  with a gentle line": setItem throws → `needs_fallback`, fetch `ok: false` → stumble line, "Love —
  saved." never announced). A second test would be a near-twin.
- **A `deferred` row in the `directSubmit` table.** Same branch as the `set_aside` row (the
  disposition is passed through), so it can't catch anything new. The other option the review
  offered, a `TriageRound` Not-yet fallback test that pins the caller, is added instead (Task 7).
- **`globSync` > 0 for literally every filter pattern.** Applied with one exemption: root-level
  extension catch-alls (`*.js` under `code:`) match nothing today by design. They make sure a
  future root config still triggers CI, so deleting them would weaken the gate.

---

## File map

| Task | Bead | Create | Modify | Delete |
|---|---|---|---|---|
| 1 | `.4` | `src/lib/design/no-inline-tints.test.ts` | `src/components/ui/Card.tsx`, `src/features/profile/DeleteAccountSection.tsx`, `src/features/collections/DeleteCollectionSection.tsx`, `src/features/items/ItemPhotoCarousel.tsx`, `src/components/ui/PhotoViewControl.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/features/results/MostLovedHero.tsx`, `src/features/collections/CollectionCard.tsx`, `src/features/collections/PhotoPoolPreview.tsx`, `src/lib/design/contrast.test.ts` | — |
| 2 | `.13` | — | `src/features/pool/PoolActionBar.tsx`, `src/features/pool/PoolPhotoGrid.tsx`, `src/components/layout/AppLayout.tsx`, `src/app/globals.css`, `e2e/lists-and-home.spec.ts`, `e2e/screenshots/capture.ts` | — |
| 3 | `.17` | — | `src/features/sorting/AsyncActionButton.tsx`, `src/features/items/BringBackButton.tsx`, `e2e/lists-and-home.spec.ts` | — |
| 4 | `.11` (A) | — | `src/features/results/RankingList.tsx`, `e2e/sort-journey.spec.ts`, `src/lib/db/ranking-save-route.integration.test.ts`, `scripts/ci-e2e-map.test.ts`, `.github/workflows/ci.yml`, `e2e/screenshots/capture.ts` | — |
| 5a / 5b | `.11` (B) | — | `src/features/sorting/decisionFlusher.ts`, `src/features/sorting/decisionFlusher.test.ts`, `src/features/sorting/CompareChoice.tsx`, `src/features/sorting/CompareChoice.test.tsx`, `src/features/sorting/pendingNotices.tsx`, `src/features/sorting/pendingNotices.test.tsx`, `src/features/sorting/PendingDecisionsGate.tsx`, `src/features/sorting/PendingDecisionsGate.test.tsx`, `src/features/sorting/TriageRound.tsx`, `src/features/sorting/TriageRound.test.tsx`, `src/app/collections/[id]/results/page.tsx`, `src/app/collections/[id]/sort/page.tsx` | — |
| 6 | `.9` (A) | — | `src/features/sorting/DecisionControls.tsx` (+ test), `src/features/sorting/DeferControl.tsx` (+ test), `src/features/sorting/SetAsideButton.tsx`, `src/features/sorting/SetAsideUndo.test.tsx`, `src/features/sorting/TriageUndoProvider.tsx`, `src/features/sorting/TriageRound.tsx`, `src/features/onboarding/WelcomeTriage.tsx`, `src/server/services/SortResultService.ts`, `src/features/sorting/localMode.guard.test.ts` (header comment) | — |
| 7 | `.9` (B) | `src/features/sorting/directSubmit.ts`, `src/features/sorting/directSubmit.test.ts` | `CompareChoice.tsx`, `useOptimisticRound.ts`, `TriageRound.tsx`, `TriageRound.test.tsx`, `TriageUndoProvider.tsx`, `decisionFlusher.ts` (header comment) | — |
| 8 | `.15` | — | `.github/workflows/ci.yml` | — |
| 9 | `ejvl` | — | `package.json`, `package-lock.json`, `src/features/onboarding/WalkthroughShell.tsx` (one disable comment) | — |
| 10 | `.14` | — | `src/app/collections/[id]/page.tsx`, `src/app/collections/[id]/page.test.tsx`, `e2e/lists-and-home.spec.ts`, `DESIGN.md` (§5 Wayfinding chip sentence) | — |
| 11 | `.24` | `scripts/db-lock.ts`, `scripts/db-lock.test.ts`, `scripts/with-db-lock.ts` | `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `package.json` (`test:db` script), `docs/ARCHITECTURE.md` (stale "Worktree-derived ports" paragraph), `docs/DATABASE.md` (test:db paragraph) | — |
| 12 | `.25` | — | `e2e/fixtures/test-db.sh`, `e2e/fixtures/run-db-tests.sh`, `docs/DATABASE.md` (same paragraph) | — |
| 13 | `.26` | — | `scripts/hooks/doc-check.mjs`, `scripts/hooks/doc-check.test.ts` | — |
| 14 | `.27` | — | `.claude/skills/adored-revamp/SKILL.md` | — |
| 15 | all | — | `DESIGN.md`, `docs/ARCHITECTURE.md`, `graphify-out/` | — |

Order: the tasks run in sequence. Tasks 4 and 8 both edit `ci.yml` (different lines). Task 7 depends
on Task 6 (`TriageUndoProvider.defer` must be gone first). Task 5 and Task 7 both touch
`CompareChoice.tsx` (different blocks) and `decisionFlusher.ts` (Task 5 the notice state, Task 7
the header comment). Task 5 runs as two commits/reviews: **5a** engine + gate (Steps 1–4 and 6–7's
engine/gate parts) and **5b** the notice copy, links and Reload (Step 5's rendering). Task 10 edits
`e2e/lists-and-home.spec.ts` after Tasks 2 and 3 (different tests) and `DESIGN.md` before Task 15
(different lines). Task 11 edits `package.json` after Task 9 (the `scripts` block, not deps). Task
12 runs after Task 11 (both change how the local test DB starts; Task 11's `reset` relies on Task
12's `down` wiping the Homebrew cluster) and both edit the same `DATABASE.md` paragraph. Task 14
runs after Task 11 (it names Task 11's lock in the charter). Tasks 11–13 change no product code and
need no screenshots.

---

## Task 1: Replace the remaining inline alpha tints with tokens (`purses-w7ss.4`)

**Files:** see the file map. **Test:** `src/lib/design/no-inline-tints.test.ts` (new) and
`src/lib/design/contrast.test.ts` (one row).

**Interfaces:**
- Produces: `Card` `variant?: "card" | "glass" | "danger"`.

- [ ] **Step 1: Write the failing scan test** `src/lib/design/no-inline-tints.test.ts`:

```ts
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Spec §5 / DESIGN.md §2: "Per-component inline tints are banned — use the tokens."
// A Tailwind opacity modifier on a colour utility (bg-x/30, bg-x/[.3], bg-x/(--a), ring-ink/10,
// hover:bg-y/40) is exactly that, and so is an arbitrary colour (bg-[#fff], text-[rgb(…)]).
// Fractions like w-1/2 or translate-y-1/2 are not colour utilities.
const TINT =
  /\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|via|to|shadow|decoration|placeholder|caret|accent)-(?:[a-z]+(?:-[a-z]+)*\/(?:\d{1,3}|\[[^\]]+\]|\([^)]+\))|\[(?:#|rgb|hsl))/g;

const root = new URL("../../", import.meta.url).pathname; // src/
function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = join(dir, e.name);
    if (e.isDirectory()) return sources(p);
    return /\.tsx?$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("no inline alpha tints", () => {
  const files = sources(root);
  it("scans the real source tree (a scan of nothing is a false green)", () => {
    expect(files.length).toBeGreaterThan(100);
  });
  it("no colour utility carries an /NN opacity modifier", () => {
    const hits = files.flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(TINT)].map((m) => `${f.slice(root.length)}: ${m[0]}`),
    );
    expect(hits).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and see it fail.**
  `npx vitest run src/lib/design/no-inline-tints.test.ts`. Expected: FAIL, listing exactly 10
  hits: `profile/DeleteAccountSection.tsx: bg-error-soft/30`,
  `collections/DeleteCollectionSection.tsx: bg-error-soft/30`, `ItemPhotoCarousel.tsx: ring-ink/10`
  ×2 and `bg-ink-soft/70`, `PhotoViewControl.tsx: ring-ink/10`,
  `ThemeToggle.tsx: hover:bg-content-soft/40` (shown as `bg-content-soft/40`),
  `MostLovedHero.tsx: text-ink-soft/70`, and `CollectionCard.tsx` / `PhotoPoolPreview.tsx:
  text-ink-soft/50`. (Checked at plan time: the widened regex finds the same 10 on this branch and
  no arbitrary-colour hits. Re-checked after the PR 4 rebase: still exactly these 10;
  `MakeRevisionButton`'s new note adds none.) If the list differs, stop and re-read Decision 2 before going on.

- [ ] **Step 3: Add the contrast row** for the danger rim in `pairings()` in
  `src/lib/design/contrast.test.ts`, after the `primary link on card` row:

```ts
    // Danger sections (Card variant="danger"): the error rim must read as an edge on the card fill (SC 1.4.11).
    [t.error, t.card, 3.0, "error rim on card (danger section)"],
```

- [ ] **Step 4: Add the `danger` variant** to `src/components/ui/Card.tsx`:

```tsx
  /** "card": grid/list tile, opaque pre-composited fill, no blur (cheap to scroll).
   *  "glass": a text-carrying panel over photos/scroll — glass-strong + blur + rim.
   *  "danger": a destructive section (delete account / collection) — the card fill with a sober error rim. */
  variant?: "card" | "glass" | "danger";
```

```tsx
const surfaceMap = {
  card: "bg-card shadow-card border border-hairline",
  glass: "bg-glass-strong backdrop-blur-xl shadow-lift border border-rim",
  danger: "bg-card shadow-card border border-error",
};
```

- [ ] **Step 5: Replace each tint.**
  - `DeleteAccountSection.tsx:53` and `DeleteCollectionSection.tsx:58`:
    `<Card padding="lg" className="mt-10 border border-error-soft bg-error-soft/30">` →
    `<Card variant="danger" padding="lg" className="mt-10">`.
  - `ItemPhotoCarousel.tsx:331` and `:426`, and `PhotoViewControl.tsx:33`: `ring-ink/10` →
    `ring-hairline`.
  - `ItemPhotoCarousel.tsx:376`:
    `` className={`block h-2 w-2 rounded-full ${i === current ? "bg-primary" : "bg-ink-soft/70"}`} `` →
    `` className={`block h-2 rounded-full ${i === current ? "w-4 bg-primary" : "w-2 bg-ink-soft"}`} ``
  - `ThemeToggle.tsx:39`: `hover:bg-content-soft/40` → `hover:bg-content-soft`.
  - `MostLovedHero.tsx:25`: `text-ink-soft/70` → `text-ink-soft`.
  - `CollectionCard.tsx:33` and `PhotoPoolPreview.tsx:80`: `text-ink-soft/50` → `text-ink-soft`.

- [ ] **Step 6: Run the tests and see them pass.**
  `npx vitest run src/lib/design src/components/ui src/features/items/ItemPhotoCarousel.test.tsx src/features/profile src/features/collections src/components/theme`.
  Expected: PASS, with the scan reporting zero hits and the contrast row green in both themes.

- [ ] **Step 7: Commit.**

```bash
git add src/lib/design/no-inline-tints.test.ts src/lib/design/contrast.test.ts src/components/ui/Card.tsx \
  src/features/profile/DeleteAccountSection.tsx src/features/collections/DeleteCollectionSection.tsx \
  src/features/items/ItemPhotoCarousel.tsx src/components/ui/PhotoViewControl.tsx \
  src/components/theme/ThemeToggle.tsx src/features/results/MostLovedHero.tsx \
  src/features/collections/CollectionCard.tsx src/features/collections/PhotoPoolPreview.tsx
git commit -m "fix(design): replace the last inline alpha tints with tokens; danger Card variant (purses-w7ss.4)"
```

---

## Task 2: `PoolActionBar` takes the PR 3 bottom-bar treatment (`purses-w7ss.13`)

**Files:** `src/features/pool/PoolActionBar.tsx`, `src/features/pool/PoolPhotoGrid.tsx`,
`src/components/layout/AppLayout.tsx`, `src/app/globals.css`, `e2e/lists-and-home.spec.ts`,
`e2e/screenshots/capture.ts`.

**Interfaces:**
- Produces: `PoolActionBar`'s region carries `data-selection-bar`. `AppLayout`'s root carries
  `data-app-shell`. `globals.css` reserves 14rem (below `sm`) or 9rem (`sm`+) when a selection bar
  is present and the viewport is taller than 500px.

- [ ] **Step 1: Write the failing e2e** in `e2e/lists-and-home.spec.ts`. Add the imports
  `import { getTestDb } from "./fixtures/db";` (next to `closeDb`) and
  `import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";`. Add
  `let pool: SeededCollectionRef;` to the `let` block. In `beforeAll` add
  `pool = await seedPool(ownerId, 12); // enough tiles to scroll on a phone`. Add this helper below
  `const card = …`:

```ts
// A collection with n loose pool photos named "shelf photo 1…n" (the tile's accessible name).
async function seedPool(owner: string, n: number): Promise<SeededCollectionRef> {
  const ref = await seedNamedCollection(owner, `E2E Pool ${Date.now()}`);
  const photos = new PhotoRepository(getTestDb().db);
  for (let i = 1; i <= n; i++) {
    await photos.create({
      itemId: null, collectionId: ref.collectionId, blobKey: "e2e-placeholder",
      filename: `shelf-photo-${i}.jpg`, mimeType: "image/jpeg", fileSize: 1, uploadedBy: owner, isHero: false,
    });
  }
  return ref;
}
```

  Then add the test after "phone: the bar is pinned to the bottom and never hides the last row":

```ts
test("pool: the selection bar is pinned at phone and tablet widths and never hides the last tile or the footer", async ({ page }) => {
  // Viewport-sensitive: unlike ActionBar this bar stays fixed on tablet, so both sizes run here in CI.
  for (const size of [PHONE, { width: 1080, height: 810 }]) {
    await page.setViewportSize(size);
    await page.goto(`/collections/${pool.slug}/pool`);
    await page.getByRole("button", { name: "shelf photo 1", exact: true }).click();
    await page.getByRole("button", { name: "shelf photo 2", exact: true }).click();
    const bar = page.getByRole("region", { name: "Grouping actions" });
    await expect(bar).toBeVisible();
    expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("fixed");
    const pinned = async () => {
      const box = (await bar.boundingBox())!;
      expect(Math.round(box.y + box.height)).toBe(size.height);
      return box;
    };
    // A focused tile scrolls clear of the bar: the scroll padding matches the reserve.
    expect(await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom)).toBe(
      size === PHONE ? "224px" : "144px",
    );

    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const barBox = await pinned();
    const last = page.getByRole("button", { name: "shelf photo 12", exact: true });
    await expect(last).toBeInViewport();
    expect(((await last.boundingBox())!.y + (await last.boundingBox())!.height)).toBeLessThanOrEqual(barBox.y);
    const footer = (await page.getByText("Find the things you love").boundingBox())!;
    expect(footer.y + footer.height).toBeLessThanOrEqual(barBox.y);

    // The Move to… chooser grows the bar upward; the bar stays on the bottom edge.
    await bar.getByRole("button", { name: "Move to…" }).click();
    await expect(bar.getByRole("button", { name: "New item" })).toBeVisible();
    await pinned();
    await page.keyboard.press("Escape");
  }

  // Short (browser zoom): the bar goes static and nothing is reserved.
  await page.setViewportSize({ width: PHONE.width, height: 480 });
  const bar = page.getByRole("region", { name: "Grouping actions" });
  expect(await bar.evaluate((el) => getComputedStyle(el).position)).toBe("static");
  expect(["0px", "auto"]).toContain(
    await page.evaluate(() => getComputedStyle(document.documentElement).scrollPaddingBottom),
  );
});
```

- [ ] **Step 2: Run it and see it fail.**
  `npx playwright test e2e/lists-and-home.spec.ts -g "pool: the selection bar" --project=tablet`.
  Expected: FAIL at the scroll-padding assertion (`0px`/`auto`, not `224px`). Footer overlap would
  be next.

- [ ] **Step 3: Reserve the bar's height** in `src/app/globals.css`, right after the existing
  `html:has([data-action-bar])` block. Arithmetic: the phone bar is py-3 (24) + the count row (24) +
  gap-3 (12) + a 2×2 button grid (44 + 8 + 44) = 156px. The over-cap line adds about 60px
  (≤ 224 = 14rem). From `sm` it is a hint line (24) + one button row (44) + py-3 (24) = 92px, plus
  the over-cap line about 44px (≤ 144 = 9rem).

```css
/* PoolActionBar (the pool's selection bar) is fixed at EVERY width while photos are selected —
   unlike ActionBar it never becomes an inline row — and on phone it carries a count row and a
   2×2 button grid (plus the over-cap line when shown). Reserve that height below the page's end
   and as scroll padding so the last tile, the footer and a focused tile clear it. A short
   viewport (browser zoom) keeps the bar static, so nothing is reserved. */
@media (min-height: 501px) {
  html:has([data-selection-bar]) {
    scroll-padding-bottom: 14rem;
  }
  [data-app-shell]:has([data-selection-bar]) {
    padding-bottom: 14rem;
  }
}
@media (width >= 40rem) and (min-height: 501px) {
  html:has([data-selection-bar]) {
    scroll-padding-bottom: 9rem;
  }
  [data-app-shell]:has([data-selection-bar]) {
    padding-bottom: 9rem;
  }
}
```

- [ ] **Step 4: Mark the shell.** In `src/components/layout/AppLayout.tsx`, add `data-app-shell` to
  the root `<div>` (the one with `flex min-h-screen flex-col bg-ground …`). Nothing else changes.

- [ ] **Step 5: Restyle the bar.** In `src/features/pool/PoolActionBar.tsx`, replace the region's
  `<div className=… role="region" aria-label="Grouping actions">` opening tag with:

```tsx
      {/* The PR 3 bottom-bar surface (ActionBar): glass-strong + blur + lift + hairline edge,
          z-30 under the z-40 header. Fixed at every width (a selection follows the person
          through a long grid); static on a short viewport. No mb-0: it is the last child of
          PoolPhotoGrid's space-y-4, which gets no margin. No safe-area padding: the root viewport
          is not viewportFit "cover", so the inset is always 0. globals.css reserves its
          height via data-selection-bar. */}
      <div
        data-selection-bar
        className="fixed inset-x-0 bottom-0 z-30 border-t border-hairline bg-glass-strong px-4 py-3 shadow-lift backdrop-blur-md [@media(max-height:500px)]:static"
        role="region"
        aria-label="Grouping actions"
      >
```

  In `src/features/pool/PoolPhotoGrid.tsx`, delete the spacer line
  `{selected.length > 0 && <div aria-hidden className="h-20" />}`.

- [ ] **Step 6: Run and see it pass.** Run the Step 2 command again and expect PASS. Then run
  `npx vitest run src/features/pool src/components/layout` and expect PASS (no unit test pins the
  old classes; `PoolActionBar.test.tsx:125` checks only the hint's `hidden sm:block`).

- [ ] **Step 7: Add a screenshot beat** for the bar. In `e2e/screenshots/capture.ts`, insert this
  after PR 4's `if (!only || only.includes("result-revision-note")) { … }` block and before
  `if (only && !only.includes("item-delete-confirm")) return;`:

```ts
    // UX redesign PR 5: the pool's selection bar (fixed at every width). Viewport-only shot:
    // a full-page capture paints a fixed bar at the fold (memory phone-fullpage-capture-fixed-bar-artifact).
    if (!only || only.includes("pool-selected")) {
      await page.goto(`/collections/${workspacePoolFirstSlug}/pool`);
      await page.getByRole("img").first().waitFor({ state: "visible", timeout: 10_000 }).catch(() => {});
      await page.getByRole("button", { name: "pool 1", exact: true }).click();
      await page.getByRole("button", { name: "pool 2", exact: true }).click();
      await page.waitForTimeout(400);
      await page.screenshot({ path: `pr-screenshots/pool-selected-${theme}-${proj}.png` });
    }
```

  (`seedWorkspaceStates` names the pool-only photos `pool-1.jpg`/`pool-2.jpg`; the tile's name is
  the alt `pool 1`.)

- [ ] **Step 8: Commit.**

```bash
git add src/features/pool/PoolActionBar.tsx src/features/pool/PoolPhotoGrid.tsx src/components/layout/AppLayout.tsx \
  src/app/globals.css e2e/lists-and-home.spec.ts e2e/screenshots/capture.ts
git commit -m "fix(pool): the selection bar takes the ActionBar surface and reserves its height (purses-w7ss.13)"
```

---

## Task 3: Archived item card — Bring back as a secondary pill (`purses-w7ss.17`)

**Files:** `src/features/sorting/AsyncActionButton.tsx`, `src/features/items/BringBackButton.tsx`,
`e2e/lists-and-home.spec.ts`.

**Interfaces:**
- Consumes: `seedJourneyScenario` (returns `itemIds`) and `ItemRepository.softDelete`, both
  existing.
- Produces: `AsyncActionButton` `variant?: "primary" | "secondary" | "ghost"`.

- [ ] **Step 1: Write the failing e2e** in `e2e/lists-and-home.spec.ts`. Add the import
  `import { ItemRepository } from "@/server/repositories/implementations/ItemRepository";` and the
  declaration `let archivedHome: string;`. In `beforeAll` add:

```ts
  const withArchived = await seedJourneyScenario(ownerId, 2);
  await new ItemRepository(getTestDb().db).softDelete(withArchived.itemIds[0]);
  archivedHome = `/collections/${withArchived.slug}?status=archived`;
```

  Then add the test:

```ts
test("phone: an archived card's Bring back lines up with the name and fits the card, idle and busy", async ({ page }) => {
  // Viewport-sensitive: a 390px two-column card is the narrowest column the pill must fit.
  await page.setViewportSize(PHONE);
  await page.goto(archivedHome);
  const tile = page.getByRole("list", { name: "Your items" }).getByRole("listitem").first();
  const name = (await tile.getByRole("heading").boundingBox())!;
  const cardBox = (await tile.boundingBox())!;
  const fits = async (label: RegExp) => {
    const pill = tile.getByRole("button", { name: label });
    const box = (await pill.boundingBox())!;
    expect(Math.abs(box.x - name.x)).toBeLessThanOrEqual(1); // the pill's edge is the name's edge
    expect(box.x + box.width).toBeLessThanOrEqual(cardBox.x + cardBox.width - 12); // inside p-3
    expect(box.height).toBeGreaterThanOrEqual(44);
    // The label never spills sideways or downward, and stays on one line.
    expect(
      await pill.evaluate((el) => {
        const line = document.createRange();
        line.selectNodeContents(el);
        return el.scrollWidth <= el.clientWidth && el.scrollHeight <= el.clientHeight && line.getClientRects().length === 1;
      }),
    ).toBe(true);
  };
  await fits(/^Bring back$/);
  // Hold the restore open so the busy label can be measured.
  await page.route("**/api/items/*/restore", () => {});
  await tile.getByRole("button", { name: /^Bring back$/ }).click();
  await fits(/^One moment…$/);
});
```

- [ ] **Step 2: Run it and see it fail.**
  `npx playwright test e2e/lists-and-home.spec.ts -g "archived card's Bring back" --project=tablet`.
  Expected: FAIL at the busy step. The busy button is named "Bringing it back…", so
  `getByRole("button", { name: /^One moment…$/ })` finds nothing and `boundingBox()` times out
  (the `!` then throws). The idle step should pass (the ghost button's box already starts at the
  name's edge; only its text is inset); if it fails, note which assertion in the ledger.

- [ ] **Step 3: Implement.** In `src/features/sorting/AsyncActionButton.tsx`, widen the prop:

```tsx
  variant?: "primary" | "secondary" | "ghost";
```

  `src/features/items/BringBackButton.tsx`:

```tsx
export function BringBackButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  // A bordered secondary pill: its visible edge lines up with the card's name column (p-3)
  // where a ghost's text sat 16px inset; "One moment…" fits a 390px two-column card on one line.
  return (
    <AsyncActionButton
      label="Bring back"
      busyLabel="One moment…"
      variant="secondary"
      action={async () => {
        const res = await fetch(`/api/items/${itemId}/restore`, { method: "POST" });
        if (!res.ok) throw new Error("restore failed");
        router.refresh();
      }}
    />
  );
}
```

- [ ] **Step 4: Run and see it pass.** Run the Step 2 command again and expect PASS. Then run
  `npx vitest run src/features/sorting/AsyncActionButton.test.tsx src/features/items` and expect
  PASS. "One moment…" is a controller ruling and already on the owner-veto list. If even it spills
  at 390px, stop and report the measured widths; do not shrink the type.

- [ ] **Step 5: Commit.**

```bash
git add src/features/sorting/AsyncActionButton.tsx src/features/items/BringBackButton.tsx e2e/lists-and-home.spec.ts
git commit -m "fix(items): archived card's Bring back is a secondary pill that fits the card (purses-w7ss.17)"
```

---

## Task 4: PR 2 residuals A — Ranking on phone, replay pins, dead CI paths (`purses-w7ss.11`)

**Files:** `src/features/results/RankingList.tsx`, `e2e/sort-journey.spec.ts`,
`src/lib/db/ranking-save-route.integration.test.ts`, `scripts/ci-e2e-map.test.ts`,
`.github/workflows/ci.yml`, `e2e/screenshots/capture.ts`.

**Interfaces:** none new.

- [ ] **Step 1: Failing e2e (UX4 + the phone ordinal).** In `e2e/sort-journey.spec.ts`, replace:

```ts
    // A pinned row keeps its name readable at this width (phone included): it wraps, never clips.
    expect(await rows.first().getByRole("link").evaluate((el) => el.scrollHeight <= el.clientHeight && el.clientWidth > 80)).toBe(true);
```

  with:

```ts
    // A pinned row on a phone keeps a small ordinal and a readable name: it wraps, never clips
    // or scrolls sideways. (Viewport-sensitive; runs in CI's tablet project at iPhone width.)
    const tablet = page.viewportSize()!;
    await page.setViewportSize({ width: 390, height: 664 });
    expect(
      await rows.first().getByRole("link").evaluate(
        (el) => el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth && el.clientWidth > 80,
      ),
    ).toBe(true);
    await expect(rows.first().getByText("1", { exact: true })).toBeVisible();
    await page.setViewportSize(tablet);
```

- [ ] **Step 2: Run it and see it fail.**
  `npx playwright test e2e/sort-journey.spec.ts --project=tablet`. Expected: FAIL at the ordinal's
  `toBeVisible`, because it is `hidden` below `sm`.

- [ ] **Step 3: Implement in `RankingList.tsx`.**
  - Ordinal: replace
    `<span className="hidden w-6 shrink-0 text-center text-sm text-ink-soft sm:block">{i + 1}</span>`
    with `<span className="w-5 shrink-0 text-center text-xs text-ink-soft sm:w-6 sm:text-sm">{i + 1}</span>`.
    Update the comment above the grip to: `{/* Phone: the grip gives way (drag is a tablet nicety); a small ordinal stays. */}`.
  - Phone Unpin: the word at every width (spec §4 "a small Unpin"; controller ruling). In the
    Unpin button, change the className's `min-w-11 … sm:px-3` padding to `min-w-11 px-2 … sm:px-3`
    (it already has `text-sm`), delete the comment and the `<svg>`, and replace
    `<span className="hidden sm:inline">Unpin</span>` with plain `Unpin`. The accessible name stays
    `Unpin ${row.name}`. The e2e's name-width floor (`clientWidth > 80`) is what proves the word
    leaves the name room on a 390px row; keep it.

- [ ] **Step 4: Run and see it pass.** Run the Step 2 command again and expect PASS; then
  `npx vitest run src/features/results/RankingList.test.tsx` and expect PASS. The word needs no
  unit test (its accessible name is already pinned); the phone `ranking` screenshot shows it
  (Task 15, Step 8).

- [ ] **Step 5: The replay DB test seeds a pin.** In
  `src/lib/db/ranking-save-route.integration.test.ts`, replace the test "a retry with the same key
  returns the same link and creates nothing new" with:

```ts
  it("a retry with the same key returns the same link and creates nothing new — pins and the carried draft included", async () => {
    const { db } = getTestDb();
    const s = await seedSorting();
    const service = SortResultService.fromDb(db);
    await service.pinItem(s.collectionId, ownerId, s.a, 1);
    const first = await (await save(saveReq({ name: "Once", saveKey: KEY }), ctx(s.collectionId))).json();
    const again = await save(saveReq({ name: "Once", saveKey: KEY }), ctx(s.collectionId));
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual(first);
    const results = await new SortResultRepository(db).findByCollection(s.collectionId);
    expect(results.map((r) => r.status).sort()).toEqual(["draft", "finalized"]); // one saved, one draft carrying the pin
    const finalized = results.find((r) => r.status === "finalized")!;
    expect(await new SortResultShareRepository(db).findByResult(finalized.id)).toHaveLength(1);
    expect((await service.listPins(s.collectionId, ownerId)).map((p) => [p.itemId, p.position])).toEqual([[s.a, 1]]);
  });
```

  Run `npm run test:db -- src/lib/db/ranking-save-route.integration.test.ts`. (`run-db-tests.sh`
  forwards the path but after its own `src/lib/db` filter, and vitest ORs filters, so this runs
  every DB file. That is fine.) This adds coverage, so it may pass on the first run.
  If it fails, that is a real replay bug: stop and use `superpowers:systematic-debugging` before
  touching `SortResultService.saveAndShare`.

- [ ] **Step 6: Failing CI-path test.** Append to `scripts/ci-e2e-map.test.ts`. Add `globSync`
  to the existing `node:fs` import (Node ≥ 22 has `fs.globSync`; CI and `engines` are Node 24),
  then add:

```ts
describe("ci.yml changes filters", () => {
  // A filter pattern that matches nothing silently selects nothing (e.g. a renamed lib file
  // drops its e2e area). Every pattern must match at least one path in the repo.
  const repoRoot = new URL("../", import.meta.url).pathname;
  const filters = ci.slice(ci.indexOf("filters: |"), ci.indexOf("\n  e2e:"));
  const paths = [...filters.matchAll(/^\s+- '([^']+)'$/gm)].map((m) => m[1]);
  it("finds the filter list", () => {
    expect(paths.length).toBeGreaterThan(20);
  });
  it("every pattern matches at least one path", () => {
    // Root extension catch-alls ('*.js' under code:) guard future root configs; they may match nothing.
    const rootCatchAll = /^\*\.[a-z]+$/;
    const missing = paths.filter((p) => !rootCatchAll.test(p) && globSync(p, { cwd: repoRoot }).length === 0);
    expect(missing).toEqual([]);
  });
});
```

  Run `npx vitest run scripts/ci-e2e-map.test.ts`. Expected: FAIL with
  `["src/hooks/**", "tailwind.config.ts", "tailwind.config.ts", "src/lib/pairwise-selection.ts"]`
  (checked at plan time; without the exemption `*.js` would be a fifth).

- [ ] **Step 7: Drop the dead paths** from `.github/workflows/ci.yml`: the `'src/hooks/**'` line
  (under `ui:`), both `'tailwind.config.ts'` lines (under `ui:` and `broad:`), and
  `'src/lib/pairwise-selection.ts'` (under `sort:`). Run the Step 6 command again and expect PASS.

- [ ] **Step 8: Screenshot seed for a pinned row.** In `e2e/screenshots/capture.ts` `beforeAll`,
  change `({ slug, finalizedResultNumber } = await seedSortScenario(ownerId));` to:

```ts
  const sorted = await seedSortScenario(ownerId);
  ({ slug, finalizedResultNumber } = sorted);
  // UX redesign PR 5: one hand-placed piece, so the ranking shot shows Unpin (the word, at phone width too).
  await SortResultService.fromDb(getTestDb().db).pinItem(sorted.collectionId, ownerId, sorted.itemIds[1], 1);
```

  Add `import { SortResultService } from "@/server/services/SortResultService";`. This pin also
  feeds PR 4's `result-revision-note` beat (same `slug`). The beat finds an `Unpin` button and
  skips its own Move-down pin. The seeded pin (`itemIds[1]` to slot 1, `manualRank` 0, saved slot
  1) is off its saved slot, so `pinsLostToRevision` is 1 and the note still opens. Do not pin
  `itemIds[0]` at slot 1: that sits on its saved slot, and the beat would time out. Also add a
  second photo to the story item, so the `item-detail-story` shot shows the carousel dots from
  Task 1. After the `story` update, add:

```ts
  await new PhotoRepository(db).create({
    itemId: waiting.itemIds[0], collectionId: waiting.collectionId, blobKey: "e2e-placeholder",
    filename: "second-look.jpg", mimeType: "image/jpeg", fileSize: 1, uploadedBy: ownerId, isHero: false,
  });
```

  Add `import { PhotoRepository } from "@/server/repositories/implementations/PhotoRepository";`.

- [ ] **Step 9: Commit.**

```bash
git add src/features/results/RankingList.tsx e2e/sort-journey.spec.ts src/lib/db/ranking-save-route.integration.test.ts \
  scripts/ci-e2e-map.test.ts .github/workflows/ci.yml e2e/screenshots/capture.ts
git commit -m "fix(sort): phone ordinal and Unpin word, replay keeps pins, dead CI filter paths (purses-w7ss.11)"
```

---

## Task 5: PR 2 residuals B — sticky notices, hold after 409, sign-in mid-round (`purses-w7ss.11`)

Run as two commits, each with its own review: **5a** (engine + gate + hold: Steps 1–8) and **5b**
(Sign in / Reload, the always-mounted region, per-session filtering: Steps 9–11). 5b depends on 5a.

**Files:** `src/features/sorting/decisionFlusher.ts` (+ test), `src/features/sorting/CompareChoice.tsx`
(+ test), `src/features/sorting/pendingNotices.tsx` (+ test), `src/features/sorting/PendingDecisionsGate.tsx`
(+ test), `src/features/sorting/TriageRound.tsx` (+ test), `src/app/collections/[id]/results/page.tsx`,
`src/app/collections/[id]/sort/page.tsx` (passes `sessionId`; adds a `PendingNotices` only to a
gated phase that lacks one).

**Interfaces:**
- Produces (5a): the `session_conflict` variant of `FlushNotice` gains `sessionId: string`.
  `subscribeNotices(fn)` replays the engine's current notices to `fn` on subscribe, then streams new
  ones. `export function dismissNotice(kind: FlushNotice["kind"]): void`.
- Produces (5a): `export const AUTH_REQUIRED_NOTICE = "Sign in again and your answers will finish saving on their own";`
  in `pendingNotices.tsx` (the gate's words, moved), voiced by `PendingNotices`. `GATE_SIGNIN_LINE`
  is removed from `PendingDecisionsGate.tsx`.
- Produces (5b): `PendingNotices({ sessionId?: string })`; the Sign in link, Reload, and the
  always-mounted region.

### 5a — engine, gate, hold

- [ ] **Step 1: Failing engine test** in `decisionFlusher.test.ts` (it already `vi.resetModules()`s
  per test, so engine state starts empty):

```ts
describe("notices are sticky (a surface that mounts later still hears them)", () => {
  it("a late subscriber receives the current notice; dismissNotice clears it; a later 2xx clears auth_required", async () => {
    // 401 on the first drain → auth_required stands.
    // subscribe AFTER the drain → the subscriber receives { kind: "auth_required" } once.
    // dismissNotice("auth_required") → a fresh subscriber receives nothing.
    // Re-raise with another 401, then a drain that acks 2xx → a fresh subscriber receives nothing.
  });
});
```

  Write the body with the file's existing enqueue/drain/`jsonRes` helpers; the comments are the
  assertions.

- [ ] **Step 2: Failing tests, hold after 409** in `CompareChoice.test.tsx`, after "a sort closed
  elsewhere (409) never leaves the 'it's safe' line standing":

```ts
  it("after a sort closed elsewhere (409) the controls hold: further taps queue nothing", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })));
    renderChoice();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Choose Bag A" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(COMPARE_ACK_BOUND_MS);
    });
    vi.mocked(queue.enqueue).mockClear();
    const b = screen.getByRole("button", { name: "Choose Bag B" });
    expect(b).toHaveAttribute("aria-disabled", "true");
    await act(async () => {
      fireEvent.click(b);
      fireEvent.click(screen.getByRole("button", { name: "Tie" }));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(vi.mocked(queue.enqueue)).not.toHaveBeenCalled();
  });

  it("an answer that settled before the 409 cannot be undone once the sort is closed elsewhere", async () => {
    // Tap A → 2xx ack (Undo: … appears). Re-render with the next pair, tap → 409.
    // Tap "Undo: …" → the pair is NOT re-presented (no "Keep going"), nothing is enqueued.
  });
```

  Fill the second body from the existing "Undo names the last answer…" test's ack setup plus the
  409 stub above.

- [ ] **Step 3: Gate test** in `PendingDecisionsGate.test.tsx`. Add `usePathname: () => "/collections/c1/sort"`
  to the `next/navigation` mock. Change `gate()` so the children include a real `<PendingNotices />`
  (as the sort page and `TriageRound` do):
  `<PendingNotices /><div data-testid="content">the surface</div>`. Import `PendingNotices` and
  `AUTH_REQUIRED_NOTICE` from `./pendingNotices` (dropping `GATE_SIGNIN_LINE`) and `dismissNotice`
  from `./decisionFlusher`, and in `afterEach` call `dismissNotice` for every kind (engine state is
  module-level here; without this a 401 test leaks a sticky `auth_required` into the next test).
  Rewrite the 401 test's assertions:

```ts
    await waitFor(() => expect(screen.getByTestId("content")).toBeInTheDocument());
    expect(screen.getAllByText(AUTH_REQUIRED_NOTICE)).toHaveLength(1);
    // A second 401 after reveal still shows ONE line.
    await act(async () => {
      await triggerFlush(key);
    });
    expect(screen.getAllByText(AUTH_REQUIRED_NOTICE)).toHaveLength(1);
    expect(readQueue(key)).toHaveLength(1); // preserved across re-login
    expect(refresh).not.toHaveBeenCalled();
```

  (Drop its `href="/login"` assertion here; 5b pins the link in `pendingNotices.test.tsx`.)

- [ ] **Step 4: Run and see them fail.**
  `npx vitest run src/features/sorting/decisionFlusher.test.ts src/features/sorting/CompareChoice.test.tsx src/features/sorting/PendingDecisionsGate.test.tsx`.
  Expected: FAIL. The late subscriber hears nothing (`dismissNotice` is not exported); the hold
  tests (`aria-disabled` absent, `enqueue` called, Undo re-presents the pair); the gate test cannot
  import `AUTH_REQUIRED_NOTICE` yet (and, once it can, a non-sticky engine shows the line zero
  times after reveal).

- [ ] **Step 5: Implement the engine** in `decisionFlusher.ts`:
  - Keep `const currentNotices = new Map<FlushNotice["kind"], FlushNotice>();`. `emitNotice` sets
    `currentNotices.set(notice.kind, notice)` before the fan-out.
  - `subscribeNotices(fn)`: add `fn`, then call `fn(n)` for each current notice; return the same
    unsubscribe.
  - `export function dismissNotice(kind) { currentNotices.delete(kind); }`.
  - Resolution: on any 2xx batch/disposition response (`res.ok` at the decision and disposition
    paths), `currentNotices.delete("auth_required")`.
  - The 409 emit becomes `emitNotice({ kind: "session_conflict", sessionId: key.sessionId })`.
  - Header comment: notices are sticky per tab until dismissed or resolved; a reload clears them.

- [ ] **Step 6: Implement the hold** in `CompareChoice.tsx`:
  - In the `subscribeNotices` callback, ignore another session's conflict:
    `if (notice.kind !== "session_conflict" || (submit.kind === "session" && notice.sessionId !== submit.sessionId)) return;`
    (a sticky conflict from an earlier sort in the same tab must never hold a new one).
  - `const busy = pending !== null || undefined;` → `const busy = pending !== null || closedElsewhere || undefined;`
  - In `choose`, `if (pendingRef.current) return;` →
    `if (pendingRef.current || closedElsewhere) return; // closed elsewhere: nothing more can land`
  - In the Undo/Keep going `onClick`, `if (pendingRef.current) return;` →
    `if (pendingRef.current || closedElsewhere) return;`

- [ ] **Step 7: The gate's notices stop at reveal; one tree shape.** In `PendingDecisionsGate.tsx`,
  delete the `GATE_SIGNIN_LINE` export and the `{authRequired && (<p …>)}` block. In
  `pendingNotices.tsx`, add `AUTH_REQUIRED_NOTICE` (same words) after `SESSION_CONFLICT_NOTICE`
  and `auth_required: AUTH_REQUIRED_NOTICE` to `NOTICE_COPY` (5b adds its Sign in link). Replace the
  gate's two returns with one fixed shape:

```tsx
  return (
    <>
      {recovering && (
        <div className="mx-auto max-w-xl space-y-2 empty:hidden">
          {/* Before reveal the gate is the only voice; after it, the surface's own single
              PendingNotices speaks (it reads the engine's sticky notices on mount), so the
              line can never be doubled. */}
          {!revealed && <PendingNotices />}
          {revealed && !drained && (
            <p role="status" className="rounded-control bg-content-soft px-4 py-3 text-sm text-ink-soft">
              {GATE_CATCHUP_LINE}
            </p>
          )}
        </div>
      )}
      {revealed ? children : (
        <p role="status" className="mx-auto max-w-xl text-sm text-ink-soft">
          {GATE_WAITING_LINE}
        </p>
      )}
    </>
  );
```

  Keep the `authRequired` state (it drives `revealed` and skips the refresh). Remove the `Link`
  import if unused. Every surface the gate reveals must render exactly one `PendingNotices`: the
  sort page's pairs phase and `TriageRound` already do; add one at the top of the results page's
  gate children (`src/app/collections/[id]/results/page.tsx`); check the sort page's other phases
  and add one only where a phase has none.

- [ ] **Step 8: Run, see 5a pass, commit.** Run the Step 4 command, then
  `npx vitest run src/features/sorting src/app/collections`, and expect PASS. Commit 5a:

```bash
git add src/features/sorting/decisionFlusher.ts src/features/sorting/decisionFlusher.test.ts \
  src/features/sorting/CompareChoice.tsx src/features/sorting/CompareChoice.test.tsx \
  src/features/sorting/pendingNotices.tsx src/features/sorting/PendingDecisionsGate.tsx \
  src/features/sorting/PendingDecisionsGate.test.tsx "src/app/collections/[id]/results/page.tsx"
git commit -m "fix(sort): sticky notices; the gate voices them only until reveal; hold compare after a 409 (purses-w7ss.11)"
```

### 5b — copy, Sign in, Reload, one live region

- [ ] **Step 9: Failing tests** in `pendingNotices.test.tsx`. Add `usePathname: () => "/collections/c1/sort"`
  to the `next/navigation` mock; add `AUTH_REQUIRED_NOTICE` to the import and to the TONE loop.
  Fold the live-region assertions into the existing "a mid-round 409 says the sort was wrapped up
  elsewhere" test (no near-twin):

```ts
    render(<PendingNotices />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement(); // mounted empty BEFORE the notice (SC 4.1.3)
    // …enqueue + drain as today…
    expect(region).toHaveTextContent(SESSION_CONFLICT_NOTICE); // the same node, now with text
    expect(screen.getByRole("button", { name: "Reload" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Okay" })).not.toBeInTheDocument();
```

  Add:

```ts
describe("PendingNotices — signed out mid-round", () => {
  it("a 401 says to sign in again, with a Sign in link back to this page, and no Okay", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 401, json: async () => ({}) })) as unknown as typeof fetch;
    render(<PendingNotices />);
    await enqueue(key, {
      kind: "decision", clientKey: newClientKey(), type: "triage",
      decision: { itemId: realItemId(), result: "top" }, enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    expect(screen.getByText(AUTH_REQUIRED_NOTICE)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute(
      "href",
      `/login?callbackUrl=${encodeURIComponent("/collections/c1/sort")}`,
    );
    expect(screen.queryByRole("button", { name: "Okay" })).not.toBeInTheDocument(); // signing in is the action
  });
});
```

  Add `dismissNotice` for every kind to the file's `beforeEach` (sticky engine state). In
  `TriageRound.test.tsx:89` and `:92`, scope both
  `getByRole("status")` queries to the answer announcer (e.g. `within(<the DecisionControls
  container>)`): `TriageRound` now has two `status` regions (its `PendingNotices` is always
  mounted).

- [ ] **Step 10: Implement** in `pendingNotices.tsx`:
  - `import Link from "next/link"; import { usePathname } from "next/navigation";`
    `import { quietLink } from "@/lib/design/quiet-link";`
    and `dismissNotice` from `./decisionFlusher`.
  - `PendingNotices({ sessionId }: { sessionId?: string } = {})`: the subscriber skips a
    `session_conflict` whose `sessionId` differs from a given `sessionId` (the sort page and
    `TriageRound` pass theirs).
  - Okay → `dismissNotice(kind)` plus the local hide. Render:

```tsx
  // ONE region, mounted empty, so a line that lands is announced (a live region that appears
  // with its text is not). aria-atomic=false: only the new line is read, not the whole set.
  return (
    <div role="status" aria-live="polite" aria-atomic="false" className="space-y-2 empty:mb-0">
      {visible.map((kind) => (
        <p key={kind} className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-control bg-content-soft px-4 py-2 text-sm text-ink-soft">
          <span>{NOTICE_COPY[kind]}</span>
          {kind === "auth_required" ? (
            <Link href={`/login?callbackUrl=${encodeURIComponent(pathname ?? "/")}`} className={quietLink}>
              Sign in
            </Link>
          ) : kind === "session_conflict" ? (
            <button type="button" onClick={() => location.reload()} className={quietLink}>
              Reload
            </button>
          ) : (
            <button type="button" onClick={() => dismiss(kind)} className={quietLink}>
              Okay
            </button>
          )}
        </p>
      ))}
    </div>
  );
```

  (`callbackUrl` follows `src/proxy.ts`, which sets the pathname. All three actions use
  `quietLink`, which carries `min-h-11`, so each target is ≥ 44px; `Button size="sm"` is only h-9.)
  - Doc comment, first line: "The quiet person-side notice slot (one always-mounted live region),
    fed by the engine's sticky notices: …". Note `auth_required` (Sign in, not dismissible) and
    `session_conflict` (Reload).
  - Pass `sessionId` to the `PendingNotices` in `TriageRound.tsx` and the sort page's pairs phase.

- [ ] **Step 11: Run, see it pass, commit.** `npx vitest run src/features/sorting src/app/collections`
  → PASS. If another test now hits two `status` nodes through a bare `getByRole("status")`, scope
  that query and list it in the commit body.

```bash
git add src/features/sorting/pendingNotices.tsx src/features/sorting/pendingNotices.test.tsx \
  src/features/sorting/TriageRound.tsx src/features/sorting/TriageRound.test.tsx \
  "src/app/collections/[id]/sort/page.tsx"
git commit -m "fix(sort): one live notice region; Sign in back to the round; Reload after a sort closed elsewhere (purses-w7ss.11)"
```

---

## Task 6: Dead `session` arms and `getDraftResult` (`purses-w7ss.9`, part A)

**Files:** `src/features/sorting/DecisionControls.tsx` (+ test), `src/features/sorting/DeferControl.tsx`
(+ test), `src/features/sorting/SetAsideButton.tsx`, `src/features/sorting/SetAsideUndo.test.tsx`,
`src/features/sorting/TriageUndoProvider.tsx`, `src/features/sorting/TriageRound.tsx`,
`src/features/onboarding/WelcomeTriage.tsx`, `src/server/services/SortResultService.ts`.

**Interfaces:**
- Produces:
  `DecisionControls<D>({ onDecision: (d: D) => void | boolean | Promise<void | boolean>; decisions: Array<{ label: string; decision: D }>; priorAnswer?: string })`;
  `DeferControl({ onDecision: () => void })`;
  `SetAsideButton({ onDecision: () => void })`.
  `TriageUndoContextValue` loses `defer`.

- [ ] **Step 1: Prove the arms are dead.** Run
  `grep -rn 'kind: "session"' src e2e --include='*.tsx' --include='*.ts' | grep -v '\.test\.'`.
  Expected: only `src/app/collections/[id]/sort/page.tsx` (CompareChoice's own `submit`) and the
  type lines in `CompareChoice.tsx`, `DecisionControls.tsx`, `DeferControl.tsx` and
  `SetAsideButton.tsx`. Then run `grep -rn "getDraftResult\|\.defer(" src e2e scripts`. Expected:
  the `getDraftResult` definition and `DeferControl.tsx`'s `ctx.defer` only. Any other hit means
  stop: that arm is live.

- [ ] **Step 2: Rewrite the tests first.**
  - `DecisionControls.test.tsx`: delete the `next/navigation` mock, the `fetch` stubs, and every
    test that exercises the session path: "tapping a tier POSTs…", "a different tier sends…",
    "refreshes the route…", "re-enables the tiers after a successful save…",
    "calls onDecisionMade…", "surfaces a gentle error…", and "does not refresh the router in local
    mode". In the remaining tests, replace `submit={{ kind: "session", sessionId: "sess_1" }}` /
    `submit={{ kind: "local", onDecision… }}` with `onDecision={vi.fn()}` / `onDecision={onDecision}`,
    and drop `type="triage"`. Rename `describe("local mode")` to `describe("answering")`, and in its
    test delete the `fetchSpy` lines. Add:

```ts
  it("an answer that did not hold (onDecision → false) is not announced as saved", async () => {
    render(<DecisionControls onDecision={() => false} decisions={TRIAGE_DECISIONS} />);
    await userEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(screen.getByRole("status")).toBeEmptyDOMElement();
  });
```

  - `DeferControl.test.tsx`: delete the session `describe`, `SessionHarness`, the flusher/queue
    mocks, `installStorage`, `beforeEach` and the provider import. Keep two tests, rendered as
    `<DeferControl onDecision={onDecision} />`: "a tap calls onDecision once" (only that assert;
    the old no-fetch / empty-queue / enabled / label asserts can no longer fail once the component
    has no fetch or queue code, so they go), and the existing "conveys 'Keeps it for later' for
    hover and assistive tech without shouting it visually" (`DeferControl.test.tsx:83`), rendered
    as `<DeferControl onDecision={vi.fn()} />` instead of `<SessionHarness />`. Delete its
    local-mode twin "local mode renders the same visual button (title + aria-label) as session
    mode" (`:155`).
  - `SetAsideUndo.test.tsx`: replace the `SetAsideButton` import with
    `import { useTriageUndo } from "./TriageUndoProvider";` (merge it into the existing provider
    import). Add the consumer below the imports:

```tsx
// The live caller is TriageRound's Not mine (undoCtx.setAside); this stands in for it.
function NotMineTap({ itemId, itemName }: { itemId: string; itemName: string | null }) {
  const { setAside } = useTriageUndo();
  return <button type="button" aria-label="Not mine — sets it aside" onClick={() => void setAside(itemId, itemName)}>Not mine</button>;
}
```

    In `Harness`, use `{item && <NotMineTap itemId={itemId} itemName={itemName} />}`. Delete the
    test "local mode renders WITHOUT a TriageUndoProvider…" with no replacement: `SetAsideButton`
    is now a plain `onDecision` button, and `TriageRound.test.tsx`'s "Not yet and Not mine" tests
    already tap it through the real round.

- [ ] **Step 3: Run and see them fail.**
  `npx vitest run src/features/sorting/DecisionControls.test.tsx src/features/sorting/DeferControl.test.tsx src/features/sorting/SetAsideUndo.test.tsx`.
  Expected: FAIL. TypeScript/props mismatch: `onDecision` is not a prop yet, and `SetAsideButton`
  still needs `submit`/`itemId`.

- [ ] **Step 4: Implement.**
  - `DecisionControls.tsx`, whole file:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui";

// Generic over the decision shape D so a caller's narrowed decision type reaches onDecision.
interface DecisionControlsProps<D extends Record<string, unknown> = Record<string, unknown>> {
  /** Records the answer. Return false (or a promise of it) when it did not hold, so "saved" is never said too early. */
  onDecision: (decision: D) => void | boolean | Promise<void | boolean>;
  decisions: Array<{ label: string; decision: D }>;
  /**
   * A decision label already standing for this item (undo-as-revisit, F19): that tier renders
   * as currently selected (`aria-pressed` + a visible ring); the caller renders the
   * "You placed this with … — change it?" line.
   */
  priorAnswer?: string;
}

export function DecisionControls<D extends Record<string, unknown> = Record<string, unknown>>({
  onDecision,
  decisions,
  priorAnswer,
}: DecisionControlsProps<D>) {
  // Mounted (empty) on first render so the region exists BEFORE its text ever
  // changes — a live region that appears with its content is not announced.
  const [announcement, setAnnouncement] = useState("");

  // The item advances silently under a screen-reader user otherwise (SC 4.1.3).
  // Triage runs Love, Love, Love — identical text does NOT re-fire a live region,
  // so nudge the string (a trailing space is not spoken).
  function announce(label: string) {
    const line = `${label} — saved.`;
    setAnnouncement((prev) => (prev === line ? `${line} ` : line));
  }

  async function submitDecision(label: string, decision: D) {
    if ((await onDecision(decision)) !== false) announce(label);
  }

  return (
    <div className="space-y-3">
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
      <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap">
        {decisions.map((item) => {
          const selected = priorAnswer !== undefined && item.label === priorAnswer;
          return (
            <Button
              key={item.label}
              type="button"
              variant="primary"
              size="lg"
              onClick={() => submitDecision(item.label, item.decision)}
              aria-pressed={selected || undefined}
              className={`flex-1 min-w-24${selected ? " ring-2 ring-offset-2 ring-offset-ground ring-primary" : ""}`}
            >
              {item.label}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
```

  - `DeferControl.tsx`: keep the header comment's first paragraph. Replace the `submit` paragraph
    with "`onDecision` is the caller's Not yet (the round's own queue entry, or the walkthrough's
    demo step)." The body becomes:

```tsx
export function DeferControl({ onDecision }: { onDecision: () => void }) {
  return (
    <Button type="button" variant="ghost" title={TITLE} aria-label={ARIA_LABEL} onClick={onDecision}>
      {LABEL}
    </Button>
  );
}
```

    Delete its `useOptionalTriageUndo` import and the `DeferControlProps` type.
  - `SetAsideButton.tsx`: keep the first comment paragraph (drop the "`submit` selects the wiring"
    lines). The body becomes:

```tsx
export function SetAsideButton({ onDecision }: { onDecision: () => void }) {
  return (
    <Button type="button" variant="ghost" onClick={onDecision} title="Sets it aside" aria-label="Not mine — sets it aside">
      Not mine
    </Button>
  );
}
```

    Delete the `useState` and `useOptionalTriageUndo` imports. Rewrite the first paragraph's
    "records … via the provider, which then refreshes so the next item comes forward" to "a tap
    calls `onDecision` (the round's Not mine, which sets it aside through the provider, or the
    walkthrough's demo step)". Keep the un-keyed focus paragraph but replace its
    "survives router.refresh()" reason with "survives the optimistic advance to the next piece"
    (the tap path no longer refreshes).
  - `TriageUndoProvider.tsx`: delete `defer` (the function, its comment, `defer` in the context
    value, and `defer` in the `TriageUndoContextValue` type). Update the comment at line ~57 that
    says the walkthrough renders `SetAsideButton` in "local" mode to: "The walkthrough's buttons
    take a plain onDecision and never touch this provider." Refresh the header too: line 14's "The
    BUTTON (SetAsideButton) lives inside the triage decision sub-row" → "Not mine (TriageRound's
    `handleNotMine`, via `SetAsideButton`) lives inside…", and line 21's "setAside/defer enqueue" →
    "setAside enqueues".
  - `localMode.guard.test.ts` header: "The sorting components carry a `{ kind: "local" }` submit
    arm" → "`CompareChoice` carries a `{ kind: "local" }` submit arm" (the only one left).
  - Callers: in `TriageRound.tsx`, change `submit={{ kind: "local", onDecision: (d) => handleTriage(shown.item, d) }}`
    to `onDecision={(d) => handleTriage(shown.item, d)}` and drop `type="triage"`; use
    `<DeferControl onDecision={() => void handleNotYet(shown)} />` and
    `<SetAsideButton onDecision={() => handleNotMine(shown.item)} />`. In `WelcomeTriage.tsx`,
    change `submit={{ kind: "local", onDecision: (d) => onOutcome(…) }}` to
    `onDecision={(d) => onOutcome(…)}` with the same arrow body, and drop `type="triage"`; use
    `<DeferControl onDecision={() => onOutcome(item.id, { kind: "deferred" })} />` and
    `<SetAsideButton onDecision={() => onOutcome(item.id, { kind: "setAside" })} />`.
  - `SortResultService.ts`: delete `getDraftResult` (3 lines plus the blank line).

- [ ] **Step 5: Run and see them pass.** Run the Step 3 command again and expect PASS. Then:
  `npx vitest run src/features/sorting src/features/onboarding src/app/collections src/server`
  → PASS; `npx tsc --noEmit` → no errors; and
  `grep -rn 'kind: "local"' src --include='*.tsx' | grep -v '\.test\.'` → exactly two lines:
  `CompareChoice.tsx` (the `submit` type, which keeps both arms: the walkthrough's compare is
  local and the sort page's is session) and `WelcomeCompare.tsx` (its caller). (The old
  `grep -v CompareChoice` filter hid the first and passed the second, so it proved nothing.)

- [ ] **Step 6: Commit.**

```bash
git add src/features/sorting/DecisionControls.tsx src/features/sorting/DecisionControls.test.tsx \
  src/features/sorting/DeferControl.tsx src/features/sorting/DeferControl.test.tsx src/features/sorting/SetAsideButton.tsx \
  src/features/sorting/SetAsideUndo.test.tsx src/features/sorting/TriageUndoProvider.tsx src/features/sorting/TriageRound.tsx \
  src/features/onboarding/WelcomeTriage.tsx src/server/services/SortResultService.ts src/features/sorting/localMode.guard.test.ts
git commit -m "refactor(sort): delete the dead session arms, TriageUndoProvider.defer and getDraftResult (purses-w7ss.9)"
```

---

## Task 7: One storage-unavailable fallback, `directSubmit` (`purses-w7ss.9`, part B)

**Files:** create `src/features/sorting/directSubmit.ts` and `src/features/sorting/directSubmit.test.ts`;
modify `CompareChoice.tsx`, `useOptimisticRound.ts`, `TriageRound.tsx`, `TriageUndoProvider.tsx`,
and `decisionFlusher.ts` (header comment only).

**Interfaces:**
- Consumes: `PendingEntry` (`./decisionQueue`).
- Produces: `export async function directSubmit(route: { sessionId: string; collectionId: string }, entry: PendingEntry): Promise<boolean>`.
  It returns `res.ok`, and `false` on a network throw. It lives in its own module, so the callers'
  tests, which mock `./decisionFlusher` down to `triggerFlush`/`isInFlight`, need no change.

- [ ] **Step 1: Write the failing test** `src/features/sorting/directSubmit.test.ts`:

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { directSubmit } from "./directSubmit";
import type { PendingEntry } from "./decisionQueue";

const route = { sessionId: "sess_1", collectionId: "col_1" };
const at = new Date(0).toISOString();
afterEach(() => vi.unstubAllGlobals());

describe("directSubmit — the storage-unavailable fallback, one request per entry", () => {
  const cases: [string, PendingEntry, string, RequestInit][] = [
    [
      "a decision POSTs the single decisions route with its clientKey",
      { kind: "decision", clientKey: "k1", type: "triage", decision: { itemId: "i1", result: "top" }, enqueuedAt: at },
      "/api/sessions/sess_1/decisions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "triage", decision: { itemId: "i1", result: "top" }, clientKey: "k1" }) },
    ],
    [
      "a set-aside POSTs the collection's dispositions route with the disposition",
      { kind: "disposition", clientKey: "k2", itemId: "i2", disposition: "set_aside", enqueuedAt: at },
      "/api/collections/col_1/dispositions",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ itemId: "i2", disposition: "set_aside" }) },
    ],
    [
      "clear DELETEs that item's disposition",
      { kind: "disposition", clientKey: "k3", itemId: "i3", disposition: "clear", enqueuedAt: at },
      "/api/collections/col_1/dispositions/i3",
      { method: "DELETE" },
    ],
  ];
  for (const [name, entry, url, init] of cases) {
    it(name, async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", fetchMock);
      expect(await directSubmit(route, entry)).toBe(true);
      expect(fetchMock).toHaveBeenCalledWith(url, init);
    });
  }
  it("a non-ok response and a network throw both read as not landed", async () => {
    const entry = cases[0][1];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await directSubmit(route, entry)).toBe(false);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("offline")));
    expect(await directSubmit(route, entry)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run src/features/sorting/directSubmit.test.ts`.
  Expected: FAIL, "Cannot find module './directSubmit'".

- [ ] **Step 3: Implement** `src/features/sorting/directSubmit.ts`:

```ts
import type { PendingEntry } from "./decisionQueue";

// The storage-unavailable fallback (spec §3.1, F18): when enqueue() cannot persist even after
// a flush, the island sends this ONE entry directly and awaits it. A decision goes to the
// single-decision route (the flusher batches decisions; this never does); a disposition uses the
// flusher's routes. A network throw reads as "not landed", so each island shows its own line.
export async function directSubmit(
  route: { sessionId: string; collectionId: string },
  entry: PendingEntry,
): Promise<boolean> {
  try {
    const res =
      entry.kind === "decision"
        ? await fetch(`/api/sessions/${route.sessionId}/decisions`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ type: entry.type, decision: entry.decision, clientKey: entry.clientKey }),
          })
        : entry.disposition === "clear"
          ? await fetch(`/api/collections/${route.collectionId}/dispositions/${entry.itemId}`, { method: "DELETE" })
          : await fetch(`/api/collections/${route.collectionId}/dispositions`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ itemId: entry.itemId, disposition: entry.disposition }),
            });
    return res.ok;
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run it and see it pass.** Run the Step 2 command again and expect PASS.

- [ ] **Step 5: Replace the five copies** (six before Task 6 deleted `defer`). Bind each entry to a `const` before `enqueue` so the
  same object goes to `directSubmit`.
  - `CompareChoice.tsx` (`choose`): build
    `const entry: PendingEntry = { kind: "decision", clientKey, type: "pairwise_compare", decision, enqueuedAt: new Date().toISOString() };`,
    pass `entry` to `enqueue`, and replace the whole `if (persisted === "needs_fallback") { let landed … }`
    body down to (not including) `settle(…)` with:

```ts
      if (persisted === "needs_fallback") {
        if (!(await directSubmit({ sessionId: submit.sessionId, collectionId: submit.collectionId }, entry))) {
          setError(FALLBACK_RETRY_LINE);
          pendingRef.current = false;
          setPending(null);
          return;
        }
        settle(clientKey, keySlot, { ...pair, result });
        return;
      }
```

  - `useOptimisticRound.ts` (`submitDecision`): build
    `const entry: PendingEntry = { kind: "decision", clientKey, type: "triage", decision, enqueuedAt: new Date().toISOString() };`,
    pass it to `enqueue`, and replace the fallback with:

```ts
      if (persisted === "needs_fallback") {
        if (!(await directSubmit({ sessionId, collectionId }, entry))) {
          setStumble(true);
          return false;
        }
        outcomesRef.current.set(clientKey, { status: "created" });
      } else {
```

  - `TriageRound.tsx` (`handleNotYet`): build the `deferred` entry as a `const entry`, then use
    `if (persisted === "needs_fallback") await directSubmit({ sessionId, collectionId }, entry); // best-effort: the piece still waits at the end and returns next visit`.
    Pin this caller first (it has no fallback test today): add to `TriageRound.test.tsx`'s
    "storage fallback (F18)" describe, before the edit:

```ts
  it("Not yet degrades to ONE POST of a deferred disposition and still moves the piece on", async () => {
    store.setItem = () => {
      throw new Error("quota");
    };
    const user = userEvent.setup();
    renderRound();
    await user.click(screen.getByRole("button", { name: /^not yet/i }));
    expect(await screen.findByRole("img", { name: "Bag B" })).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe("/api/collections/coll_1/dispositions");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ itemId: "item_a", disposition: "deferred" });
  });
```

    It should pass against today's inline fetch (it pins behaviour the refactor must keep).
  - `TriageUndoProvider.tsx` `setAside`: replace the fallback `fetch` + `if (!res.ok) throw` with
    `if (!(await directSubmit({ sessionId, collectionId }, entry))) throw new Error("set aside failed");`
    and keep the existing `setUndo({ itemId, name, clientKey: null }); return;`. In `bringBack`,
    bind `const clear = dispositionEntry(itemId, "clear");`, pass `clear` to `enqueue`, and use
    `if (!(await directSubmit({ sessionId, collectionId }, clear))) throw new Error("bring back failed");`.
    (The provider's props already include `sessionId` and `collectionId`.)
  - Add `import { directSubmit } from "./directSubmit";` (and `type PendingEntry` from
    `./decisionQueue` where it is newly needed) to each file.
  - `decisionFlusher.ts` header, first line: "the ONLY code that drains queued
    decisions/dispositions (spec §3.2, F12); `directSubmit` sends one un-queued entry when storage
    is unavailable (F18)."

- [ ] **Step 6: Prove the copies are gone and the callers still pass.**
  `grep -rn "needs_fallback" src --include='*.ts*' | grep -v '\.test\.' | grep -v decisionQueue.ts`
  should print exactly 5 lines (CompareChoice, useOptimisticRound, TriageRound, and
  TriageUndoProvider ×2), each an `if (persisted === "needs_fallback")` with no `fetch` near it. `grep -rn "fetch(" src/features/sorting/{CompareChoice,TriageRound,TriageUndoProvider}.tsx src/features/sorting/useOptimisticRound.ts`
  should print nothing. Then run `npx vitest run src/features/sorting` and expect PASS (the existing
  fallback tests in `CompareChoice.test.tsx:504`, `SetAsideUndo.test.tsx` "storage-unavailable
  fallback (F18)" and `TriageRound.test.tsx` all stay green unchanged). `useOptimisticRound`'s
  fallback is already pinned through the real hook by `TriageRound.test.tsx` "a fallback that does
  not land keeps the piece in place with a gentle line" (setItem throws → needs_fallback; fetch
  `ok: false` → the stumble line; "Love — saved." never announced), so it gets no separate test.

- [ ] **Step 7: Commit.**

```bash
git add src/features/sorting/directSubmit.ts src/features/sorting/directSubmit.test.ts src/features/sorting/CompareChoice.tsx \
  src/features/sorting/useOptimisticRound.ts src/features/sorting/TriageRound.tsx src/features/sorting/TriageRound.test.tsx \
  src/features/sorting/TriageUndoProvider.tsx src/features/sorting/decisionFlusher.ts
git commit -m "refactor(sort): one directSubmit for the storage-unavailable fallback (purses-w7ss.9)"
```

---

## Task 8: CI e2e map — the sort area runs `lists-and-home` (`purses-w7ss.15`)

**Files:** `.github/workflows/ci.yml`.

- [ ] **Step 1:** In the "Select e2e specs" step, change
  `add "e2e/sort-images.spec.ts e2e/sort-journey.spec.ts e2e/decision-recovery.spec.ts"` to:

```sh
            # KeepSortingButton / AsyncActionButton (sort area) render in the home's phone
            # ActionBar and the archived card; lists-and-home owns that geometry.
            add "e2e/sort-images.spec.ts e2e/sort-journey.spec.ts e2e/decision-recovery.spec.ts e2e/lists-and-home.spec.ts"
```

- [ ] **Step 2:** Run `npx vitest run scripts/ci-e2e-map.test.ts` and expect PASS. Then
  `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml'))"` and expect no
  output (the YAML is valid).

- [ ] **Step 3: Commit.**

```bash
git add .github/workflows/ci.yml
git commit -m "ci(e2e): sort-area changes also run lists-and-home (purses-w7ss.15)"
```

---

## Task 9: Align `eslint-config-next` with `next` (`purses-ejvl`)

**Files:** `package.json`, `package-lock.json`, `src/features/onboarding/WalkthroughShell.tsx`
(one disable comment).

- [ ] **Step 1:** `npm install -D eslint-config-next@^16.3.8`.
- [ ] **Step 2:** Verify:
  `grep -n '"eslint-config-next"' package.json` → `"^16.3.8"`;
  `grep -n '"node_modules/eslint-config-next"' -A1 package-lock.json` → `"version": "16.3.8"`;
  `git diff --stat` → only `package.json` and `package-lock.json`.
- [ ] **Step 3:** The upgraded config flags `WalkthroughShell.tsx:74`
  (`window.location.assign("/collections")`), which is deliberate. Add, directly above it
  (precedent: the `eslint-disable-next-line` at `PoolPhotoGrid.tsx:187`):

```tsx
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- deliberate full navigation so the server re-runs the /welcome gate (purses-etv0)
```

  If lint does not flag that line, do not add the comment (an unused directive is itself a
  warning). Run `npm run lint` and expect exactly today's baseline: **0 errors, 1 warning** (the
  pre-existing `@next/next/no-img-element` in `src/__mocks__/next-image.tsx`). Any other new
  finding: fix it in place only when the fix is mechanical and behaviour-free; otherwise stop and
  report the rule names (no other disables). Then run `npm run build` and expect success. The
  `osv-scanner.toml` `braces` entry stays (Decision 12).
- [ ] **Step 4: Commit.**

```bash
git add package.json package-lock.json src/features/onboarding/WalkthroughShell.tsx
git commit -m "chore(deps): eslint-config-next ^16.3.8 to match next (purses-ejvl)"
```

---

## Task 10: The collection home drops the mode chips (`purses-w7ss.14`)

Owner decision (2026-10-03): the Build / Sort / Decide chips come off the collection home only.
The home keeps Start/Keep sorting, the Add photos pill and See your ranking (tablet). The chips
stay on the section pages: `src/app/collections/[id]/pool/page.tsx` (Photos, `activeMode="build"`)
and `src/app/collections/[id]/results/page.tsx` (Decide). The sort page renders none today, and
that does not change.

**Files:** `src/app/collections/[id]/page.tsx`, `src/app/collections/[id]/page.test.tsx`,
`e2e/lists-and-home.spec.ts`, `DESIGN.md`.

**Interfaces:** none. `WorkspaceModeChips` (`src/features/collections/WorkspaceModeChips.tsx`) and
its test stay as they are. The home was its only `activeExact` (default `true`) caller, and the
pool page still passes `activeExact={false}`.

- [ ] **Step 1: Write the failing unit test** in `src/app/collections/[id]/page.test.tsx`, inside
  `describe("header: See your ranking and the ··· menu")`:

```ts
  it("the home carries no Build / Sort / Decide chips (they live on the section pages)", async () => {
    itemRepo.findByCollection.mockResolvedValue([makeItem(1, "Tote")]);
    await renderPage();
    expect(screen.queryByRole("navigation", { name: "Workspace mode" })).not.toBeInTheDocument();
  });
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run "src/app/collections/[id]/page.test.tsx"`.
  Expected: FAIL. The `Workspace mode` nav is found, because the home renders
  `<WorkspaceModeChips base={base} activeMode="build" />` at `page.tsx:105`.

- [ ] **Step 3: Implement** in `src/app/collections/[id]/page.tsx`. Delete the
  `WorkspaceModeChips` import (line 17). Replace the chip row:

```tsx
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <WorkspaceModeChips base={base} activeMode="build" />
            {hasEverSorted && (
              <Link href={`${base}/results`} className={`${quietLink} max-md:hidden`}>
                See your ranking
              </Link>
            )}
          </div>
```

  with:

```tsx
          {hasEverSorted && (
            <div className="max-md:hidden">
              <Link href={`${base}/results`} className={quietLink}>
                See your ranking
              </Link>
            </div>
          )}
```

  Change the comment above the header group to
  `{/* The header group: title, ··· and (tablet) See your ranking held together; the action row breaks after it. */}`.

- [ ] **Step 4: Update the e2e** in `e2e/lists-and-home.spec.ts`. Retitle the keyboard-order test
  to `"keyboard order on the home: trail → menu → primary → pill → search → cards"`, and replace

```ts
  expect(idx("Decide"), seen).toBeGreaterThan(idx("More for E2E Workspace items-only"));
  expect(idx("Start sorting"), seen).toBeGreaterThan(idx("Decide"));
```

  with

```ts
  expect(idx("Start sorting"), seen).toBeGreaterThan(idx("More for E2E Workspace items-only"));
```

  (The chips' absence is pinned by the unit test in Step 1, and the e2e does not repeat it.) In
  `beforeAll`, change the comment on `ranked = await seedSortScenario(ownerId);` from "so the chip
  row carries See your ranking" to "so the header carries See your ranking".

- [ ] **Step 5: DESIGN.md §5 (Wayfinding).** Change "Mode chips appear on the collection home and
  the section index pages (Photos, Decide)" to "Mode chips appear on the section index pages
  (Photos, Decide), not on the collection home, whose one primary action and Add photos pill
  already lead there (owner decision, `purses-w7ss.14`)". Keep the rest of the sentence.

- [ ] **Step 6: Run and see it pass.** Run
  `npx vitest run "src/app/collections/[id]" src/features/collections` and expect PASS. Then run
  `npx playwright test e2e/lists-and-home.spec.ts --project=tablet` and expect PASS. Run the whole
  file, because the phone ranking-link test and Tasks 2 and 3 also load the home.

- [ ] **Step 7: Commit.**

```bash
git add "src/app/collections/[id]/page.tsx" "src/app/collections/[id]/page.test.tsx" e2e/lists-and-home.spec.ts DESIGN.md
git commit -m "feat(home): drop the mode chips from the collection home; they stay on the section pages (purses-w7ss.14)"
```

  Screenshots: Task 15 Step 8 captures `home` (has a ranking: See your ranking under the title on
  tablet, nothing on phone) and `home-items-first`.

---

## Task 11: One lock for the local test DB; e2e starts on a fresh DB (`purses-w7ss.24`)

`test:db`, Playwright e2e and the screenshot capture all use one local Postgres (`pi-e2e-db` on
`:5433`, `e2e/fixtures/test-db.sh`). Two of these running at once TRUNCATE each other's data or
deadlock (memories `db-test-parallel-deadlock` and `orchestration-log-marker-races`). An e2e run
after `test:db` on a container that was left up fails `auth.setup` (memory
`e2e-needs-fresh-container-after-test-db`).

**Ruling candidate (lock mechanism):** the bead and the charter name `flock /tmp/adored-db.lock`,
but macOS has no `flock` binary (`command -v flock` prints nothing on the dev Mac; checked at
pre-flight). So the lock is a ~40-line TypeScript module, run with the `tsx` already in
`dependencies`. It makes an atomic directory (`rename` of a pid-carrying temp dir onto
`/tmp/adored-db.lock`) and takes over a lock whose holder pid is dead. It is taken in two places:
the `test:db` script (through a CLI wrapper) and Playwright's `globalSetup`. `globalSetup` covers
`npm run test:e2e`, any direct `npx playwright test …` and `npm run screenshots`, because the
screenshot config spreads the base config. The other option was to require `brew install flock`.
That is a per-machine prerequisite, CI does not need it, and a forgotten install fails open.

**Files:** create `scripts/db-lock.ts`, `scripts/db-lock.test.ts` and `scripts/with-db-lock.ts`.
Modify `e2e/global-setup.ts`, `e2e/global-teardown.ts`, `package.json` (the `test:db` script only),
`docs/ARCHITECTURE.md` and `docs/DATABASE.md`.

**Interfaces:**
- Produces: `export const DB_LOCK = "/tmp/adored-db.lock"`,
  `export async function acquireDbLock(opts?: { path?: string; timeoutMs?: number; pollMs?: number }): Promise<void>`
  and `export function releaseDbLock(path?: string): void`.

- [ ] **Step 1: Write the failing test** `scripts/db-lock.test.ts` (vitest includes
  `scripts/**/*.test.ts`, so `test:ci` runs it):

```ts
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { acquireDbLock, releaseDbLock } from "./db-lock";

const freshPath = () => join(mkdtempSync(join(tmpdir(), "db-lock-")), "lock");
function heldBy(path: string, pid: number) {
  mkdirSync(path);
  writeFileSync(join(path, "pid"), String(pid));
}

describe("the local test-DB lock", () => {
  it("a live holder blocks: a second run waits, then gives up naming the holder", async () => {
    const path = freshPath();
    heldBy(path, process.ppid); // alive, and not us
    await expect(acquireDbLock({ path, timeoutMs: 50, pollMs: 10 })).rejects.toThrow(`pid ${process.ppid}`);
  });

  it("a lock left by a dead run (crash, ^C) is taken over, and release frees it", async () => {
    const path = freshPath();
    heldBy(path, spawnSync("true").pid!); // exited and reaped: dead
    await acquireDbLock({ path, timeoutMs: 1_000, pollMs: 10 });
    expect(readFileSync(join(path, "pid"), "utf8")).toBe(String(process.pid));
    releaseDbLock(path);
    expect(existsSync(path)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run scripts/db-lock.test.ts`. Expected: FAIL,
  "Cannot find module './db-lock'".

- [ ] **Step 3: Implement** `scripts/db-lock.ts`:

```ts
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

// One lock for every run on the shared local test Postgres (pi-e2e-db, :5433): test:db, Playwright
// e2e and the screenshot capture. Concurrent runs TRUNCATE each other or deadlock (memories
// db-test-parallel-deadlock, orchestration-log-marker-races). macOS has no flock(1), so the lock
// is a directory that appears atomically with its holder's pid inside; a dead holder's lock is
// taken over. (Two runs taking over the same stale lock in the same instant is a two-syscall
// window; accepted for a dev-machine lock.)
export const DB_LOCK = "/tmp/adored-db.lock";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "EPERM"; // exists, owned by someone else
  }
}
function holder(path: string): number | null {
  try {
    return Number(readFileSync(join(path, "pid"), "utf8"));
  } catch {
    return null; // released between our attempt and this read
  }
}

export async function acquireDbLock({ path = DB_LOCK, timeoutMs = 30 * 60_000, pollMs = 2_000 } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let said = false;
  for (;;) {
    const tmp = `${path}.${process.pid}`;
    mkdirSync(tmp, { recursive: true });
    writeFileSync(join(tmp, "pid"), String(process.pid));
    try {
      renameSync(tmp, path); // fails while the lock dir exists (it is never empty)
      return;
    } catch {
      rmSync(tmp, { recursive: true, force: true });
    }
    const pid = holder(path);
    if (pid !== null && !alive(pid)) {
      rmSync(path, { recursive: true, force: true });
      continue;
    }
    if (Date.now() >= deadline) throw new Error(`test DB is busy: ${path} is held by pid ${pid}`);
    if (!said) console.error(`test DB is busy (pid ${pid}); waiting for ${path}…`);
    said = true;
    await sleep(pollMs);
  }
}

export function releaseDbLock(path = DB_LOCK): void {
  if (holder(path) === process.pid) rmSync(path, { recursive: true, force: true });
}
```

  And the CLI wrapper `scripts/with-db-lock.ts` (separate, so the module has no main-check):

```ts
import { spawnSync } from "node:child_process";
import { acquireDbLock, releaseDbLock } from "./db-lock";

// tsx scripts/with-db-lock.ts <cmd> [args…]: run one command holding the test-DB lock.
async function main(): Promise<number> {
  const [cmd, ...args] = process.argv.slice(2);
  await acquireDbLock();
  try {
    return spawnSync(cmd, args, { stdio: "inherit" }).status ?? 1;
  } finally {
    releaseDbLock();
  }
}
main().then((code) => process.exit(code));
```

- [ ] **Step 4: Run it and see it pass.** Run the Step 2 command again and expect PASS.

- [ ] **Step 5: Wire it in.**
  - `package.json`: `"test:db": "bash e2e/fixtures/run-db-tests.sh"` →
    `"test:db": "tsx scripts/with-db-lock.ts bash e2e/fixtures/run-db-tests.sh"`. (`npm run test:db
    -- <path>` still forwards the path, because the wrapper passes argv through. CI's `db-tests`
    job calls vitest directly, so the change does not touch it.)
  - `e2e/global-setup.ts`: add `import { acquireDbLock } from "../scripts/db-lock";`. As the first
    line of `globalSetup()`, add
    `await acquireDbLock(); // one run at a time on the shared test DB (purses-w7ss.24)`. Change
    `[script, "up"]` to `[script, "reset"]` and add the comment
    `// recycle: e2e always starts on a fresh DB, never test:db's leftovers (memory e2e-needs-fresh-container-after-test-db)`.
  - `e2e/global-teardown.ts`: add `import { releaseDbLock } from "../scripts/db-lock";` and call
    `releaseDbLock();` after the `down`. (If a run dies before teardown, its pid is dead and the
    next run takes the lock over.)

- [ ] **Step 6: Prove the serialization for real.** Run, from two shells:
  `npm run test:db > /tmp/lock-db.log 2>&1; echo exit=$?` and, while it runs,
  `npx playwright test e2e/smoke.spec.ts --project=tablet > /tmp/lock-e2e.log 2>&1; echo exit=$?`.
  Expected: both `exit=0`, and `/tmp/lock-e2e.log` contains `test DB is busy (pid …)` before any
  test line. Record both exit codes in the ledger. Do not pipe either command through `tail`.

- [ ] **Step 7: Docs.**
  - `docs/ARCHITECTURE.md` decision 11 has a stale bullet. The *Worktree-derived ports* bullet
    describes per-worktree slots, `pi-e2e-db-<slot>` and `test-db.sh url`, but `test-db.sh` never
    shipped them: it still uses `pi-e2e-db` on `:5433`, and `e2e/fixtures/db.ts` defaults to that
    URL. Replace the bullet with: "*One test DB, one lock (`purses-w7ss.24`):* every worktree shares
    `pi-e2e-db` on `:5433`, so `test:db`, e2e and the screenshot capture take
    `/tmp/adored-db.lock` (`scripts/db-lock.ts`; an atomic lock directory with the holder's pid,
    because macOS has no `flock`; a dead holder's lock is taken over). `test:db` takes it through
    `scripts/with-db-lock.ts`, and Playwright's `globalSetup` takes it and then runs
    `test-db.sh reset`, so e2e always starts on a fresh DB."
  - `docs/DATABASE.md`, the `npm run test:db` paragraph: append "It holds the shared test-DB lock
    (`scripts/with-db-lock.ts`, ARCHITECTURE decision 11), so it waits for a running e2e or
    screenshot run instead of truncating under it."

- [ ] **Step 8: Commit.**

```bash
git add scripts/db-lock.ts scripts/db-lock.test.ts scripts/with-db-lock.ts e2e/global-setup.ts e2e/global-teardown.ts \
  package.json docs/ARCHITECTURE.md docs/DATABASE.md
git commit -m "test(infra): one lock for the local test DB; e2e recycles it first (purses-w7ss.24)"
```

---

## Task 12: `test-db.sh` falls back to Homebrew Postgres when Docker is down (`purses-w7ss.25`)

When Docker Desktop is blocked, the DB tier and e2e still run on a throwaway Homebrew
`postgresql@15` cluster on `127.0.0.1:5433` (memory `db-e2e-without-docker`). Today that takes a
hand-built `docker` shim on `PATH`. After this task, `test-db.sh` picks the backend itself.

**Files:** `e2e/fixtures/test-db.sh`, `e2e/fixtures/run-db-tests.sh`, `docs/DATABASE.md`.

**Interfaces:**
- Produces: `test-db.sh running` (exit 0 when the test DB is up, on either backend).
  `TEST_DB_BACKEND=docker|brew` overrides detection. That override is how the fallback is verified
  on a machine where Docker works.

**No automated test:** CI always has Docker, so a fallback-path test could never run in the CI gate
(global testing rule: a test only counts if CI runs it). Step 4 is the recorded manual proof.

- [ ] **Step 1: Backend detection** in `test-db.sh`, after `export DATABASE_URL_TEST=…`:

```bash
# Docker when its daemon answers; otherwise a throwaway Homebrew postgresql@15 cluster on the same
# port, user and password (memory db-e2e-without-docker). TEST_DB_BACKEND forces one.
BACKEND="${TEST_DB_BACKEND:-$(docker info >/dev/null 2>&1 && echo docker || echo brew)}"
PGDATA_DIR="${TMPDIR:-/tmp}/adored-test-pg"
```

- [ ] **Step 2: The brew path.** Rename today's `up`/`down` to `docker_up`/`docker_down`
  (unchanged bodies, except that `docker_up` no longer runs the migrate lines; see below). Add:

```bash
brew_bin() {
  local bin
  bin="$(brew --prefix postgresql@15 2>/dev/null)/bin"
  if [ ! -x "${bin}/pg_ctl" ]; then
    echo "test-db: Docker is not running and Homebrew postgresql@15 is missing — start Docker or 'brew install postgresql@15'" >&2
    exit 1
  fi
  echo "${bin}"
}

brew_up() {
  local bin; bin="$(brew_bin)"
  if ! "${bin}/pg_ctl" -D "${PGDATA_DIR}" status >/dev/null 2>&1; then
    echo "test-db: Docker unavailable — starting Homebrew postgresql@15 on 127.0.0.1:${PORT}…"
    [ -f "${PGDATA_DIR}/PG_VERSION" ] || "${bin}/initdb" -D "${PGDATA_DIR}" -U postgres --auth=trust >/dev/null
    # Loopback only, like the container (guessable credentials).
    "${bin}/pg_ctl" -D "${PGDATA_DIR}" -l "${PGDATA_DIR}/server.log" -w \
      -o "-p ${PORT} -k ${PGDATA_DIR} -c listen_addresses=127.0.0.1,::1" start >/dev/null
    "${bin}/createdb" -h 127.0.0.1 -p "${PORT}" -U postgres "${DB}"
  fi
}

brew_down() {
  local bin; bin="$(brew --prefix postgresql@15 2>/dev/null)/bin"
  [ -x "${bin}/pg_ctl" ] && "${bin}/pg_ctl" -D "${PGDATA_DIR}" status >/dev/null 2>&1 &&
    "${bin}/pg_ctl" -D "${PGDATA_DIR}" -m fast stop >/dev/null
  rm -rf "${PGDATA_DIR}" # like docker rm: down means the data is gone, so reset is a clean slate
  echo "test-db: Homebrew cluster removed"
}

running() {
  if [ "${BACKEND}" = docker ]; then
    docker ps --format '{{.Names}}' | grep -q "^${CONTAINER}$"
  else
    "$(brew --prefix postgresql@15 2>/dev/null)/bin/pg_ctl" -D "${PGDATA_DIR}" status >/dev/null 2>&1
  fi
}

up() {
  "${BACKEND}_up"
  echo "test-db: applying schema (drizzle migrate)…"
  DATABASE_URL="${DATABASE_URL_TEST}" npm run db:migrate
  echo "test-db: up at ${DATABASE_URL_TEST}"
}
down() { "${BACKEND}_down"; }
```

  Move the two migrate lines and the final `echo` out of `docker_up` into the shared `up`, as
  above. Add `running) running ;;` to the `case`, and update the usage line and header comment
  (`up|down|reset|running`; "Docker, or a Homebrew postgresql@15 fallback when Docker is down").
  (`--auth=trust` accepts the URL's password `test` unchecked; the cluster listens only on
  loopback, and `db.ts`'s host allowlist still applies.)

- [ ] **Step 3: `run-db-tests.sh`.** Delete the `command -v docker` guard. `test-db.sh` now reports
  the missing-backend case itself. Replace the `docker ps … grep` STARTED_HERE check with
  `if ! bash "${DB_SCRIPT}" running; then STARTED_HERE=1; fi`. Delete the now-unused `CONTAINER=`
  line.

- [ ] **Step 4: Verify both backends, recording each exit code** (no `tail`):
  - `bash e2e/fixtures/test-db.sh reset > /tmp/tdb-docker.log 2>&1; echo exit=$?` → `exit=0`,
    with the log showing `postgres:16` (Docker path unchanged). Then
    `bash e2e/fixtures/test-db.sh down`.
  - `TEST_DB_BACKEND=brew npm run test:db > /tmp/tdb-brew.log 2>&1; echo exit=$?` → `exit=0`,
    with the log showing "starting Homebrew postgresql@15". Afterwards
    `TEST_DB_BACKEND=brew bash e2e/fixtures/test-db.sh running; echo running=$?` prints
    `running=1`: `run-db-tests.sh` started the cluster, so it tore it down.
  - `TEST_DB_BACKEND=brew npx playwright test e2e/smoke.spec.ts --project=tablet > /tmp/tdb-brew-e2e.log 2>&1; echo exit=$?`
    → `exit=0`. This runs through Task 11's `globalSetup` `reset` and teardown `down`.
  - If Homebrew `postgresql@15` is not installed on the machine, record that and skip the brew
    bullets. Do not install it as part of this task.

- [ ] **Step 5: Docs.** In `docs/DATABASE.md`'s `npm run test:db` paragraph, change "which
  **self-manages Docker**" to "which **self-manages the test DB** (Docker, or a throwaway Homebrew
  `postgresql@15` cluster on the same port when Docker is down; `TEST_DB_BACKEND=docker|brew`
  forces one)". Change `test-db.sh up` "if it is not already running" to
  `test-db.sh running` / `up`.

- [ ] **Step 6: Commit.**

```bash
git add e2e/fixtures/test-db.sh e2e/fixtures/run-db-tests.sh docs/DATABASE.md
git commit -m "test(infra): test-db.sh falls back to Homebrew postgresql@15 when Docker is down (purses-w7ss.25)"
```

---

## Task 13: doc-check ignores test files (`purses-w7ss.26`)

`scripts/hooks/doc-check.mjs` maps every file under `src/app/api/` to `docs/API.md` by prefix. So a
test-only change to a `route.test.ts` soft-blocks the pre-push doc-sync step, although no documented
fact moved (memory `doc-check-overbroad-api`).

**Ruling candidate (scope):** the bead says "from the API.md mapping". This task skips test files
for **every** mapping, with one line in `checkDocSync`. A test file never states a documented fact;
the source it tests carries the mapping. An API-only skip would need per-entry special-casing for
no gain. The cost if this is wrong: a test-only change under `src/lib/design/` (for example a new
`contrast.test.ts` row) no longer nudges DESIGN.md. The nudge is soft, and Task 15's `/sync-docs`
still reads the whole diff.

**Files:** `scripts/hooks/doc-check.mjs`, `scripts/hooks/doc-check.test.ts` (exists; it runs in
`test:ci` through vitest's `scripts/**` include).

- [ ] **Step 1: Write the failing test.** Append to `describe("checkDocSync")` in
  `scripts/hooks/doc-check.test.ts`:

```ts
  it("ignores test files: a test-only change under a mapped prefix needs no doc", () => {
    expect(checkDocSync(["src/app/api/items/[id]/restore/route.test.ts"], entries)).toHaveLength(0);
    expect(checkDocSync(["src/app/api/items/[id]/restore/route.ts"], entries)).toHaveLength(1); // the source still maps
  });
```

- [ ] **Step 2: Run it and see it fail.** `npx vitest run scripts/hooks/doc-check.test.ts`.
  Expected: FAIL. The first assertion gets 1 finding (`docs/API.md` missing).

- [ ] **Step 3: Implement.** In `checkDocSync`, first line of the `for (const f of changedFiles)`
  loop:

```js
    if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(f)) continue; // a test states no documented fact
```

- [ ] **Step 4: Run and see it pass.** Run the Step 2 command again and expect PASS.

- [ ] **Step 5: Commit.**

```bash
git add scripts/hooks/doc-check.mjs scripts/hooks/doc-check.test.ts
git commit -m "chore(hooks): doc-check skips test files (purses-w7ss.26)"
```

---

## Task 14: Charter — CI reruns and the DB lock (`purses-w7ss.27`)

The charter (`.claude/skills/adored-revamp/SKILL.md`, loop step 5) already says "Record every
gate's exit code; never pipe a gate through `tail`" and "Watch CI with `gh run watch
--exit-status`". This task adds only what is missing (memories `shell-exit-codes-zsh` and
`ci-watch-and-graph-conflicts`), and it renames the lock to match Task 11. Doc-only, no tests.

**Files:** `.claude/skills/adored-revamp/SKILL.md`.

- [ ] **Step 1: Edit loop step 5.**
  - Change "DB, e2e and screenshot runs hold `flock /tmp/adored-db.lock`; e2e recycles the test
    container first." to "DB, e2e and screenshot runs hold `/tmp/adored-db.lock` (`test:db` and
    Playwright's `globalSetup` take it; `scripts/db-lock.ts`), and e2e resets the test DB first."
  - After "never pipe a gate through `tail`.", add "Capture it as
    `cmd > /tmp/<gate>.log 2>&1; echo exit=$?` (zsh has no `PIPESTATUS`)."
  - After "Watch CI with `gh run watch --exit-status`;", add "a red run gets
    `gh run rerun <id> --failed` once before any diagnosis (runner flakes: DB `ECONNRESET`, one flaky
    spec); never push to re-trigger CI;".
- [ ] **Step 2: Check.** `grep -n "rerun <id> --failed\|never push to re-trigger\|adored-db.lock" .claude/skills/adored-revamp/SKILL.md`
  prints the three edits, and `grep -c flock .claude/skills/adored-revamp/SKILL.md` prints `0`.
- [ ] **Step 3: Commit.**

```bash
git add .claude/skills/adored-revamp/SKILL.md
git commit -m "docs(charter): rerun a red CI once before diagnosing; never re-push to re-trigger; the DB lock (purses-w7ss.27)"
```

---

## Task 15: Docs, full gate, graphify, screenshots

**Files:** `DESIGN.md`, `docs/ARCHITECTURE.md`, `graphify-out/`.

- [ ] **Step 1: DESIGN.md §5.**
  - In **Cards**, append: "A destructive section (delete account / delete collection) is
    `Card variant="danger"`: the card fill with a sober `error` rim (≥ 3:1 on `card`, a row in
    `contrast.test.ts`), never a red wash."
  - After **Action bar**, add:

```markdown
- **Selection bar:** the pool's grouping actions (`PoolActionBar`) share the action bar's surface
  (glass-strong + blur + `shadow-lift` + a `hairline` top edge, `z-30`) but stay fixed at every
  width while photos are selected — a selection follows the person through a long grid. Its height
  is reserved through `data-selection-bar` (14rem on phone, 9rem from `sm`, as page padding and
  `scroll-padding-bottom`); static on a short viewport.
```

  - In §2 **Glass**, after "Per-component inline tints are banned — use the tokens.", add: "A
    source scan (`src/lib/design/no-inline-tints.test.ts`) fails on any `/NN` opacity modifier on
    a colour utility."
  - Under **Progress line**, add a **Carousel dots** bullet: "inactive `ink-soft`, current
    `primary` and wider (a 16px pill), so 'current' is carried by shape as well as colour;
    `aria-current` for assistive tech."
- [ ] **Step 2: ARCHITECTURE.md.** Append to decision 43's *Status* line: "PR 5 (polish): the pool's
  selection bar takes this surface but stays fixed at every width (DESIGN §5 Selection bar); the
  storage-unavailable fallback is one `directSubmit` helper." No new decision number: nothing
  architectural changed. `docs/API.md` and `docs/DEPLOYMENT.md` are untouched (no route, env or
  deploy change; the `ci.yml` edits are path-filter hygiene that DEPLOYMENT doesn't list).
- [ ] **Step 3: `/sync-docs`.** It reads `docs/doc-ownership.md`. This branch touches
  `src/app/globals.css` and `src/lib/design/` (→ DESIGN.md, done in Step 1) and
  `.github/workflows/` (→ ARCHITECTURE/DEPLOYMENT; confirm no listed fact moved). Tasks 10–12
  already edited their own docs (DESIGN.md Wayfinding, ARCHITECTURE decision 11, DATABASE.md
  test:db). Confirm README's and CLAUDE.md's "`test:db` (Docker…)" lines still read true after Task
  12 (they do: Docker stays the default). Commit:
  `git add DESIGN.md docs/ARCHITECTURE.md && git commit -m "docs: danger card, selection bar, tint scan (PR 5)"`.
- [ ] **Step 4: Full gate.** Record each command and its result for the PR body:
  `npm run lint`, `npm run test:ci`, `npm run build`, `npm run auth:verify`, `npm run test:db`,
  then `npm run test:e2e`, each run as `<cmd> > /tmp/<gate>.log 2>&1; echo exit=$?` (the Task 14
  charter rule; never `| tail`). Task 11's lock and `reset` make `test:db` followed by `test:e2e`
  safe in one session. The change touches `src/components/ui/**`, `**/*.css`, `package.json` and
  `e2e/**`, which are broad paths, so CI runs the full suite. Catch failures locally first.
- [ ] **Step 5: Phone run of the mapped specs** (without `--project`; the phone project is the
  only one active under `PW_VIEWPORT`):
  `PW_VIEWPORT=phone npx playwright test e2e/lists-and-home.spec.ts e2e/sort-journey.spec.ts e2e/item-panel.spec.ts e2e/layout.spec.ts e2e/profile.spec.ts e2e/delete-collection.spec.ts`.
  Tablet-only tests already carry their skip guard.
- [ ] **Step 6: graphify.** Only the **controller** runs this, never an implementer:
  `graphify update .`. Use `--force` only if the graph shrank because symbols were deleted
  (`getDraftResult` and `TriageUndoProvider.defer` are). Then
  `git add graphify-out && git commit -m "chore(graph): refresh after PR 5"`.
- [ ] **Step 7: Screenshot surfaces.** Add a `collection-settings` surface to
  `e2e/screenshots/capture.ts`'s list (it shows the danger section):
  `["collection-settings", `/collections/${slug}/edit`],`. Commit it with the graph or on its own:
  `git add e2e/screenshots/capture.ts && git commit -m "test(shots): collection settings surface"`.
- [ ] **Step 8: Capture** with the `pr-screenshots` skill (`docs/cookbook/add-images-to-pr.md`;
  memory `pr-screenshots-time-limit`: SHOTS keeps it under the tool ceiling):
  `SHOTS=pool-selected,home,home-items-first,home-archived,profile,collection-settings,item-detail-story,ranking,collections,home-pool-first npx playwright test -c playwright.screenshots.config.ts --project=tablet`,
  then the same with `PW_VIEWPORT=phone` in place of `--project=tablet`. That is light and dark ×
  tablet and phone. **Look at every PNG before the final review** (memory
  `ux-redesign-pr1-lessons`). Check that the pool bar has the hairline edge and shadow, and does not
  cover the last tile in the viewport shot. On the archived card, the Bring back pill's edge must
  meet the name's edge and stay inside the card. The danger rim should read as sober, not loud, in
  both themes. On the phone ranking, a small ordinal shows, and "Unpin" fits beside a readable
  name. On the archived card, the busy pill reads "One moment…" on one line. The dots show one wider current dot. The placeholder glyphs on the collections and pool
  previews must not shout in dark mode. A full-page phone shot paints the fixed bar at the fold
  (memory `phone-fullpage-capture-fixed-bar-artifact`); judge the bar from `pool-selected` (a
  viewport shot). There is no dialog scrim to capture (Decision 1). On `home` and
  `home-items-first` (Task 10), no Build / Sort / Decide chip row shows. On tablet, `home` shows See
  your ranking under the title, and on phone nothing sits between the title and the bar.
- [ ] **Step 9: PR body.** Include the gate results, the screenshot table (light | dark per
  surface, tablet and phone), the owner-veto list above verbatim, and "Closes" lines for
  `purses-w7ss.4`, `.13`, `.17`, `.11`, `.9`, `.15`, `.14`, `.24`, `.25`, `.26`, `.27` and
  `purses-ejvl`. Beads close only in
  `/close-out`, after the merge is confirmed.

---

## Self-review

**Bead coverage.** `.4` → Task 1 (all ten tints; there is no scrim to tokenise, see Decision 1).
`.13` → Task 2 (z-30, blur-md, shadow-lift, hairline edge, static when short; no `mb-0`, as the bar is
the `space-y` stack's last child; it
doesn't reuse `ActionBar`, per Decision 6, and the phone + tablet geometry runs in CI). `.17` →
Task 3. `.11` → Task 4 (UX4 `scrollWidth`, phone ordinal, Unpin word, replay seeds pins, dead
`ci.yml` path) + Task 5a/5b (sticky notices, hold after 409, `auth_required` mid-round with Sign in, Reload,
`PendingNotices` live region):
all eight items. `.9` → Task 6 (dead `session` arms, `getDraftResult`; `updateResultName` skipped
per the bead note) + Task 7 (the `needs_fallback` copies → `directSubmit`). `.15` → Task 8.
`purses-ejvl` → Task 9. `.14` → Task 10 (home chips). `.24` → Task 11 (one DB lock, e2e
recycles). `.25` → Task 12 (Homebrew fallback). `.26` → Task 13 (doc-check skips tests). `.27` →
Task 14 (charter CI rules). Docs/gates/screenshots → Task 15.

**Placeholder scan.** No TBD. Every code step carries its code. The two conditional branches
(Task 9 Step 3's disable comment only if lint flags the line; Task 5 Step 11's
`getByRole("status")` ambiguity) name the exact edit to make.

**Type consistency.** `Card variant "danger"` (Task 1) is used by both delete sections.
`AsyncActionButton variant "secondary"` (Task 3) is used by `BringBackButton`.
`AUTH_REQUIRED_NOTICE` (Task 5a) is imported by `pendingNotices.test.tsx` and
`PendingDecisionsGate.test.tsx`; `dismissNotice` and the `session_conflict` `sessionId` (5a) are
used by `pendingNotices.tsx`, `CompareChoice.tsx` and both notice tests. `DecisionControls({ onDecision, decisions, priorAnswer })`,
`DeferControl({ onDecision })` and `SetAsideButton({ onDecision })` (Task 6) match every caller
edited in Task 6. `directSubmit({ sessionId, collectionId }, entry)` (Task 7) runs after Task 6
deletes `defer`, so it replaces exactly five copies (four awaited, plus `TriageRound`'s
best-effort one).
`data-selection-bar` / `data-app-shell` (Task 2) match the `globals.css` selectors.
`acquireDbLock` / `releaseDbLock` (Task 11) are used by `with-db-lock.ts`, `global-setup.ts` and
`global-teardown.ts`; `test-db.sh running` (Task 12) is used by `run-db-tests.sh`; Task 11's
`reset` is `down` + `up` on either backend (Task 12's `brew_down` wipes the cluster).

**Review Focus.** Lines 1 to 5 are pinned in Tasks 2, 3, 5, 5 and 7 respectively. The over-cap
height is accepted, with its arithmetic in Task 2 Step 3.
