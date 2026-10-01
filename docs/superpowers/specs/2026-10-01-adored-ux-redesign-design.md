# Adored UX redesign — design spec

Date: 2026-10-01 · Rev 2 after adversarial review (UX, Graphic Design, Architect, QA, Craftsman) ·
Status: for owner review.

Owner decisions already taken: PRODUCT.md and TONE.md v2 (pre-marketplace, familiar layouts,
swipe where native); visual direction **Frosted shelf** from the brainstorm companion
(`.superpowers/brainstorm/97702-1790837089/content/visual-directions.html`).

## 1. Why

Editing one object is spread over four screens; a first sort takes 9 to 12 screens with three
ways to start and four ways to resume; every "See results" tap creates another draft. The owner
wants the app recognisable to resale-app users, but cozier.

## 2. Goals and non-goals

Goals: (1) one item panel, (2) one sort path to a saved ranking, (3) a modern, cozy frosted
sea-glass look. Non-goals: prices, offers, carts, listing to a marketplace; new decision types;
new auth or sharing semantics.

## 3. Part A — the item panel

**Route.** `/collections/[id]/items/[itemNumber]` is the only item surface. `…/edit` and
`…/photos` become `page.tsx` files that redirect here *after* the DAL guard (so a stranger still
gets 404, and the page-authz enumeration test is updated in the same PR).

**Layout.** Tablet: carousel left, fields right. Phone: stacked, fields below the carousel.

- **Carousel.** One photo at a time, cover first then upload order (the existing order; no new
  column). Prev/next arrows, dots, keyboard arrows, native swipe. Tap the photo for the zoom view
  (existing viewer: pinch/buttons, rotate saved).
- **Thumbnail strip.** Tap to jump. Each thumbnail has a visible `···` button (44px) with
  **Make cover** (sets the existing hero flag) and **Delete** (one sober confirm; stays a hard
  delete as today). The last tile is **+ Add photos**, which reuses the pool's multi-file uploader
  and attaches to this item. No drag reorder. *Deferred:* arbitrary order; add a `position` column
  only when someone asks.
- **Fields.** One form, always editable, as a listing form: Name, Brand, Style, Colour, Material,
  Category, Size (height × width × depth with a unit toggle, collapsed under "Size"), Weight,
  Notes, "Where will it go next?" (story). One quiet **Save** button appears when something has
  changed, with a route-leave guard while unsaved. The form reuses the existing item PATCH.
  Empty fields show a soft prompt ("Add a brand"); never a count of what is missing. A blank Name
  reverts to the previous value with a gentle line ("Give it a name to save").
  *Deferred:* per-field autosave; revisit after the form ships if people ask for it.
- **"In your life" chip.** A tri-state chip on the panel (unset / I use this / Resting), unset by
  default, writing a usage decision only when tapped. It replaces the usage round.
- **Header and actions.** Name as display type; "#14 · added in June". Overflow `···` top-right:
  **Archive** (reversible) and, owner only, **Delete** (hard delete). No Edit, Save-page, "Manage
  photos", Share, or "Sort from here" controls.
  - Archive = the existing soft delete (`deletedAt`) and restore. Archived items leave the sort and
    the live ranking but stay in saved rankings. Archiving shows an Undo notice and returns to the
    items list; the list's current "Deleted" filter is renamed **Archived**.
  - Delete = the existing purge. If the item is in a saved ranking the server answers 409 and the
    panel says "This one is part of a saved ranking" with a link to remove it from rankings first.
- **Items list.** Card grid (2 columns phone, 3 to 4 tablet): cover photo, name, brand, one tier
  chip if sorted. Search field and filter pills (All, Archived, Waiting for a name). A selected
  pill shows a border plus a check, never colour alone.

**API change (the one needed).** Extend the item update schema with `height`, `width`, `depth`,
`weight` (numeric, nullable), `unit` (`imperial` | `metric`), make text fields nullable so a clear
persists, and mark the schema strict so an unknown key is a 400, never a silent 200. The unit
toggle relabels; it does not convert stored numbers.

## 4. Part B — the sort

Four screens. Vocabulary is fixed: tiers Love / Like / Maybe / Onward; escapes Not yet / Not mine;
"Set aside" only ever means an item set aside with Not mine. No timer. *Deferred:* the round timer
and its dial, `/tutorials/timers`, and the ring tokens are removed; bring back only if asked.

1. **Start.** Collection home has one primary button: **Start sorting**, or **Keep sorting** when
   a session is active or paused. "Keep sorting" resumes the existing session (reactivating a
   paused one); otherwise a new session is created with server-side defaults for goal.
   Removed: the goal form, the sort index, the hub, "Set a goal first".
2. **Sort** at `/collections/[id]/sort` (replaces today's `sort/page.tsx`). One screen, two
   phases in order, never interleaved:
   - *Feelings.* "How do you feel about this one?" → Love / Like / Maybe / Onward, with quieter
     **Not yet** (returns at the end of this phase) and **Not mine** (set aside). Every live item
     passes through once.
   - *Pairs.* A one-line transition ("Now, between these two…"), then "Which would you reach for
     first?" with Tie and Skip, over the **comparable set = Love + Like only**. The same set rule
     is applied in pair selection and in order derivation so the ranking agrees by construction;
     `next-round.ts` is retired. Within the ranking, items order by tier first, then by derived
     order within the tier.
   - Controls: **Undo** (shows the last answer: "Undo: Love"), **Pause** (returns home; session
     paused), the nav back arrow for leaving. A numberless thin progress line with the count in
     screen-reader text only; Not yet and Not mine are outside the denominator.
   - *End.* When pairs are exhausted: "That's everything for now" and a single button to the
     Ranking. No celebration.
3. **Ranking** at `/collections/[id]/results`: the live standing. "What you love most" first,
   then the ordered list with photos, an Onward row, a quiet **Still deciding** row for Not yet
   items, and a collapsed **Set aside** row with **Bring back**. Reachable from home and from the
   Sort screen. Viewing creates nothing (regression test, see §7).
   - *Adjusting.* Drag or up/down. The first adjustment lazily creates **the one open draft** for
     this collection and curator and stores the manual order there (existing `manualRank` /
     `manualBucket`); later adjustments reuse it. Enforced by a partial unique index on
     `sort_results(collection_id, curator_id) WHERE status = 'draft'`. Later pair answers do not
     move a manually placed item; a small **Unpin** returns it to the derived order.
4. **Save and share.** One button on the Ranking: name it (prefilled with the collection name and
   date), then one server action runs create-or-reuse draft → finalize → create share link in a
   single transaction with an idempotency key, closes the session, and shows the link. Saved
   rankings stay at `/collections/[id]/results/[resultNumber]`, immutable. **Make a revision**
   opens a new copy to adjust (the existing supersede); the old link keeps showing the old order,
   and saving the revision issues its own link. The next "Keep sorting" starts a new session over
   the curator-wide decision log.

Removed: `sort/new`, `sort/[s]`, `sort/[s]/triage|usage|compare`, `sort/set-aside`,
`results/set-aside`, round recaps, "Take a break", session set-aside, "Adjust results" mode.
Redirects (all `page.tsx` after the DAL guard): the five `sort/…` routes →
`/collections/[id]/sort`; `sort/set-aside` and `results/set-aside` → `/collections/[id]/results`.

**Onboarding.** The welcome walkthrough and `/tutorials/sort` teach "three short rounds"; PR 2
rewrites them to the two phases.

**Live data on deploy.** Existing drafts stay reachable at `results/[n]`; the lazy-draft rule
applies only to new adjustments (one open draft is reused if it exists, else the newest draft is
reused). Paused sessions resume through Keep sorting. Sessions already set aside (soft-deleted)
stay excluded; their decisions are not restored. This is an accepted loss; the owner is the only
user with such sessions today.

## 5. Part C — the look (Frosted shelf)

**Principle: AA is guaranteed by the surface's own opacity, never by what is behind it.**

- **Glass that carries text and may sit over photos or scrolling content** (sticky header,
  phone bottom bar, the item panel, sheets): `--color-glass-strong`, white at **≥ 0.85** in light
  (teal at ≥ 0.85 in dark), with backdrop blur. At most three such surfaces per screen.
- **Decorative glass** that only ever sits over the static wash (section backgrounds, the chip
  row): `--color-glass`, white at ~0.5, **no backdrop-filter**.
- **Cards** in grids: a pre-composited near-opaque fill (`--color-surface-raised` with alpha
  0.9), no backdrop-filter, so a scrolling grid stays cheap on an iPad.
- **Ground:** `--color-ground` becomes a pale sea-glass gradient with two soft washes (aqua,
  mint), declared as two stops so the contrast test can composite against both extremes.
- **Fallbacks:** under `@supports not (backdrop-filter: blur(1px))` and
  `prefers-reduced-transparency: reduce`, every glass token resolves to its opaque surface
  token. Reduced motion is a separate preference and only affects transitions.
- **Accent:** keep `primary #004a67` light and the existing dark primary; no "brighter" teal (it
  tests worse). Marigold stays the one spark; no mint accent.
- **Tokens (named, dark counterparts required):** `--color-glass`, `--color-glass-strong`,
  `--color-rim`, `--shadow-lift`, `--color-chip`, `--color-chip-ink`, `--radius-card: 20px`,
  `--radius-pill: 999px`. Per-component inline tints are banned. For every translucent token the
  stylesheet also declares its composited hex over the lightest and darkest ground stop (and
  over black and white for `glass-strong`); `contrast.test.ts` asserts the text pairs against
  those.
- **Lists and home:** search plus filter pills on top, card grid, overflow menus; a fixed bottom
  action bar on phone for the one primary action. Collections list becomes a grid of cover-photo
  cards; collection home becomes the items grid with **Start sorting** as the single primary
  action and an **Add photos** pill beside it.

**DESIGN.md amendments (shipped in PR 1):** card radius 16 → 20px; buttons and inputs 10px →
pill; elevation rule gains "or translucency + rim" for glass surfaces; theme names stay Sea Glass
/ Sea Glass at Night ("Tide pool" was a working name); the new tokens and the opacity principle
above are added; "no swiping" is removed.

## 6. Data and API summary

- Items: no new columns. Update schema extended and strict (§3). Archive = soft delete.
- Photos: no new columns. Cover = hero flag; order = hero first, then upload order.
- Sessions: goal defaults server-side; the timer setting is removed. Usage decisions arrive from
  the panel chip through the existing decision route; untouched means no decision.
- Results: one open draft per collection and curator (partial unique index, one migration, no
  data rewrite). Save is one transaction with an idempotency key. Supersede stays.
- Redirects: `page.tsx` files after the DAL guard, listed in §3 and §4; the authz enumeration
  test is updated in the same PR.

## 7. Testing

Every behaviour below has a test that runs in CI, at the cheapest tier that proves it.

| Behaviour | Tier |
|---|---|
| Form save persists size/weight/unit; unknown key → 400; blank name reverts | unit (route schema) + one un-mocked PATCH crossing |
| Route-leave guard while unsaved | unit |
| Make cover leaves exactly one hero | DB (existing invariant; keep its test) |
| Archive hides from sort and live ranking, keeps in saved ranking; Archived filter | DB (one crossing) |
| Delete 409 path message | unit |
| Phase chooser: feelings until every live item is placed, then pairs over Love+Like | unit |
| Comparable set identical in selector and order derivation | unit |
| Undo reverts the last decision in both phases | unit |
| Pause keeps progress; Keep sorting resumes paused | DB (one crossing) |
| Not yet returns at phase end; Not mine → Set aside → Bring back | unit + e2e journey |
| Viewing the ranking creates no draft (the bug in §1) | DB regression |
| One open draft per collection+curator; second adjust reuses it | DB (unique index) |
| Pins survive later pair answers; Unpin | unit |
| Save and share atomic; retry with same key creates nothing new; session closed | DB (one crossing) |
| Revision is a new copy; old link unchanged | DB (existing supersede test) |
| Redirects after guard; stranger 404 | authz enumeration test (updated) |
| Glass tokens AA over both ground stops and black/white | unit (contrast test, composited hexes) |
| Selected pill not colour-only | e2e a11y |

E2E (tablet, in CI): two journeys replace the removed flows: *panel* (add photos → edit → archive
→ bring back) and *sort* (start → feelings for 5 items → pairs → end → ranking → save and share →
open link). Phone runs of both are a local pre-PR gate (`PW_VIEWPORT=phone`), not CI.

**Old spec → new spec map** (each PR deletes only the specs its replacement covers; bug guards
move with them):

| Removed e2e spec | Replacement |
|---|---|
| item-page, delete-photo, image-rotate, delete-item | panel journey + unit tests above |
| sort-session, usage-round, compare, timer-ring, session-pause, session-undo, session-create-after-set-aside, not-yet-defer, not-mine-set-aside, decision-recovery | sort journey; the recovery and undo guards become unit tests on the phase chooser and Undo |
| results, results-onward, results-rerank, shared-results | sort journey (ranking, adjust, save, link) |
| welcome-walkthrough | rewritten for two phases |
| a11y | screens updated to panel, sort, results, with `toHaveURL` after each goto |

CI selection: each PR updates both halves of the e2e area map in `ci.yml`, and PR 1 adds a cheap
check that every `e2e/*.spec.ts` appears in the floor or an area and that every listed spec exists.

## 8. Delivery

1. **PR 1 — tokens, card, item panel.** Glass tokens + contrast test + DESIGN.md amendments; card
   component; item panel; item schema change; items list; redirects for edit/photos; e2e map check.
2. **PR 2 — sort, ranking, save.** Sort screen, ranking with lazy draft and pins, atomic save,
   unique index migration, redirects for sort routes, onboarding rewrite, old sort specs replaced.
3. **PR 3 — lists and home.** Collections grid, home-as-grid, phone bottom bar.

Each PR carries light, dark, and phone screenshots.

## 9. Owner decisions in this revision

- Timer removed (review: urgency on routine decisions; no round to time). Say so if you want it.
- Weight kept, under "Size".
- Not yet and Not mine both kept (different meanings, existing data values).
