# Adored UX redesign — PR 5 (polish) implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development`
> (recommended) or `superpowers:executing-plans` to implement this plan task by task. Steps use
> checkbox (`- [ ]`) syntax. Track work in beads (`bd`), never TodoWrite. Never run two implementer
> subagents at once (memory `sdd-never-overlap-implementers`); implementers never run
> `graphify update .` (memory `sdd-implementers-must-not-run-graphify-update`).

**Goal:** Close the epic's polish beads: no inline alpha tints left, the pool's selection bar
matches the PR 3 bottom bar, the archived card's Bring back no longer looks misaligned or overflows,
the PR 2 residual minors are fixed, dead and duplicated sort-client plumbing is removed, the CI e2e
map is fixed, and `eslint-config-next` matches `next`.

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
`purses-ejvl`. Context: `docs/superpowers/plans/2026-10-02-ux-redesign-pr3-lists-home.md` (Task 4,
`ActionBar`; Task 7, the phone-bar geometry pattern) and
`docs/superpowers/plans/2026-10-01-ux-redesign-pr2-sort.md` (the queue, `PendingNotices`,
`RankingList`). PR 4 (#373) is open in parallel and **not** on this branch: `ActionBar`,
`ArchivedItemCard`, `AsyncActionButton` and the rest are as on `main` (`b85d93d9a`).

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
3. **A 401 mid-round.** Today nothing renders, because the sign-in line exists only inside the
   recovery gate. Expected: one quiet "sign in again" line with a Sign in link, never two. Pinned in
   Task 5 (a PendingNotices unit test, plus the gate test's single `getByText`, which throws on
   duplicates).
4. **A tap after the sort was closed elsewhere.** Expected: the cards, Tie, Skip and Undo hold still
   (`aria-disabled`), and nothing new is queued. Pinned in Task 5.
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
   blur-md, shadow-lift, hairline top edge, `mb-0` against a `space-y` parent, static on a short
   viewport). It drops the dead safe-area padding (the viewport is not `viewportFit: cover`, so the
   inset is always 0; see `ActionBar`'s comment). It replaces the in-grid `h-20` spacer, which never
   covered the footer and is shorter than the phone bar, with a `globals.css` reserve keyed on
   `data-selection-bar`: 14rem below `sm`, 9rem from `sm`, none on a short viewport, applied to the
   `AppLayout` root (new `data-app-shell` attribute) and as `scroll-padding-bottom`.
7. **Archived item card:** Bring back becomes a **secondary pill** at natural width
   (`AsyncActionButton` gains `variant="secondary"`). Its visible edge then lines up with the name
   column at the card's `p-3`, with no negative margin and nothing clipped past `overflow-hidden`.
   The busy label becomes the house default "Just a moment…". "Bringing it back…" does not fit a
   147px phone card column. `ArchivedNotice`'s own "Bringing it back…" sits in a full-width notice,
   so it is unchanged.
8. **PR 2 residuals:** the phone ordinal stays visible at `text-xs`/`w-5`. The phone Unpin glyph
   becomes a pin with a slash ("pin-off"), so it reads as the action, not the state. After a 409 the
   compare controls hold (`aria-disabled`, taps ignored). `PendingNotices` keeps one always-mounted
   `role="status"` region and voices `auth_required` with a Sign in link. That copy moves from the
   gate's `GATE_SIGNIN_LINE` to `pendingNotices.tsx` as `AUTH_REQUIRED_NOTICE` (same words), and
   the gate stops rendering its own copy, so the line is never doubled.
9. **CI filter paths must exist.** `scripts/ci-e2e-map.test.ts` gains a check that every literal
   prefix in the `changes` job's path filters exists. It flags four dead paths:
   `src/lib/pairwise-selection.ts` (the bead's), `tailwind.config.ts` (×2; Tailwind 4 has none)
   and `src/hooks/**` (no such directory). All four are removed in the same task.
10. **Dead `session` arms are deleted, not kept "for later".** Every shipped caller of
    `DecisionControls`, `DeferControl` and `SetAsideButton` passes `kind: "local"` (`TriageRound`,
    `WelcomeTriage`). So the prop collapses to `onDecision`. `DecisionControls`' never-varied
    `type` prop goes too (only `"triage"` is ever passed). `TriageUndoProvider.defer` has no caller
    once `DeferControl`'s session arm is gone (`TriageRound` defers through its own `handleNotYet`),
    so it goes as well. `SetAsideUndo.test.tsx` keeps every provider test, driven by a three-line
    test consumer of `useTriageUndo()` instead of the deleted session button.
11. **`getDraftResult` is deleted.** Its only reference is its own definition (grep across `src`,
    `e2e`, `scripts`). `updateResultName` is already gone in PR 4 and out of scope here.
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
  and room reserved below the page. On a short (zoomed) viewport the bar scrolls with the page.
- **Archived item card:** Bring back is a bordered secondary pill (it was a borderless ghost), and
  its busy text is "Just a moment…".
- **Ranking on phone:** a small position number shows on every row, and the phone Unpin glyph is a
  struck-through pin.
- **Mid-round sign-out:** a new quiet line, "Sign in again and your answers will finish saving on
  their own", with a Sign in link.

---

## File map

| Task | Bead | Create | Modify | Delete |
|---|---|---|---|---|
| 1 | `.4` | `src/lib/design/no-inline-tints.test.ts` | `src/components/ui/Card.tsx`, `src/features/profile/DeleteAccountSection.tsx`, `src/features/collections/DeleteCollectionSection.tsx`, `src/features/items/ItemPhotoCarousel.tsx`, `src/components/ui/PhotoViewControl.tsx`, `src/components/theme/ThemeToggle.tsx`, `src/features/results/MostLovedHero.tsx`, `src/features/collections/CollectionCard.tsx`, `src/features/collections/PhotoPoolPreview.tsx`, `src/lib/design/contrast.test.ts` | — |
| 2 | `.13` | — | `src/features/pool/PoolActionBar.tsx`, `src/features/pool/PoolPhotoGrid.tsx`, `src/components/layout/AppLayout.tsx`, `src/app/globals.css`, `e2e/lists-and-home.spec.ts`, `e2e/screenshots/capture.ts` | — |
| 3 | `.17` | — | `src/features/sorting/AsyncActionButton.tsx`, `src/features/items/BringBackButton.tsx`, `e2e/lists-and-home.spec.ts` | — |
| 4 | `.11` (A) | — | `src/features/results/RankingList.tsx`, `e2e/sort-journey.spec.ts`, `src/lib/db/ranking-save-route.integration.test.ts`, `scripts/ci-e2e-map.test.ts`, `.github/workflows/ci.yml`, `e2e/screenshots/capture.ts` | — |
| 5 | `.11` (B) | — | `src/features/sorting/CompareChoice.tsx`, `src/features/sorting/CompareChoice.test.tsx`, `src/features/sorting/pendingNotices.tsx`, `src/features/sorting/pendingNotices.test.tsx`, `src/features/sorting/PendingDecisionsGate.tsx`, `src/features/sorting/PendingDecisionsGate.test.tsx` | — |
| 6 | `.9` (A) | — | `src/features/sorting/DecisionControls.tsx` (+ test), `src/features/sorting/DeferControl.tsx` (+ test), `src/features/sorting/SetAsideButton.tsx`, `src/features/sorting/SetAsideUndo.test.tsx`, `src/features/sorting/TriageUndoProvider.tsx`, `src/features/sorting/TriageRound.tsx`, `src/features/onboarding/WelcomeTriage.tsx`, `src/server/services/SortResultService.ts` | — |
| 7 | `.9` (B) | `src/features/sorting/directSubmit.ts`, `src/features/sorting/directSubmit.test.ts` | `CompareChoice.tsx`, `useOptimisticRound.ts`, `TriageRound.tsx`, `TriageUndoProvider.tsx`, `decisionFlusher.ts` (header comment) | — |
| 8 | `.15` | — | `.github/workflows/ci.yml` | — |
| 9 | `ejvl` | — | `package.json`, `package-lock.json` | — |
| 10 | all | — | `DESIGN.md`, `docs/ARCHITECTURE.md`, `graphify-out/` | — |

Order: the tasks run in sequence. Tasks 4 and 8 both edit `ci.yml` (different lines). Task 7 depends
on Task 6 (`TriageUndoProvider.defer` must be gone first). Task 5 and Task 7 both touch
`CompareChoice.tsx` (different blocks).

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
// A Tailwind opacity modifier on a colour utility (bg-x/30, ring-ink/10, hover:bg-y/40)
// is exactly that. Fractions like w-1/2 or translate-y-1/2 are not colour utilities.
const TINT =
  /\b(?:bg|text|border|ring|outline|fill|stroke|divide|from|via|to|shadow|decoration|placeholder|caret|accent)-[a-z]+(?:-[a-z]+)*\/\d{1,3}\b/g;

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
  text-ink-soft/50`. If the list differs, stop and re-read Decision 2 before going on.

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
          through a long grid); static on a short viewport. mb-0 beats a space-y parent's
          margin (memory fixed-bar-in-space-y-stack). No safe-area padding: the root viewport
          is not viewportFit "cover", so the inset is always 0. globals.css reserves its
          height via data-selection-bar. */}
      <div
        data-selection-bar
        className="fixed inset-x-0 bottom-0 z-30 mb-0 border-t border-hairline bg-glass-strong px-4 py-3 shadow-lift backdrop-blur-md [@media(max-height:500px)]:static"
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
  before `if (only && !only.includes("item-delete-confirm")) return;`:

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
    expect(await pill.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(true); // label never spills
  };
  await fits(/^Bring back$/);
  // Hold the restore open so the busy label can be measured.
  await page.route("**/api/items/*/restore", () => {});
  await tile.getByRole("button", { name: /^Bring back$/ }).click();
  await fits(/just a moment/i);
});
```

- [ ] **Step 2: Run it and see it fail.**
  `npx playwright test e2e/lists-and-home.spec.ts -g "archived card's Bring back" --project=tablet`.
  Expected: FAIL. The busy button is named "Bringing it back…" (no match for `/just a moment/i`), and
  its label spills (`scrollWidth > clientWidth`). If the idle `x` assertion also fails (it
  shouldn't: the ghost button's box already starts at the name's edge; only its text is inset),
  note it in the ledger.

- [ ] **Step 3: Implement.** In `src/features/sorting/AsyncActionButton.tsx`, widen the prop:

```tsx
  variant?: "primary" | "secondary" | "ghost";
```

  `src/features/items/BringBackButton.tsx`:

```tsx
export function BringBackButton({ itemId }: { itemId: string }) {
  const router = useRouter();
  // A bordered secondary pill: its visible edge lines up with the card's name column (p-3)
  // where a ghost's text sat 16px inset; the house busy label fits a 390px two-column card.
  return (
    <AsyncActionButton
      label="Bring back"
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
  PASS. If "Just a moment…" still spills at 390px, change only `BringBackButton`'s
  `busyLabel="One moment…"`, re-run, and log the change as an owner-veto copy item.

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
  - Phone Unpin glyph: replace the comment and `<svg>` inside the Unpin button with:

```tsx
                {/* Phone: a struck-through pin — the action (unpin), not the state (pinned).
                    The accessible name stays "Unpin …". */}
                <svg aria-hidden viewBox="0 0 24 24" fill="none" className="h-5 w-5 sm:hidden">
                  <path d="M9 4h6l-1 6 3 3H7l3-3-1-6zM12 13v7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M4 4l16 16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
```

- [ ] **Step 4: Run and see it pass.** Run the Step 2 command again and expect PASS; then
  `npx vitest run src/features/results/RankingList.test.tsx` and expect PASS. The glyph has no unit
  test: asserting an SVG path string would restate the code. The phone `ranking` screenshot is its
  check (Step 9, Task 10).

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

  Run `npm run test:db -- src/lib/db/ranking-save-route.integration.test.ts`. If the script does
  not forward a path, run `npm run test:db`. This adds coverage, so it may pass on the first run.
  If it fails, that is a real replay bug: stop and use `superpowers:systematic-debugging` before
  touching `SortResultService.saveAndShare`.

- [ ] **Step 6: Failing CI-path test.** Append to `scripts/ci-e2e-map.test.ts`. Change the first
  import to `import { existsSync, readFileSync, readdirSync } from "node:fs";`, then add:

```ts
describe("ci.yml changes filters", () => {
  // A filter path that no longer exists silently selects nothing (e.g. a renamed lib file
  // drops its e2e area). Check each pattern's literal prefix (up to the first '*').
  const filters = ci.slice(ci.indexOf("filters: |"), ci.indexOf("\n  e2e:"));
  const paths = [...filters.matchAll(/^\s+- '([^']+)'$/gm)].map((m) => m[1]);
  it("finds the filter list", () => {
    expect(paths.length).toBeGreaterThan(20);
  });
  it("every literal path prefix exists on disk", () => {
    const missing = paths.filter((p) => {
      const prefix = p.split("*")[0];
      return prefix !== "" && !existsSync(new URL(`../${prefix}`, import.meta.url));
    });
    expect(missing).toEqual([]);
  });
});
```

  Run `npx vitest run scripts/ci-e2e-map.test.ts`. Expected: FAIL with
  `["src/hooks/**", "tailwind.config.ts", "tailwind.config.ts", "src/lib/pairwise-selection.ts"]`.

- [ ] **Step 7: Drop the dead paths** from `.github/workflows/ci.yml`: the `'src/hooks/**'` line
  (under `ui:`), both `'tailwind.config.ts'` lines (under `ui:` and `broad:`), and
  `'src/lib/pairwise-selection.ts'` (under `sort:`). Run the Step 6 command again and expect PASS.

- [ ] **Step 8: Screenshot seed for a pinned row.** In `e2e/screenshots/capture.ts` `beforeAll`,
  change `({ slug, finalizedResultNumber } = await seedSortScenario(ownerId));` to:

```ts
  const sorted = await seedSortScenario(ownerId);
  ({ slug, finalizedResultNumber } = sorted);
  // UX redesign PR 5: one hand-placed piece, so the ranking shot shows Unpin (and its phone glyph).
  await SortResultService.fromDb(getTestDb().db).pinItem(sorted.collectionId, ownerId, sorted.itemIds[1], 1);
```

  Add `import { SortResultService } from "@/server/services/SortResultService";`. Also add a
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
git commit -m "fix(sort): phone ordinal and pin-off glyph, replay keeps pins, dead CI filter paths (purses-w7ss.11)"
```

---

## Task 5: PR 2 residuals B — hold after 409; one live notice region; sign-in mid-round (`purses-w7ss.11`)

**Files:** `src/features/sorting/CompareChoice.tsx` (+ test), `src/features/sorting/pendingNotices.tsx`
(+ test), `src/features/sorting/PendingDecisionsGate.tsx` (+ test).

**Interfaces:**
- Produces: `export const AUTH_REQUIRED_NOTICE = "Sign in again and your answers will finish saving on their own";`
  in `pendingNotices.tsx`. `GATE_SIGNIN_LINE` is removed from `PendingDecisionsGate.tsx`.

- [ ] **Step 1: Failing test, hold after 409.** Add to `CompareChoice.test.tsx` after "a sort closed
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
```

- [ ] **Step 2: Failing tests, notices.** In `pendingNotices.test.tsx`, add `AUTH_REQUIRED_NOTICE`
  to the import from `./pendingNotices` and to the TONE loop's array. Then add:

```ts
describe("PendingNotices — one live region", () => {
  it("the status region exists, empty, before any notice arrives (SC 4.1.3)", async () => {
    global.fetch = vi.fn(async () => ({ ok: false, status: 409, json: async () => ({}) })) as unknown as typeof fetch;
    render(<PendingNotices />);
    const region = screen.getByRole("status");
    expect(region).toBeEmptyDOMElement();
    await enqueue(key, {
      kind: "decision", clientKey: newClientKey(), type: "triage",
      decision: { itemId: realItemId(), result: "top" }, enqueuedAt: new Date().toISOString(),
    });
    await act(async () => {
      await drain([key]);
    });
    expect(region).toHaveTextContent(SESSION_CONFLICT_NOTICE); // the same node, now with text
  });
});

describe("PendingNotices — signed out mid-round", () => {
  it("a 401 says to sign in again, with a Sign in link", async () => {
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
    expect(screen.getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
  });
});
```

  In `PendingDecisionsGate.test.tsx`, change the import `GATE_SIGNIN_LINE` → `AUTH_REQUIRED_NOTICE`
  from `./pendingNotices`, and in the 401 test use
  `expect(screen.getByText(AUTH_REQUIRED_NOTICE)).toBeInTheDocument();`. `getByText` throws on two
  matches, so this test now guards against a doubled line.

- [ ] **Step 3: Run them and see them fail.**
  `npx vitest run src/features/sorting/CompareChoice.test.tsx src/features/sorting/pendingNotices.test.tsx src/features/sorting/PendingDecisionsGate.test.tsx`.
  Expected: FAIL for three reasons. The hold test (`aria-disabled` is absent, and `enqueue` is
  called). `getByRole("status")` (no region while empty). `AUTH_REQUIRED_NOTICE` (not exported).

- [ ] **Step 4: Implement the hold** in `CompareChoice.tsx`:
  - `const busy = pending !== null || undefined;` → `const busy = pending !== null || closedElsewhere || undefined;`
  - In `choose`, change `if (pendingRef.current) return;` to
    `if (pendingRef.current || closedElsewhere) return; // closed elsewhere: nothing more can land`
  - In the Undo/Keep going `onClick`, change `if (pendingRef.current) return;` to
    `if (pendingRef.current || closedElsewhere) return;`

- [ ] **Step 5: Implement the notices** in `pendingNotices.tsx`:
  - Add `import Link from "next/link";`.
  - Add the constant after `SESSION_CONFLICT_NOTICE`:
    `export const AUTH_REQUIRED_NOTICE = "Sign in again and your answers will finish saving on their own";`
  - `NOTICE_COPY` gains `auth_required: AUTH_REQUIRED_NOTICE,`.
  - Replace everything from `const visible = …` to the end of the component with:

```tsx
  const visible = [...active].filter((kind) => !dismissed.has(kind));

  // ONE region, mounted empty, so a line that lands is announced (a live region that
  // appears together with its text is not). The lines inside carry no role of their own.
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      {visible.map((kind) => (
        <p
          key={kind}
          className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-control bg-content-soft px-4 py-3 text-sm text-ink-soft"
        >
          <span>{NOTICE_COPY[kind]}</span>
          {kind === "auth_required" && (
            <Link
              href="/login"
              className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-xs"
            >
              Sign in
            </Link>
          )}
          <button
            type="button"
            onClick={() => setDismissed((prev) => new Set(prev).add(kind))}
            className="font-medium text-primary underline underline-offset-2 hover:text-primary-hover focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary rounded-xs"
          >
            Okay
          </button>
        </p>
      ))}
    </div>
  );
```

  - Update the doc comment's first line to: "The quiet person-side notice slot (one always-mounted
    live region): …", and note that it voices `auth_required` with a Sign in link.

- [ ] **Step 6: Gate stops voicing it.** In `PendingDecisionsGate.tsx`, delete the
  `GATE_SIGNIN_LINE` export and the `{authRequired && (<p role="status" …>…</p>)}` block in
  `noticeSlot`, so the `PendingNotices` in the same slot voices it. Keep the `authRequired` state
  (it still drives `revealed` and skips the refresh). If `Link` is now unused, remove its import.
  Update the comment above `noticeSlot`: "…the same slot the round surfaces use, including the
  sign-in line…".

- [ ] **Step 7: Run and see them pass.** Run the Step 3 command again and expect PASS. Then run
  `npx vitest run src/features/sorting src/app/collections` and expect PASS. If another test now
  hits two `role="status"` nodes through `getByRole("status")`, change only that query to
  `getByText(<its copy>)`, and list each one in the commit body.

- [ ] **Step 8: Commit.**

```bash
git add src/features/sorting/CompareChoice.tsx src/features/sorting/CompareChoice.test.tsx \
  src/features/sorting/pendingNotices.tsx src/features/sorting/pendingNotices.test.tsx \
  src/features/sorting/PendingDecisionsGate.tsx src/features/sorting/PendingDecisionsGate.test.tsx
git commit -m "fix(sort): hold compare after a 409; one live notice region that also voices sign-in (purses-w7ss.11)"
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
    mocks, `installStorage`, `beforeEach` and the provider import. Keep the two local tests,
    rewritten to `<DeferControl onDecision={onDecision} />`. Remove the "renders the same visual
    button … as session mode" comparison and keep its title/aria-label assertions as
    "conveys 'Keeps it for later' for hover and assistive tech".
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
    test "local mode renders WITHOUT a TriageUndoProvider…" (that case is now just a plain
    `onDecision` button, covered by a new test in `DeferControl.test.tsx`'s style). Add this to
    `DeferControl.test.tsx` instead:

```ts
it("Not mine (SetAsideButton) is one quiet tap that calls onDecision — no provider needed", async () => {
  const onDecision = vi.fn();
  render(<SetAsideButton onDecision={onDecision} />);
  await userEvent.click(screen.getByRole("button", { name: "Not mine — sets it aside" }));
  expect(onDecision).toHaveBeenCalledTimes(1);
});
```

    with `import { SetAsideButton } from "./SetAsideButton";`.

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

    Delete the `useState` and `useOptionalTriageUndo` imports.
  - `TriageUndoProvider.tsx`: delete `defer` (the function, its comment, `defer` in the context
    value, and `defer` in the `TriageUndoContextValue` type). Update the comment at line ~57 that
    says the walkthrough renders `SetAsideButton` in "local" mode to: "The walkthrough's buttons
    take a plain onDecision and never touch this provider."
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
  `grep -rn 'kind: "local"' src --include='*.tsx' | grep -v CompareChoice` → only
  `CompareChoice`-related lines (its `submit` keeps both arms: the walkthrough's compare is local
  and the sort page's is session).

- [ ] **Step 6: Commit.**

```bash
git add src/features/sorting/DecisionControls.tsx src/features/sorting/DecisionControls.test.tsx \
  src/features/sorting/DeferControl.tsx src/features/sorting/DeferControl.test.tsx src/features/sorting/SetAsideButton.tsx \
  src/features/sorting/SetAsideUndo.test.tsx src/features/sorting/TriageUndoProvider.tsx src/features/sorting/TriageRound.tsx \
  src/features/onboarding/WelcomeTriage.tsx src/server/services/SortResultService.ts
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
      "set_aside / deferred POST the collection's dispositions",
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
// a flush, the island sends this ONE entry directly and awaits it. Same routes and bodies the
// flusher uses; a network throw reads as "not landed" so each island shows its own gentle line.
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
    `if (persisted === "needs_fallback") await directSubmit({ sessionId, collectionId }, entry); // best-effort: the piece still waits at the end and returns next visit`
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
  fallback (F18)" and `TriageRound.test.tsx` all stay green unchanged).

- [ ] **Step 7: Commit.**

```bash
git add src/features/sorting/directSubmit.ts src/features/sorting/directSubmit.test.ts src/features/sorting/CompareChoice.tsx \
  src/features/sorting/useOptimisticRound.ts src/features/sorting/TriageRound.tsx src/features/sorting/TriageUndoProvider.tsx \
  src/features/sorting/decisionFlusher.ts
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

**Files:** `package.json`, `package-lock.json`.

- [ ] **Step 1:** `npm install -D eslint-config-next@^16.3.8`.
- [ ] **Step 2:** Verify:
  `grep -n '"eslint-config-next"' package.json` → `"^16.3.8"`;
  `grep -n '"node_modules/eslint-config-next"' -A1 package-lock.json` → `"version": "16.3.8"`;
  `git diff --stat` → only `package.json` and `package-lock.json`.
- [ ] **Step 3:** Run `npm run lint`; expect it clean. If the new config raises findings, fix
  them in place only when the fix is mechanical and behaviour-free. Otherwise stop and report the
  rule names (do not disable rules). Then run `npm run build` and expect success. The
  `osv-scanner.toml` `braces` entry stays (Decision 12).
- [ ] **Step 4: Commit.**

```bash
git add package.json package-lock.json
git commit -m "chore(deps): eslint-config-next ^16.3.8 to match next (purses-ejvl)"
```

---

## Task 10: Docs, full gate, graphify, screenshots

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
  `.github/workflows/` (→ ARCHITECTURE/DEPLOYMENT; confirm no listed fact moved). Commit:
  `git add DESIGN.md docs/ARCHITECTURE.md && git commit -m "docs: danger card, selection bar, tint scan (PR 5)"`.
- [ ] **Step 4: Full gate.** Record each command and its result for the PR body:
  `npm run lint && npm run test:ci && npm run build && npm run auth:verify && npm run test:db`,
  then `npm run test:e2e`. The change touches `src/components/ui/**`, `**/*.css`, `package.json`
  and `e2e/**`, which are broad paths, so CI runs the full suite. Catch failures locally first.
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
  `SHOTS=pool-selected,home-archived,profile,collection-settings,item-detail-story,ranking,collections,home-pool-first npx playwright test -c playwright.screenshots.config.ts --project=tablet`,
  then the same with `PW_VIEWPORT=phone` in place of `--project=tablet`. That is light and dark ×
  tablet and phone. **Look at every PNG before the final review** (memory
  `ux-redesign-pr1-lessons`). Check that the pool bar has the hairline edge and shadow, and does not
  cover the last tile in the viewport shot. On the archived card, the Bring back pill's edge must
  meet the name's edge and stay inside the card. The danger rim should read as sober, not loud, in
  both themes. On the phone ranking, a small ordinal shows, and the pin-off glyph reads as
  "unpin". The dots show one wider current dot. The placeholder glyphs on the collections and pool
  previews must not shout in dark mode. A full-page phone shot paints the fixed bar at the fold
  (memory `phone-fullpage-capture-fixed-bar-artifact`); judge the bar from `pool-selected` (a
  viewport shot). There is no dialog scrim to capture (Decision 1).
- [ ] **Step 9: PR body.** Include the gate results, the screenshot table (light | dark per
  surface, tablet and phone), the owner-veto list above verbatim, and "Closes" lines for
  `purses-w7ss.4`, `.13`, `.17`, `.11`, `.9`, `.15` and `purses-ejvl`. Beads close only in
  `/close-out`, after the merge is confirmed.

---

## Self-review

**Bead coverage.** `.4` → Task 1 (all ten tints; there is no scrim to tokenise, see Decision 1).
`.13` → Task 2 (z-30, blur-md, shadow-lift, hairline edge, static when short, `mb-0`; it
doesn't reuse `ActionBar`, per Decision 6, and the phone + tablet geometry runs in CI). `.17` →
Task 3. `.11` → Task 4 (UX4 `scrollWidth`, phone ordinal, Unpin glyph, replay seeds pins, dead
`ci.yml` path) + Task 5 (hold after 409, `auth_required` mid-round, `PendingNotices` live region):
all eight items. `.9` → Task 6 (dead `session` arms, `getDraftResult`; `updateResultName` skipped
per the bead note) + Task 7 (the `needs_fallback` copies → `directSubmit`). `.15` → Task 8.
`purses-ejvl` → Task 9. Docs/gates/screenshots → Task 10.

**Placeholder scan.** No TBD. Every code step carries its code. The two conditional branches
(Task 3 Step 4's busy-label fallback; Task 5 Step 7's `getByRole("status")` ambiguity) name the
exact edit to make.

**Type consistency.** `Card variant "danger"` (Task 1) is used by both delete sections.
`AsyncActionButton variant "secondary"` (Task 3) is used by `BringBackButton`.
`AUTH_REQUIRED_NOTICE` (Task 5) is imported by `pendingNotices.test.tsx` and
`PendingDecisionsGate.test.tsx`. `DecisionControls({ onDecision, decisions, priorAnswer })`,
`DeferControl({ onDecision })` and `SetAsideButton({ onDecision })` (Task 6) match every caller
edited in Task 6. `directSubmit({ sessionId, collectionId }, entry)` (Task 7) runs after Task 6
deletes `defer`, so it replaces exactly five copies (four awaited, plus `TriageRound`'s
best-effort one).
`data-selection-bar` / `data-app-shell` (Task 2) match the `globals.css` selectors.

**Review Focus.** Lines 1 to 5 are pinned in Tasks 2, 3, 5, 5 and 7 respectively. The over-cap
height is accepted, with its arithmetic in Task 2 Step 3.
