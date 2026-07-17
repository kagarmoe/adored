# Pool polish: visible cover cue, actionable handoff, visible cap — design

**Date:** 2026-07-17 · **Epic:** purses-id3f (all four children) · **Branch:** feat/pool-polish
**Provenance:** all four items were adversarially verified in the design-system reconciliation (pool-item-creation area) with file evidence; owner pre-approved the epic and granted overnight execute-and-merge authority. The pool's flows already work — this is polish only; no API/DB changes except reading an existing server error message.

## Verified current state

- `PoolPhotoGrid` records selection order; `selected[0]` silently becomes the item's hero/cover — the badge on it looks identical to every other selection ✓.
- The group/each success notice is plain text, auto-dismissed after 4 s, with no link to the created item(s); the server returns `{number}` (combine) / `{count}` (each).
- `MAX_GROUP_PHOTOS` (50) is enforced server-side; the client shows a generic error and discards the server's gentler message. Over-selection is invisible until failure.
- Pool page intro says "Dump everything in fast"; the mobile action-bar label is a cryptic "Each".

## Changes

1. **Cover cue (purses-id3f.x "cover cue"):** the badge on `selected[0]` becomes a **"Cover"** pill (label text instead of the ✓, distinct fill — use an existing token pair that passes AA, e.g. spark/spark-ink family; never a new hex) and `PoolActionBar` gains a one-line hint when ≥1 selected: **"The first photo you tapped becomes the cover."** The one-tap flow is unchanged (no extra screen — PRODUCT wins over the wireframe's set-hero step; the deviation is already documented in the reconciliation).
2. **Actionable success notice:** the notice becomes a link — combine: **"Item #N is ready — take a look."** → `/collections/[id]/items/[number]`; each: **"N items are ready — see them all."** → `/collections/[id]/items`. **Link-bearing notices do not auto-dismiss**; they clear on the next selection/action (the 4 s timer stays for plain notices). Staying on /pool is right for batch flows — the link is an offer, not a redirect.
3. **Visible cap + server message passthrough:** when `selected.length > MAX_GROUP_PHOTOS`, the action bar shows **"50 at a time — pare the selection down a little."** inline and disables Group/Each/Move (not Clear). `groupPool`/`moveTo` parse the error body and surface the server's `message`/`error` string when present, falling back to the current generic copy. Import the real `MAX_GROUP_PHOTOS` constant (single source; find where it lives — if server-only, move it to a shared module rather than duplicating the number).
4. **Copy:** pool page intro → **"Drop them in now — name and group them whenever, or never. There's no rush."**; mobile action labels → **"One item"** (combine) / **"One each"** (each); existing aria-labels keep carrying the full phrasing.

## Testing

- Grid: `selected[0]` renders the Cover pill, others render the ✓; deselecting the first promotes the next-tapped photo's badge (assert the reorder rule the code already implements).
- Action bar: hint appears with selection; cap message + disabled actions at 51 selected (mock 51 ids — no 51 real photos needed); labels; server-message passthrough (mock a failed fetch with a JSON body) and fallback.
- Notice: link href per mode; link-bearing notice survives past 4 s (fake timers) and clears on next action; plain notices keep the 4 s dismissal.
- e2e: existing pool specs stay green (`adaptive-collection-workspace` + any pool spec — check `e2e/` for pool coverage); run mapped specs.
- Contrast: if the Cover pill introduces a NEW token pairing, add it to `contrast.test.ts`; prefer an already-pinned pair.

## Out of scope

- The wireframe's separate set-hero step (deliberate deviation, stands); "Move to…" doc-sync (purses-xnp8); any upload/grouping behavior change.
