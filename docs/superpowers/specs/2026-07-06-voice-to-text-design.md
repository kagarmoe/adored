# Voice-to-Text Data Entry — Design

**Date:** 2026-07-06
**Status:** Adversarially reviewed (5 personas: Security BLOCK→resolved, Architect BLOCK→resolved,
Craftsman/UX/QA CONCERNS→folded). All findings incorporated below; resolutions noted inline as
*(review)*.
**Beads:** designs `purses-0a6` (reusable voice-capture primitive — `useSpeechRecognition` +
`VoiceCapture` below are that primitive; consumers own where capture is offered, per the bead's
scope note) and adds the structured-extraction consumer. First consumers per the bead:
item story (`purses-ib3`, shipped) and item metadata (this spec). Future consumer:
`purses-oub` (rehome recipient).

## Goal

Let a curator speak instead of type when adding details about a piece. Two modes:

1. **Structured capture** — "This is a black Prada shoulder bag" → `brand: Prada`,
   `color: black`, `category: shoulder bag` offered into the item form fields.
   "It's 11 inches wide, 9 inches tall, and the strap is 24 inches long" →
   `width: 11`, `height: 9`, unit imperial, strap offered as an unmapped detail.
2. **Story dictation** — speaking the item's story ("Where will it go next?") appends
   verbatim to the story textarea. *(review — Craftsman)* Dictation is scoped to the
   **story field only**: the OS keyboard mic already covers verbatim dictation into any
   field (notes included); a dedicated story mic is kept because the user asked for it
   and it is the `purses-ib3` lineage consumer — but we don't triplicate mics across
   textareas.

Tone position *(review — UX, cleared explicitly)*: the metadata fields already exist;
voice makes filling them **less** clerical, not more — the person talks about the piece
the way they'd tell a friend. `ItemEditForm` sits outside the deciding flow (reached only
via the item's edit page), and the story field is forward-looking, so TONE commitment 2's
decision-timing clause is not triggered. Listening is always user-initiated, visibly
indicated, one tap to start, one tap to stop. The reveal of captured details is quiet and
simultaneous — never a chip-by-chip "watch me dissect your sentence" spectacle.

## Current state (verified 2026-07-06)

- **Forms:** `src/features/items/ItemForm.tsx` (create + edit; Zod + `apiPost`/`apiPatch`,
  per-field closures) and `src/features/items/ItemEditForm.tsx` (edit page; raw `fetch`,
  `name`-based `handleChange`, has `story` "Where will it go next?", max 2000). The two
  forms use different state idioms — shared voice components + pure merge functions keep
  the duplicated wiring minimal; form unification stays a deferred follow-up.
- **API:** `src/server/api/items.ts` — `CreateItemSchema`/`UpdateItemSchema` accept
  name/brand/style/color/material/category/status/notes/story only. **Dimensions are not
  accepted.** `createItem` maps fields **explicitly** (new fields must be added to the
  map or they're silently dropped); `updateItem` passes the parsed object through.
- **Routes return bare JSON** (`NextResponse.json(item)`) with errors as `{ error }`;
  `apiPost<T>` returns `T` and throws `ApiError(status, message)`. The `ApiResponse<T>`
  envelope in `domain.ts` is unused — this feature does **not** use it *(review — Architect)*.
- **DB:** `items` has `height`/`width`/`depth`/`weight` (`numeric` — Drizzle takes/returns
  **strings**) and `unit` (`text`, default `'imperial'`). Domain `Item` types them
  `string | null`. No strap-length column.
- **Display:** `ItemMetadata.tsx` shows brand/style/color/material/category chips + notes.
- **No AI/STT dependency exists.** This is the app's first LLM call and first paid
  endpoint — cost controls are in scope, not deferred *(review — Security BLOCK)*.
- Tablet-first (iPad Safari), tap-first, WCAG 2.1 AA, touch targets ≥44px.

## Architecture

```
[mic tap] → Web Speech API (browser) → transcript (text)
    ├── story dictation: append transcript to story textarea. No server call.
    └── capture mode:   POST /api/voice/extract { transcript }
                          → Claude structured output → server-side sanitize
                          → review panel ("Here's what I noted") → user accepts
                          → form state fills → existing Save path (unchanged)
```

### Stage 1 — speech capture (browser)

Hook `src/lib/useSpeechRecognition.ts` + component `src/features/items/VoiceCapture.tsx`
(the `purses-0a6` primitive).

- `SpeechRecognition`/`webkitSpeechRecognition`; feature-detect; when unsupported
  (Firefox), the mic affordance doesn't render — typing unchanged, no nagging banner.
- **iPad Safari reality is the design baseline, not an edge case** *(review — Architect
  BLOCK)*:
  - **Single-utterance auto-stop:** iOS Safari ends recognition at the first sustained
    pause regardless of `continuous`. The hook treats platform `onend` as normal: if the
    user hasn't tapped stop, it **auto-restarts** and accumulates `finalTranscript`
    across restarts until the user taps stop (with a restart guard against error loops —
    after 2 consecutive `onend`s with no new speech, settle to idle and announce it).
  - **Interim results are best-effort:** Safari's `interimResults` may not fire. The UI
    shows interim text when available but never depends on it; copy doesn't promise
    live words.
  - **PWA/standalone:** recognition is historically broken in installed standalone mode
    on iOS. **Plan task 1 is a real-device spike** (iPad Safari tab + installed PWA)
    recording actual behavior before the rest is built. Degradation contract: if
    recognition errors or never returns a result, settle to idle with gentle copy
    ("Voice isn't available here — you can type instead") — the typed path is always
    whole.
- Hook contract: `{ supported, listening, interimTranscript, finalTranscript, start,
  stop, error }`; error is a named union (`not-allowed`, `no-speech`, `network`,
  `aborted`, `unavailable`) so copy can be specific. `start()` is re-entrant-safe
  (ignored while already listening).
- The OS shows its own mic indicator (iOS orange dot); our listening state complements
  it — never contradicts it *(review — UX)*.
- **Privacy:** the platform's speech service (Apple/Google) processes the audio — the
  same contract as the OS keyboard mic; we add no recording, storage, or transmission of
  audio. **In capture mode the transcript text is sent to Anthropic** for extraction —
  Anthropic must be named as a processor in the privacy policy; API-default retention
  applies (no training on API data) *(review — Security)*. Dictation mode sends nothing
  anywhere.

### Stage 2 — field extraction (server)

- **Route** `src/app/api/voice/extract/route.ts` (POST). Auth: better-auth session
  (`getSession()`), 401 otherwise. No collection scoping — the route touches no data
  (verified against `requireApiCapability`; nothing to scope). Body Zod-validated:
  `{ transcript: string, min 1, max 1500 }`.
- **Module** `src/server/services/voice-extract.ts` — a **plain function module**, not a
  service class (classes in `services/` exist for constructor-injected repos; this holds
  no state) *(review — Craftsman)*. First line: `import "server-only"` so the SDK/key can
  never reach a client bundle *(review — Security)*.
- **SDK call:** `@anthropic-ai/sdk`, `client.messages.parse()` with
  `zodOutputFormat(ExtractionSchema)` (verified current API). `max_tokens: 1000`,
  `maxRetries: 1` (retries amplify spend), route `maxDuration = 30`. No prompt-caching
  claim — the prompt is far below the cacheable minimum *(review — Architect)*.
- **Model:** `claude-opus-4-8` (current Anthropic-recommended default). Two reviewers
  independently recommended `claude-haiku-4-5` (~5× cheaper, sufficient for bounded
  extraction) — **owner decision**, implemented as one named constant; with the daily cap
  below, worst-case spend is bounded either way (≤ ~$1.25/user/day on Opus).
- **Two-schema split** *(review — Architect × Security, reconciled)*: structured outputs
  **silently strip** numeric/length constraints, and a bounded schema makes
  `messages.parse()` fail (`parsed_output: null`) instead of degrading gracefully. So:
  1. `ExtractionSchema` (sent to the model): permissive — optional bare strings/numbers,
     no bounds.
  2. `SanitizeSchema` (applied server-side to the parsed output before responding):
     bounded — `.max()` on every string (mirror form caps), `otherDetails` ≤ 10 items ×
     ≤ 120 chars, numbers `.finite().positive().max(10000)` (clamp, don't reject the
     whole result), unknown keys stripped.
- **Extraction schema fields:** `name?`, `brand?`, `style?`, `color?`, `material?`,
  `category?`, `height?`, `width?`, `depth?`, `weight?` (numbers),
  `unit?: "imperial" | "metric"`, `otherDetails?: string[]`. **No `story` field** — the
  extractor maps facts; the story belongs to dictation *(review — Craftsman)*.
  **Unit rule** *(review — Architect)*: `unit` follows the dimension clauses; in a
  mixed-unit utterance the dimension clauses' unit wins and odd-unit clauses (e.g. a
  strap in inches against cm dimensions) go verbatim to `otherDetails`; weight rides the
  same enum. Both hero utterances are committed fixtures asserting this.
- **System prompt:** fixed extraction instruction — extract only what was said, never
  invent values, unmapped facts to `otherDetails`.
- **Response contract** *(review — Architect)*: bare JSON, matching every other route.
  - `200` → sanitized `ExtractedItemDetails`
  - `400` invalid body · `401` unauthenticated · `429` daily cap reached
  - `422` extraction failed — refusal (`stop_reason: "refusal"` arrives as HTTP 200 from
    Anthropic with null parse — checked explicitly), `parsed_output === null`, or
    `max_tokens` truncation
  - `503` voice unavailable (missing `ANTHROPIC_API_KEY`)
  - `500` fixed generic message — **SDK error text never passes through**
    `errorResponse`'s message passthrough *(review — Security)*
  - On **any** failure the client keeps the transcript and offers one gentle action:
    "Add what you said to notes." Spoken words are never lost. There is **no preflight**
    — the mic renders whenever the browser supports speech; server availability is
    handled post-hoc (the user has already spoken by the time the POST can fail, so
    hiding the button was never possible) *(review — Architect, Craftsman)*.

### Cost controls (in scope — the app is multi-user) *(review — Security BLOCK, Architect)*

- **Per-user daily cap:** new `voice_usage` table `(user_id, day, count)` — additive
  migration, upsert-increment per call, `429` past the cap. Cap via env
  `VOICE_DAILY_CALL_CAP` (default 50). 429 copy is gentle and unpressured ("Voice needs
  a rest today — everything still works by typing").
- `maxRetries: 1`, `max_tokens: 1000`, transcript ≤ 1500 chars.
- Client single-flight: capture disabled while a POST is in flight *(review — Architect)*.
- The route is authN-only by design; the cap is therefore **load-bearing**, not optional
  — a hostile authenticated user gets at most cap × per-call cost per day.

### Client merge — review panel, no silent writes *(review — UX × Craftsman × Security, converged; resolves former open questions 1 & 2)*

- Extraction results are **never applied directly**. A compact review panel appears:
  the transcript, then each captured value as a row (`Brand — Prada`, `Width — 11 in`),
  each toggleable:
  - Rows targeting **empty** fields: on by default.
  - Rows targeting fields that **already have a value**: off by default, shown as
    "replaces '<current>'" — accepting is an explicit per-row tap. Typed input is never
    silently clobbered; **`name` is only ever offered when empty** (never a replace row —
    a generated attribute-string must not displace a loved name).
  - **Unmapped facts** (`otherDetails`, e.g. "Strap: 24 in"): rows defaulting to
    "add to notes", individually toggleable — nothing auto-appends to a persisted,
    possibly-shared field without being seen *(review — Security)*.
- "Add these" applies the on rows; "Not now" dismisses (transcript still offered for
  notes). Applying is the only write to form state — so there is **no snapshot/Undo
  machinery**: nothing destructive can happen, and un-applying is ordinary field editing
  *(review — Craftsman)*.
- Applied fields get a soft highlight **paired with a non-color marker** (small "from
  what you said" tag) — never hue alone *(review — UX, DESIGN.md "Don't")* — and the
  change is announced via the live region.
- Speaking again while the panel is open **replaces** the pending suggestion set; it
  never stacks. Notes additions applied twice (two captures, two accepts) are visible
  user choices, not silent duplication.
- Numbers are stringified by the merge layer (form inputs are text; API/DB want strings).
- Save is the existing path, unchanged. Voice never mutates data.

### Dimensions (in scope, behind disclosure) *(review — UX × Craftsman, converged)*

The second hero utterance needs somewhere to land, and the columns exist. But a
permanently visible five-input size grid is exactly the "spec sheet / data-row density"
TONE forbids. Resolution:

1. **API:** add `height`/`width`/`depth`/`weight` (optional strings validated as
   positive finite decimals ≤ 10000 — `.finite()` explicitly, since Postgres `numeric`
   accepts `'NaN'`) and `unit` (optional enum; **omitted when absent** so the DB default
   applies) to both item schemas. **Extend `createItem`'s explicit field map** — it does
   not spread, so unmapped fields silently drop *(review — Architect)*. String
   end-to-end: form text input → Zod string → Drizzle numeric(string). No migration.
2. **Forms:** dimension inputs live behind a quiet **"Add size"** disclosure, collapsed
   by default, auto-expanded when any dimension has a value (typed, loaded, or
   voice-applied) *(review — UX)*.
3. **Display:** one chip in `ItemMetadata` (`9 × 11 × 4 in · 1.2 lb`) when present.

## UX, accessibility & copy (accountable to TONE.md / DESIGN.md)

- One consistent mic affordance (`VoiceCapture`), ≥44px, `aria-label` ("Add details by
  speaking" / "Speak your story"), `aria-pressed` for the listening toggle, quiet pulse
  while listening (calm, not recording-red); the pulse and the applied-field highlight
  fade both respect `useReducedMotion` *(review — UX)*.
- **Live region plan** *(review — UX: unspecified = ships mute)*: one `aria-live="polite"`
  region carries (a) interim transcript when available, (b) auto-stop/idle transitions
  ("Stopped listening"), (c) the post-extraction summary ("Noted: brand Prada, color
  black, category shoulder bag — review before adding"), (d) the story char-limit
  notice. On panel open, **focus moves to the review panel**; on apply, an announcement
  lists the fields that changed.
- Copy (litmus: person's side):
  - Invite: **"Tell me about this piece — I'll note what you mention."**
  - Working: **"Noting the details…"**
  - Mic permission: **"We couldn't reach the microphone. You can type instead — or allow
    microphone access and try again."** *(review — UX rewrite)*
  - Story limit: **"That's all the room this story needs for now."** — shown and
    announced; recognition stops appending at 2000 chars.
  - Daily cap (429): gentle, no counting-against framing.
- Cumulative load check *(review — UX)*: net new visible controls on the form are **one
  mic button** (capture), **one story mic**, and **one "Add size" link** — the review
  panel and dimension inputs are progressive disclosure. The form remains one calm
  moment.

## Security & privacy summary

- AuthN required; transcript re-validated at the boundary; output sanitized server-side
  (bounded SanitizeSchema) before reaching the client.
- `ANTHROPIC_API_KEY`: optional in `env.ts` (RESEND pattern — app boots without it;
  route 503s). Server-only via `import "server-only"`. Never `NEXT_PUBLIC_*`.
- Transcripts: not persisted, not logged (app layer; confirm no request-body logging at
  the platform layer). PostHog `voice_capture_used` carries counts/latency/outcome only —
  a test asserts the payload contains no transcript content.
- Extracted text is untrusted: escape-on-render stands (React default); any future
  export/rendering surface must keep treating notes as untrusted.
- CSRF-to-wallet: better-auth SameSite cookies + JSON content-type (route rejects
  non-JSON) — confirmed adequate at review.

## Testing (TDD; every test runs in CI) *(review — QA; placements pinned)*

- **Hook** (`gate` tier): fake `SpeechRecognition`; discrete cases for `not-allowed`,
  `no-speech`, `network`, `aborted`, double-start re-entrancy, interim→final
  accumulation, tap-stop vs platform `onend` auto-restart (incl. the 2-empty-restart
  settle), unsupported browser.
- **Merge + sanitize pure functions** (`gate`): both hero utterances as fixtures
  (including the mixed-unit rule); empty-extraction no-op; partial extraction leaves
  other fields untouched; number→string; clamp behavior; suggestion-set replace
  semantics; notes-row join.
- **`zodOutputFormat` contract test** (`gate`, no API key): calls
  `zodOutputFormat(ExtractionSchema)` and asserts it compiles — catches Zod-3.23.8
  incompatibility and illegal-constraint drift at PR time *(review — QA mock-theater
  guard)*.
- **Route tests** (`gate`, SDK mocked at the boundary — the one legitimate mock): 401,
  400, 429 (cap), 503 (no key), 422 on refusal / `parsed_output === null` /
  truncation, connection error → generic 500 with **no SDK message leakage**, happy
  path, PostHog payload contains no transcript substring, and **dictation mode makes no
  extract call** (cost/privacy invariant).
- **DB tier** — pinned placement *(review — QA BLOCK-level)*: dimension round-trip test
  at `src/lib/db/item-dimensions.integration.test.ts` using the existing
  `describeDb = RUN_DB_TESTS === "1" ? describe : describe.skip` pattern (the CI
  `db-tests` job globs only `src/lib/db`), through the real `ItemRepository`
  create→read-back including a decimal (`"11.5"`).
- **Forms (RTL, `gate`)**: mic hidden when unsupported; review panel toggles apply
  correctly (empty-fill on, replace off by default, name never a replace row);
  `ItemEditForm` story dictation appends and clamps at 2000; **dimension fields
  serialize into the POST/PATCH body** (body assertion, mirroring the existing
  `ItemForm.test.tsx` pattern); `aria-label`/`aria-pressed` present; permission-denied
  copy renders; live-region announcements fire; `VoiceCapture` itself has RTL coverage
  (the 82% merged-lines coverage gate is live for this much new code).
- **Live eval, opt-in** *(review — QA)*: `RUN_LLM_EVAL=1`-gated test (skipped by
  default, not in the PR gate, documented owner-run) calling the real extractor on the
  two hero utterances and asserting the load-bearing fields — the only automated guard
  on actual extraction quality.
- **E2E (Playwright, runs via the `changes` filter on `src/features/**`/`src/app/**`)**:
  stub `window.SpeechRecognition`/`webkitSpeechRecognition` via `page.addInitScript`
  (before hydration; hook must feature-detect at render, not module-eval): mic button
  appears, edit form renders with the "Add size" disclosure.

## Out of scope (explicit)

- Server-side STT (Whisper/Deepgram) — revisit only if the device spike (plan task 1)
  shows Web Speech is unusable on the primary target.
- Voice on the notes textarea (OS keyboard mic covers it) and any voice
  commands/navigation.
- Strap-length column; form unification; anything beyond the per-user daily cap
  (burst limiting, global budget alerts) — follow-up beads.
- Bulk/multi-item voice entry.

## Decisions resolved at review

1. ~~Unmapped facts auto-append to notes?~~ → **Shown in the review panel for explicit
   placement.**
2. ~~Overwrite non-empty fields?~~ → **Never silently; per-row opt-in replace; name
   never replaceable by voice.**
3. Model default: `claude-opus-4-8` in the plan (Anthropic-recommended default);
   reviewers recommend `claude-haiku-4-5` — **owner may flip one constant**; spend is
   capped either way.
