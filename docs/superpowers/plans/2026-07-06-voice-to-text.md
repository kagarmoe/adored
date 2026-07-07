# Voice-to-Text Data Entry — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-07-06-voice-to-text-design.md` (adversarially
reviewed 2026-07-06; Security/Architect BLOCKs resolved in spec). Read the spec first —
this plan sequences it and does not restate every contract.

**Method:** feature branch off `main` (`feat/voice-to-text`); one task = one logical
commit (or a few); TDD within each task (failing test first); per-task adversarial
review scaled to the diff; whole-branch `adversarial-review` before PR; `/sync-docs` +
`/graphify --update` + `/pr-screenshots` before opening the PR.

**Sequencing constraint:** Task 1 is a feasibility **gate** — the Architect review
blocked on iPad Safari Web Speech behavior. Tasks 2–4 (client voice) depend on its
findings. Tasks 5–6 (dimensions, extraction server) are independent of the device
findings and can proceed in parallel with 2–4.

---

## Task 1 — Device spike: Web Speech on the real target (GATE)

Build the minimal `useSpeechRecognition` hook (start/stop/final transcript only) and a
dev-only harness page (not linked from nav, removed or gated before merge). Verify on a
physical iPad: Safari tab **and** installed (standalone/PWA) mode.

Record in the spec (append a "Device findings" section): does `continuous` hold or
auto-stop at pauses; do `interimResults` fire; does recognition work at all in
standalone; permission re-prompt behavior. **Exit criteria:** findings written; go/no-go
on Web Speech confirmed (fallback if no-go: stop, re-open the STT engine question on
`purses-0a6` — do not build tasks 2–4 on a broken primitive).

## Task 2 — `useSpeechRecognition` hook, full contract

`src/lib/useSpeechRecognition.ts`. Failing tests first with a fake `SpeechRecognition`:
error union (`not-allowed`/`no-speech`/`network`/`aborted`/`unavailable`), `onend`
auto-restart with transcript accumulation, 2-empty-restart settle, double-start
re-entrancy, tap-stop vs platform stop, unsupported browser (`supported: false`, hook
inert). Feature-detect at render (not module scope — the E2E stub depends on this).

## Task 3 — `VoiceCapture` primitive (`purses-0a6`)

`src/features/items/VoiceCapture.tsx`: ≥44px mic toggle, `aria-label` + `aria-pressed`,
quiet pulse (respects `useReducedMotion`), single shared `aria-live="polite"` region
(interim text best-effort, "Stopped listening", downstream announcements via prop/
callback), permission-denied copy per spec. RTL tests incl. a11y attributes and copy.
Closes the design half of `purses-0a6` (Web Speech engine, tap-to-talk, typed fallback
always present, no audio retained).

## Task 4 — Story dictation in `ItemEditForm`

Mic on the story textarea only (spec: notes uses the OS keyboard mic). Verbatim append
with separating space; clamp at 2000 with the limit copy shown + announced. RTL tests:
append, clamp, copy, **no call to `/api/voice/extract`** (cost/privacy invariant).

## Task 5 — Dimensions: API + forms + display (independent of 1–4)

1. `src/server/api/items.ts`: add `height`/`width`/`depth`/`weight` — optional strings,
   positive finite decimals ≤ 10000 (explicit `.finite()`-equivalent refine; Postgres
   `numeric` accepts `'NaN'`) — and `unit` enum, omitted when absent (DB default
   applies). **Extend `createItem`'s explicit field map** (it does not spread).
   Schema unit tests: rejects negative/NaN/Infinity/non-numeric, accepts omission.
2. DB round-trip test at the **pinned path**
   `src/lib/db/item-dimensions.integration.test.ts` with the `describeDb` gate, through
   real `ItemRepository` create→read-back including `"11.5"`.
3. Both forms: "Add size" disclosure (collapsed by default; auto-expand when any value
   present), quiet styling per DESIGN.md tokens. RTL: dimensions serialize into the
   POST/PATCH **body**.
4. `ItemMetadata`: single size chip when present.

## Task 6 — Extraction server (independent of 1–4)

1. `npm install @anthropic-ai/sdk`; `ANTHROPIC_API_KEY` optional in `env.ts` (RESEND
   pattern).
2. Migration: `voice_usage (user_id, day, count)` additive table; upsert-increment
   helper; `VOICE_DAILY_CALL_CAP` env (default 50).
3. `src/server/services/voice-extract.ts` (plain functions, `import "server-only"`):
   permissive `ExtractionSchema` → `client.messages.parse()` (`claude-opus-4-8` as one
   named constant — owner may flip to `claude-haiku-4-5`; `max_tokens: 1000`,
   `maxRetries: 1`) → bounded `SanitizeSchema` (string maxes, `otherDetails` ≤ 10 × 120,
   clamp numbers). System prompt: extract only what was said; never invent; unmapped →
   `otherDetails`; unit rule per spec.
4. Route `src/app/api/voice/extract/route.ts`: `maxDuration = 30`; bare-JSON contract
   `200/400/401/422/429/503/500` per spec; SDK errors → fixed generic messages;
   PostHog event without transcript content.
5. Tests (SDK mocked at boundary): every status branch incl. refusal-as-200-null-parse,
   `parsed_output === null`, truncation, connection error → no SDK message leakage,
   cap → 429, PostHog payload contains no transcript substring.
6. `zodOutputFormat(ExtractionSchema)` **contract test** in the gate tier (no API key) —
   Zod 3.23.8 compatibility + illegal-constraint drift.
7. Opt-in live eval `RUN_LLM_EVAL=1` (skipped by default; not in the PR gate): both hero
   utterances against the real model, asserting brand/color/category and width/height/
   unit + strap→otherDetails.

## Task 7 — Review panel + merge (depends on 3, 5, 6)

1. Pure functions in `src/lib/voice-extract-merge.ts`: extraction result + current form
   values → suggestion rows (empty-target on by default; replace rows off, showing
   current value; `name` only when empty; `otherDetails` → notes rows; numbers
   stringified). Fixtures: both hero utterances, mixed-unit rule, empty extraction
   no-op, partial extraction untouched-fields.
2. `VoiceReviewPanel` component: transcript + toggle rows, "Add these" / "Not now",
   focus moves to panel on open, apply announces changed fields via the live region,
   applied fields get soft highlight **plus** non-color "from what you said" marker.
3. Wire capture mode into `ItemForm` and `ItemEditForm` via `VoiceCapture`:
   single-flight (capture disabled while POST in flight), re-capture replaces pending
   suggestions, failure path keeps transcript with "Add what you said to notes."
4. RTL: toggle semantics, name rule, replace-row default-off, apply/announce, failure
   fallback, single-flight.

## Task 8 — E2E, polish, gates, PR

1. Playwright: `page.addInitScript` stub for `SpeechRecognition`; smoke — mic renders,
   edit form shows "Add size" disclosure.
2. Copy pass against TONE.md litmus; quiet simultaneous reveal (no chip-popping).
3. Remove/gate the Task-1 dev harness page.
4. Whole-branch `adversarial-review` (Security, Architect, Craftsman, UX, QA — and
   Data lens for the `voice_usage` migration), fold findings.
5. Gates: `npm run build`, `test:ci`, `lint`, `auth:verify`, `test:db`. Coverage floor
   (82% merged lines) — check `VoiceCapture`/panel component coverage.
6. `/sync-docs`, `/graphify --update`, `/pr-screenshots` (light + dark), PR.

---

## Bead map

- Epic: voice-to-text data entry (this plan) — relates to `purses-0a6` (tasks 1–3 are
  that bead's design+build; close it when task 3 merges).
- One bead per task 1–8, dependencies: 2←1, 3←2, 4←3, 7←(3,5,6), 8←(4,5,6,7).
- Follow-ups (filed, not in this epic's gate — but note the epic-completion rule:
  every bead filed *into* the epic must close before the epic is done): strap-length
  column decision; form unification; burst limiting / global budget alert; voice for
  `purses-oub` rehome flow.

## Risks

- **Task 1 no-go** (Web Speech unusable on iPad/PWA): stop; re-open the engine question
  on `purses-0a6` (server STT would need audio upload — a different privacy posture and
  a new spec pass). Everything in tasks 5–6 still ships value (dimensions; extraction
  API is engine-agnostic — it takes text).
- **Extraction quality** (mis-heard brands, odd phrasing): mitigated by the review
  panel (nothing lands unseen) and the opt-in live eval; model constant can move up
  a tier if quality disappoints.
- **Zod/SDK incompatibility** surfaces at the contract test, not in production.
