# Plan 4 — Deferred metadata: gentle "could use details" surfacing (design DRAFT)

**Date:** 2026-06-14
**Issue:** purses-b1k (bulk image upload — upload-first, defer metadata), **phase 4 — the final phase of the epic.**
**Builds on:** Plan 2 (pool), Plan 3a (catalog-number URLs + nullable name), Plan 3b (grouping).
Governed by [`TONE.md`](../../TONE.md) (first-order), [`PRODUCT.md`](../../PRODUCT.md), [`DESIGN.md`](../../DESIGN.md).
Parent design: [`2026-06-10-bulk-upload-pool-design.md`](./2026-06-10-bulk-upload-pool-design.md) (§ "Deferred metadata").

> **Status: APPROVED (2026-06-14)** — owner accepted the recommended defaults ("go with your defaults").
> See **Resolved decisions** at the bottom; the ▶ markers below are kept for context. The executable
> TDD plan lives alongside this doc.

## Resolved decisions (2026-06-14)

1. **"Could use details" = `name IS NULL`.** A name turns a row into a story; other fields are optional extras, not deficiencies.
2. **Ship both** the calm card cue and the opt-in "waiting for a name" filter.
3. **Defer** the guided one-at-a-time naming flow.

**Implementation refinement (simpler than the phases below):** filtering by `name IS NULL` is **in-page**, matching the existing status filter (`items.filter(...)`) — **no new repo/DB method.** The "needs a name" test is just `!item.name`. So Plan 4 is three presentational pieces + one pure, unit-tested helper:
- **Card cue** — a nameless `ItemCard` shows a calm `Add a name` hint (ink-soft, where the brand sub-line sits); the card still links to the item detail (no special-cased navigation, no nested interactive element).
- **Opt-in filter** — a `Waiting for a name` toggle in `ItemFilters` via a new `?unnamed=1` searchParam (off by default, **no count in the label**); the items page applies `!item.name` when on, preserving the existing `status` filter.
- **Detail-page affordance** — a nameless item's detail page shows a calm, honest `Add a name` link (to the existing `/edit` form) in the title area; named items just show the name.
- **Pure helper** `filterItems(items, { status, unnamed })` — extracted so the filter logic is unit-tested in node (behavior, not just render).

## Goal

Close the loop the epic opened: people dump photos fast (Plan 2), group them into items (Plan 3b),
and **come back to add details — name, and the rest — at their own pace, or never.** Photo-only and
nameless items are first-class (Plan 3a). Plan 4 gives a person a **gentle, opt-in** way to find and
return to items that have nothing but a photo — **never a nag, never a count of "incomplete" things.**

The driving tension: this feature's whole reason to exist is "fill in later," but the obvious
implementations (a red badge, "12 items incomplete", a completion bar) are precisely the
shaming/gamification `TONE.md` forbids (commitments 1 and 4). The design's job is the gentle version.

## What counts as "could use details"

▶ **Decision 1.** Recommendation: an item "could use details" when it **has no name** (`name` is null).
The catalog number and photo already identify it; a name is the one thing that turns a row into a
story. Brand/material/dimensions/etc. are optional extras, not a deficiency — so they do **not** make
an item "need details." This keeps the signal about *the object's story*, not field-completeness.
(Alternative: name-or-no-descriptive-fields-at-all. I recommend **name-only** — simpler, and truest to
"each object is a story, not a data row.")

## Where the surfacing lives

The collection's **items grid** already renders every item (named and nameless, via `itemDisplayName`).
Two complementary, **opt-in** surfaces — no always-on badges:

1. **A quiet affordance on a nameless item's own card / detail page** — not a warning marker, but an
   inviting, person-side prompt where the name would be (e.g. a soft "Add a name" / "Tell its story"
   affordance in the spot `itemDisplayName` currently fills with `#N`). It reads as an *invitation*,
   present only on cards that have no name, styled as calm (ink-soft, not error/spark). Tapping it opens
   the existing `ItemEditForm` focused on the name field.
2. **An opt-in filter on the items page** — a calm, secondary toggle ("Items still waiting for a name"
   or similar) that the person chooses to turn on. **Off by default. No count in the label.** When on,
   the grid shows only the nameless items so a person who *wants* to sit and name things can.

▶ **Decision 2.** Both surfaces, or just the card affordance (defer the filter)? Recommendation:
**both** — the card affordance serves the incidental "oh, I'll name this now" moment; the filter serves
the deliberate "I have ten minutes, let me name some" moment (the unhurried, loving pass). Each is
opt-in and tone-safe.

## The "fill it in" interaction

Tapping the affordance opens the **existing `ItemEditForm`** (name/brand/style/color/material/category/
notes) — no new form. Save returns to where you were.

▶ **Decision 3.** Offer a gentle **one-at-a-time flow** ("name these, one by one") from the filter view,
or just let people tap cards individually? Recommendation: **defer the guided flow** to a follow-up.
Individual tap-to-edit honors "one decision at a time" without building a queue that could *feel* like a
chore-list (the very thing we're avoiding). Ship the calm surfaces first; add a guided flow later only
if people want it.

## TONE guardrails (non-negotiable, first-order)

- **No counts of incompleteness.** No "12 items need details", no completion %, no progress bar.
- **No warning styling.** The affordance is an *invitation* (calm, ink-soft), never error/spark/badge.
- **Person-side copy.** "Add a name" / "Tell its story" — not "Incomplete", "Missing info", "Finish".
- **Opt-in only.** The filter is off by default; nameless items are never hidden or flagged unless asked.
- **Never the headline.** Naming follows from affection ("which do you love?"), it is not a task list.

## Scope

**In:** the nameless-item card affordance; the opt-in "waiting for a name" filter on the items page;
wiring both to the existing edit form; tests + a11y + both themes.

**Out / future:** a guided one-at-a-time naming flow (Decision 3); surfacing dimensions/weight/unit in
the edit form (those fields exist in the schema since 3a but aren't in `ItemEditForm` yet — they're
captured-now-for-the-future "what fits" feature, out of scope here); bulk metadata editing.

## Proposed build phases (to become the TDD plan after the ▶s are settled)

1. **Repo/query:** a `findNamelessByCollection` (or a `nameless` filter on the existing items query) —
   `items WHERE name IS NULL` for a collection. DB-tested.
2. **Card affordance:** the nameless-item card/detail shows the calm "Add a name" invitation in the
   name slot; tapping deep-links to the edit form focused on name. Component-tested + a11y.
3. **Opt-in filter:** a calm toggle on the items page (off by default, no count) that filters to
   nameless items via the query from phase 1. Tested.
4. **Gates + light/dark screenshots + PR.**

## Open decisions, collected

- ▶ **1.** "Could use details" = **no name** (recommended) vs. no-descriptive-fields-at-all.
- ▶ **2.** Ship **both** the card affordance and the opt-in filter (recommended) vs. card only.
- ▶ **3.** **Defer** the guided one-at-a-time naming flow (recommended) vs. include it now.

## Note: the alternative "next step"

Plan 4 **finishes the bulk-upload epic** (its stated purpose was "upload-first, *defer metadata*" — this
is the defer-and-return half). The alternative next step is **purses-42y** (regroup: move/split/merge +
"make each its own item") — grouping ergonomics, valuable but not on the epic's critical path. My
recommendation is Plan 4 to close the epic; say the word if you'd rather do 42y first.
