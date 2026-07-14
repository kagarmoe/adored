# New-User Walkthrough Fidelity — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the `/welcome` walkthrough so it teaches the real app — the two round kinds by name, the Tie/Skip/Not yet/Not mine escapes, the "Where things stand" results framing, and the refine-then-finalize loop — by rendering the real sorting components in a typed local mode.

**Architecture:** Three real components (`DecisionControls`, `DeferControl`, `CompareChoice`) swap their backend-target props for a discriminated `submit` union (`{kind:"session",…}` = today's fetch path byte-for-byte; `{kind:"local", onDecision}` = synchronous, no fetch/PostHog/refresh/pending). `SetAsideButton` reads its context *optionally* and gets the same union, so the walkthrough renders it without a `TriageUndoProvider`. All dual-displayed teaching copy lives in one plain-constants module `roundCopy.ts` consumed by the server hub page and the client walkthrough. `buildStanding` moves to typed per-item outcomes. The shell grows a `refine` beat, focus-on-advance, and an `aria-live` region.

**Tech Stack:** Next.js App Router, React 19, TypeScript strict, Vitest + Testing Library (unit, `npm run test:ci`), Playwright (`e2e/`, runs in the CI `e2e` job — paths filter already covers `src/features/**` and `e2e/**`).

**Authority docs:** the spec `docs/superpowers/specs/2026-07-04-walkthrough-fidelity-design.md`; `TONE.md` (first-order for all copy); `PRODUCT.md`; `DESIGN.md`.

## Global Constraints

- Branch `walkthrough-fidelity`; commit per task; never commit to `main`.
- TDD: failing test first in every task. Every behavior below runs in CI (unit `gate` job or `e2e` job) — no skipped/manual tests.
- With `kind: "session"`, component behavior must be **byte-for-byte today's** — existing tests must pass with only the mechanical prop-shape change at call sites.
- Local mode is **synchronous**: never sets pending/busy/"Saving…", never fetches, never calls `posthog.capture` or `router.refresh`.
- Copy rules (TONE.md): person-side voice, no pace words, no inventory verbs ("bucket"), affirmation last. New-copy wording below is the spec's; if an implementer changes a word, re-check against TONE.md.
- No new image assets: the "not yours" item reuses `/onboarding/microphone-cushion.webp` renamed **"The kid's microphone cushion"**.
- Production prop types are never optionalized for the demo; the walkthrough fabricates complete domain `Item`s.
- `roundCopy.ts` must NOT have `"use client"` (imported by a server page).

---

### Task 1: Shared teaching copy — `roundCopy.ts` + hub page consumes it

**Files:**
- Create: `src/features/sorting/roundCopy.ts`
- Create: `src/features/sorting/roundCopy.test.ts`
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/page.tsx:92-111` (hub cards)
- Modify: any hub-page test asserting the old explainer strings (search `"Quickly bucket"` under `src/`)

**Interfaces:**
- Produces: `ROUND_COPY = { triage: { name: "Triage", explainer: "One at a time — how do you feel about each?" }, compare: { name: "Compare", explainer: "Two side by side — which do you love more?" } }`, `COMPARE_SUBLINE = "Tap the one you love more. Tie or skip whenever you like."`, `triageDecisions(itemId: string): Array<{ label: string; decision: { itemId: string; result: string } }>` (Love→top, Like→high, Maybe→medium, Onward→low).

- [ ] **Step 1: Write the failing test**

```ts
// src/features/sorting/roundCopy.test.ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COMPARE_SUBLINE, ROUND_COPY, triageDecisions } from "./roundCopy";

describe("roundCopy", () => {
  it("names both rounds with person-side explainers", () => {
    expect(ROUND_COPY.triage.name).toBe("Triage");
    expect(ROUND_COPY.compare.name).toBe("Compare");
    // TONE litmus: no inventory verbs, no pace words (spec: rewritten person-side).
    for (const round of Object.values(ROUND_COPY)) {
      expect(round.explainer.toLowerCase()).not.toMatch(/bucket|quickly|refine ranking/);
    }
  });

  it("builds the four tier decisions for an item", () => {
    expect(triageDecisions("item-1")).toEqual([
      { label: "Love", decision: { itemId: "item-1", result: "top" } },
      { label: "Like", decision: { itemId: "item-1", result: "high" } },
      { label: "Maybe", decision: { itemId: "item-1", result: "medium" } },
      { label: "Onward", decision: { itemId: "item-1", result: "low" } },
    ]);
  });

  it("carries the compare sub-line", () => {
    expect(COMPARE_SUBLINE).toBe("Tap the one you love more. Tie or skip whenever you like.");
  });

  it("stays server-importable (no 'use client')", () => {
    const src = readFileSync(new URL("./roundCopy.ts", import.meta.url), "utf8");
    expect(src).not.toContain("use client");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`npx vitest run src/features/sorting/roundCopy.test.ts` → module not found)

- [ ] **Step 3: Implement**

```ts
// src/features/sorting/roundCopy.ts
// Teaching copy displayed in BOTH the session hub and the /welcome walkthrough.
// One home so the two surfaces cannot fork (the walkthrough drifted once already).
// NOTE: no "use client" here — this module is imported by the server hub page.

export const ROUND_COPY = {
  triage: { name: "Triage", explainer: "One at a time — how do you feel about each?" },
  compare: { name: "Compare", explainer: "Two side by side — which do you love more?" },
} as const;

export const COMPARE_SUBLINE = "Tap the one you love more. Tie or skip whenever you like.";

// The four tier decisions, shaped for the decisions API. Caller-supplied labels
// were the walkthrough's original drift mechanism one level down — shared now.
export function triageDecisions(itemId: string) {
  return [
    { label: "Love", decision: { itemId, result: "top" } },
    { label: "Like", decision: { itemId, result: "high" } },
    { label: "Maybe", decision: { itemId, result: "medium" } },
    { label: "Onward", decision: { itemId, result: "low" } },
  ];
}
```

- [ ] **Step 4: Consume in the hub page** — in `sort/[sessionNumber]/page.tsx` replace the two card literals: `<h2 …>{ROUND_COPY.triage.name}</h2>` / `<p …>{ROUND_COPY.triage.explainer}</p>` (same for compare), importing from `@/features/sorting/roundCopy`. Update any test asserting `"Quickly bucket one item at a time."` / `"Pick between pairs to refine ranking."` to the new explainers (grep first: `grep -rn "Quickly bucket\|refine ranking" src/`). The hub test must import from `roundCopy.ts` (assert `ROUND_COPY.triage.explainer` appears) so a hub-side fork fails.

- [ ] **Step 5: Run tests + lint** — `npx vitest run src/features/sorting/roundCopy.test.ts` PASS; run the hub page's test file; `npm run lint`.

- [ ] **Step 6: Commit** — `git commit -m "feat(walkthrough): shared round teaching copy, person-side hub explainers (TONE fix)"`

---

### Task 2: `DecisionControls` — `submit` union + triage page call site

**Files:**
- Modify: `src/features/sorting/DecisionControls.tsx`
- Modify: `src/features/sorting/DecisionControls.test.tsx` (existing fetch-positive tests stay; add local-mode negatives beside them)
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx:141-151` (call site → `submit={{ kind: "session", sessionId: sortSession.id }}` and `decisions={triageDecisions(item.id)}`)

**Interfaces:**
- Consumes: `triageDecisions` from Task 1.
- Produces: `interface DecisionControlsProps { submit: DecisionSubmit; type: "triage" | "pairwise_compare"; decisions: Array<{ label: string; decision: Record<string, unknown> }> }` where `type DecisionSubmit = { kind: "session"; sessionId: string; onDecisionMade?: () => void } | { kind: "local"; onDecision: (decision: Record<string, unknown>) => void }` (export `DecisionSubmit`).

- [ ] **Step 1: Write the failing tests** (in the existing test file, adjacent to the fetch positives)

```tsx
describe("local mode", () => {
  it("calls onDecision synchronously with no fetch, no pending state", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const onDecision = vi.fn();
    render(
      <DecisionControls
        submit={{ kind: "local", onDecision }}
        type="triage"
        decisions={[{ label: "Love", decision: { itemId: "i1", result: "top" } }]}
      />
    );
    await userEvent.click(screen.getByRole("button", { name: "Love" }));
    expect(onDecision).toHaveBeenCalledWith({ itemId: "i1", result: "top" });
    expect(fetchSpy).not.toHaveBeenCalled();
    // No soft-lock: the control is immediately re-enabled (no "Saving…").
    expect(screen.getByRole("button", { name: "Love" })).toBeEnabled();
  });
});
```

Also mechanically update the existing tests' props from `sessionId="…"` to `submit={{ kind: "session", sessionId: "…" }}` (and `onDecisionMade` into the session arm) — their assertions must not change.

- [ ] **Step 2: Run — expect FAIL** (prop shape doesn't exist)

- [ ] **Step 3: Implement.** In `DecisionControls.tsx`: replace `sessionId`/`onDecisionMade` props with `submit: DecisionSubmit`; at the top of `submitDecision`:

```ts
if (submit.kind === "local") {
  submit.onDecision(decision); // synchronous demo path: no fetch, no pending, no refresh
  return;
}
```

The session branch below is unchanged except reading `submit.sessionId` / `submit.onDecisionMade`.

- [ ] **Step 4: Run the whole file + typecheck** — `npx vitest run src/features/sorting/DecisionControls.test.tsx` PASS; `npx tsc --noEmit` (call-site errors point at the triage page — fix it in this task as listed above).

- [ ] **Step 5: Commit** — `git commit -m "feat(sorting): DecisionControls submit union (session | local) + shared triage decisions"`

---

### Task 3: `DeferControl` — `submit` union

**Files:**
- Modify: `src/features/sorting/DeferControl.tsx`
- Modify: `src/features/sorting/DeferControl.test.tsx`
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx:159` (→ `<DeferControl submit={{ kind: "session", collectionId: collection.id }} itemId={item.id} />`)

**Interfaces:**
- Produces: `DeferControl({ submit, itemId }: { submit: { kind: "session"; collectionId: string } | { kind: "local"; onDecision: () => void }; itemId: string })`.

- [ ] **Step 1: Failing test** (beside the existing fetch positive)

```tsx
it("local mode: onDecision fires, no fetch, button re-enabled (bypasses AsyncActionButton's never-reset busy)", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const onDecision = vi.fn();
  render(<DeferControl submit={{ kind: "local", onDecision }} itemId="i1" />);
  const btn = screen.getByRole("button", { name: /not yet/i });
  await userEvent.click(btn);
  expect(onDecision).toHaveBeenCalledTimes(1);
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(btn).toBeEnabled();
  expect(btn).toHaveTextContent("Not yet"); // never "Just a moment…"
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** Local mode must NOT route through `AsyncActionButton`'s async `action` (its success path deliberately never resets `busy` — a reused instance would soft-lock). Render the same visual button but call `submit.onDecision()` synchronously:

```tsx
export function DeferControl({ submit, itemId }: DeferControlProps) {
  const router = useRouter();
  if (submit.kind === "local") {
    return (
      <Button
        type="button"
        variant="ghost"
        title="I'll come back to this"
        aria-label="Not yet — I'll come back to this"
        onClick={() => submit.onDecision()}
      >
        Not yet
      </Button>
    );
  }
  return (
    <AsyncActionButton
      label="Not yet"
      title="I'll come back to this"
      ariaLabel="Not yet — I'll come back to this"
      action={async () => { /* today's fetch body, using submit.collectionId */ }}
    />
  );
}
```

(Match label/title/aria exactly between the two branches — the local branch renders the same affordance; add an assertion comparing `title`/`aria-label` across modes in the test if cheap.)

- [ ] **Step 4: Run file + tsc; fix the triage page call site.**

- [ ] **Step 5: Commit** — `git commit -m "feat(sorting): DeferControl submit union; synchronous local mode"`

---

### Task 4: `SetAsideButton` — optional context + `submit` union

**Files:**
- Modify: `src/features/sorting/SetAsideButton.tsx`
- Modify: `src/features/sorting/TriageUndoProvider.tsx` (export the context object, or add a non-throwing `useOptionalTriageUndo()` — smallest diff: export `TriageUndoContext` is internal; add `export function useOptionalTriageUndo() { return useContext(TriageUndoContext); }`)
- Modify: `src/features/sorting/SetAsideUndo.test.tsx` (existing provider-based positives stay; add local-mode test that renders WITHOUT a provider)
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/triage/page.tsx:160` (→ `<SetAsideButton submit={{ kind: "session" }} itemId={item.id} itemName={item.name} />`)

**Interfaces:**
- Produces: `SetAsideButton({ submit, itemId, itemName }: { submit: { kind: "session" } | { kind: "local"; onDecision: () => void }; itemId: string; itemName: string | null })`. Session mode still requires a mounted `TriageUndoProvider` (it supplies `collectionId`); local mode requires none.

- [ ] **Step 1: Failing test — must fail against today's throwing hook (proves non-vacuous):**

```tsx
it("local mode renders WITHOUT a TriageUndoProvider and never touches the network", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const onDecision = vi.fn();
  // No provider wrapper — today this throws "useTriageUndo must be used within…".
  render(<SetAsideButton submit={{ kind: "local", onDecision }} itemId="i1" itemName="The lamp" />);
  await userEvent.click(screen.getByRole("button", { name: /not mine/i }));
  expect(onDecision).toHaveBeenCalledTimes(1);
  expect(fetchSpy).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run — FAIL with the provider-throw.**

- [ ] **Step 3: Implement.** `SetAsideButton` switches to `useOptionalTriageUndo()` (non-throwing). If `submit.kind === "local"`: `onClick = () => submit.onDecision()` — synchronous, no busy state, button text always "Not mine". If `kind === "session"`: current behavior verbatim via the context (throw a clear error if context is null in session mode — same message as today, now thrown from the button). Keep `title`/`aria-label` identical across modes. `TriageUndoProvider` logic untouched beyond the added optional hook.

- [ ] **Step 4: Run file + tsc; fix call site; run `npx vitest run src/features/sorting/` (all four components green).**

- [ ] **Step 5: Commit** — `git commit -m "feat(sorting): SetAsideButton optional undo context + local mode (no provider needed)"`

---

### Task 5: `CompareChoice` — `submit` union + shared sub-line

**Files:**
- Modify: `src/features/sorting/CompareChoice.tsx`
- Modify: `src/features/sorting/CompareChoice.test.tsx`
- Modify: `src/app/collections/[id]/sort/[sessionNumber]/compare/page.tsx` (call site → `submit={{ kind: "session", sessionId: … }}`; replace its inline sub-line with `COMPARE_SUBLINE` from `roundCopy.ts` — grep for `Tap the one you love more`)

**Interfaces:**
- Consumes: `COMPARE_SUBLINE` (Task 1).
- Produces: `CompareChoiceProps.submit: { kind: "session"; sessionId: string } | { kind: "local"; onDecision: (result: "item_a" | "item_b" | "tie" | "skip") => void }` (other props unchanged: `itemA/itemB: Item`, `heroA/heroB?`, `comparisonsMade: number`).

- [ ] **Step 1: Failing tests** (beside the existing fetch positives; import `posthog from "posthog-js"` mock — the repo's existing CompareChoice tests already mock it; follow that pattern):

```tsx
it("local mode: tap A calls onDecision('item_a') — no fetch, no posthog.capture, cards re-enabled", async () => {
  const fetchSpy = vi.spyOn(globalThis, "fetch");
  const onDecision = vi.fn();
  render(<CompareChoice submit={{ kind: "local", onDecision }} itemA={itemA} itemB={itemB} comparisonsMade={0} />);
  await userEvent.click(screen.getByRole("button", { name: new RegExp(itemA.name!, "i") }));
  expect(onDecision).toHaveBeenCalledWith("item_a");
  expect(fetchSpy).not.toHaveBeenCalled();
  expect(vi.mocked(posthog.capture)).not.toHaveBeenCalled(); // transport batches — a fetch spy alone is blind to capture
  expect(screen.getByRole("button", { name: /tie/i })).toBeEnabled();
});

it("local mode: Tie and Skip report their results", async () => {
  const onDecision = vi.fn();
  render(<CompareChoice submit={{ kind: "local", onDecision }} itemA={itemA} itemB={itemB} comparisonsMade={0} />);
  await userEvent.click(screen.getByRole("button", { name: /tie/i }));
  expect(onDecision).toHaveBeenCalledWith("tie");
  await userEvent.click(screen.getByRole("button", { name: /skip/i }));
  expect(onDecision).toHaveBeenLastCalledWith("skip");
});
```

- [ ] **Step 2: Run — FAIL.**

- [ ] **Step 3: Implement.** Top of `choose(result, key)`:

```ts
if (submit.kind === "local") {
  submit.onDecision(result); // demo path: no clientKeys, no pending, no posthog, no refresh
  return;
}
```

Session branch unchanged (`submit.sessionId` replaces the old prop). The `clientKeys` ref allocation stays inside the session branch usage only (structurally unreachable in local mode).

- [ ] **Step 4: Run file + tsc; fix compare page call site + sub-line import.**

- [ ] **Step 5: Guard test (repo-wide):** add to `roundCopy.test.ts` (or a new `src/features/sorting/localMode.guard.test.ts`):

```ts
it("production routes never use local mode", () => {
  const hits = execSync(String.raw`grep -rln 'kind: "local"' src/app/collections || true`, { encoding: "utf8" }).trim();
  expect(hits).toBe("");
});
```

- [ ] **Step 6: Commit** — `git commit -m "feat(sorting): CompareChoice submit union; shared compare sub-line; local-mode guard"`

---

### Task 6: `sampleData.ts` — typed outcomes + `buildStanding` rewrite

**Files:**
- Modify: `src/features/onboarding/sampleData.ts`
- Modify: `src/features/onboarding/sampleData.test.ts`

**Interfaces:**
- Produces:

```ts
export type Tier = "love" | "like" | "maybe" | "onward";
export type TriageOutcome = { kind: "tier"; tier: Tier } | { kind: "deferred" } | { kind: "setAside" };
export type CompareOutcome = { kind: "win"; winnerId: string } | { kind: "tie" } | { kind: "skip" };
export interface Standing {
  ranked: StandingRow[];            // hero = ranked[0] when non-empty
  deferred: SampleItem[];           // "Ready when you are"
  setAside: SampleItem[];           // "Waiting, whenever you want them"
}
export function buildStanding(compare: CompareOutcome, triage: Record<string, TriageOutcome>): Standing;
export function toItem(sample: SampleItem): Item;        // complete fabricated domain Item for CompareChoice
export const RESULT_TO_TIER: Record<"top" | "high" | "medium" | "low", Tier>;
```

- Sample items: compare pair unchanged (armchair, clock). Triage items reordered so the not-yours item is third: vase, books, **cushion renamed "The kid's microphone cushion"** (same image).

- [ ] **Step 1: Failing tests** — one per spec rule, exhaustive:

```ts
const tiers = (t: Record<string, Tier>) =>
  Object.fromEntries(Object.entries(t).map(([id, tier]) => [id, { kind: "tier", tier } as TriageOutcome]));

it("win: winner love, passed-over like, at the top", …);
it("tie: both love, display order kept", () => {
  const s = buildStanding({ kind: "tie" }, tiers({ vase: "maybe", books: "like", cushion: "love" }));
  expect(s.ranked[0]).toEqual({ item: SAMPLE_ITEMS[0], tier: "love" });
  expect(s.ranked[1]).toEqual({ item: SAMPLE_ITEMS[1], tier: "love" });
});
it("skip: both like, display order kept", …);
it("triage tiers order remaining rows love>like>maybe>onward", …);
it("deferred leaves the ranking for the deferred group", () => {
  const s = buildStanding({ kind: "win", winnerId: "armchair" },
    { ...tiers({ vase: "love", books: "like" }), cushion: { kind: "deferred" } });
  expect(s.deferred.map(i => i.id)).toEqual(["cushion"]);
  expect(s.ranked.map(r => r.item.id)).not.toContain("cushion");
});
it("setAside leaves the ranking for the set-aside group", …);
it("all triage items deferred/set aside still ranks the compare pair", …);
it("toItem fabricates a complete Item (satisfies the type, fixed dates)", () => {
  const item = toItem(SAMPLE_ITEMS[0]);
  expect(item.id).toBe("armchair");
  expect(item.name).toBe(SAMPLE_ITEMS[0].name);
  expect(item.collectionId).toBe("welcome-demo");
});
```

- [ ] **Step 2: Run — FAIL** (new signatures).

- [ ] **Step 3: Implement.** `buildStanding` rules exactly as the spec's bullet list; a comment on the tie/skip mapping: `// demo-only mapping (tie→both love, skip→both like) — NOT ScoringService semantics; do not port.` `toItem` fills every `Item` field (`collectionId: "welcome-demo"`, nulls for metadata, `unit: "in"`, `createdAt/updatedAt: new Date(0)`, `deletedAt: null`).

- [ ] **Step 4: Run — PASS.** Also `npx tsc --noEmit` (WelcomeStanding still uses the old signature — it is rewritten in Task 8; if tsc fails on it, note it and defer the fix to Task 8 within the same PR, or reorder locally by stubbing nothing — prefer running only this task's tests here and tsc at Task 8's end).

- [ ] **Step 5: Commit** — `git commit -m "feat(onboarding): typed triage/compare outcomes; buildStanding handles tie/skip/defer/set-aside"`

---

### Task 7: Purpose + Handoff copy

**Files:**
- Modify: `src/features/onboarding/WelcomePurpose.tsx`, `WelcomeHandoff.tsx`
- Modify: `src/features/onboarding/copy-a11y.test.tsx` (and `beats.test.tsx` if it pins these beats' copy)

- [ ] **Step 1: Failing tests** — assert the journey line on Purpose (`Add photos to a collection. Make items when you're ready. Sort in short rounds. See what you love most.` — may render as four lines; assert each phrase) and the two handoff expectation lines (`Begin with photos. They can wait in the pool until you make items.`, `Sort whenever you like, one gentle round at a time.`).
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** Purpose keeps heading + current collection-flow line + CTA; journey renders as a quiet `<p>` stack (`text-ink-soft`, no icons/arrows). Handoff keeps CTA + explore link + dismissal behavior unchanged.
- [ ] **Step 4: Run + PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(onboarding): purpose journey line + handoff expectations"`

---

### Task 8: `WelcomeTriage` rewrite — real controls in local mode

**Files:**
- Rewrite: `src/features/onboarding/WelcomeTriage.tsx`
- Modify: `src/features/onboarding/beats.test.tsx` (replace hand-rolled-internals tests with the below — superseded, not dropped)

**Interfaces:**
- Consumes: `DecisionControls`/`DeferControl`/`SetAsideButton` local mode (Tasks 2-4), `triageDecisions`, `ROUND_COPY` (Task 1), `TRIAGE_ITEMS`, `TriageOutcome` (Task 6).
- Produces: `WelcomeTriage({ index, onOutcome }: { index: number; onOutcome: (itemId: string, outcome: TriageOutcome) => void })`.

- [ ] **Step 1: Failing tests**

```tsx
it("renders the kicker + shared explainer and NOT the old reassurance line", () => {
  render(<WelcomeTriage index={0} onOutcome={vi.fn()} />);
  expect(screen.getByText(`A ${ROUND_COPY.triage.name} round`)).toBeInTheDocument();
  expect(screen.getByText(ROUND_COPY.triage.explainer)).toBeInTheDocument();
  expect(screen.queryByText(/no wrong answers/i)).not.toBeInTheDocument();
});
it("tier tap reports a tier outcome", async () => {
  const onOutcome = vi.fn();
  render(<WelcomeTriage index={0} onOutcome={onOutcome} />);
  await userEvent.click(screen.getByRole("button", { name: "Love" }));
  expect(onOutcome).toHaveBeenCalledWith(TRIAGE_ITEMS[0].id, { kind: "tier", tier: "love" });
});
it("Not yet reports deferred; Not mine reports setAside — and shows the touch caption", async () => {
  const onOutcome = vi.fn();
  render(<WelcomeTriage index={2} onOutcome={onOutcome} />);
  expect(screen.getByText("Not yet keeps it for later. Not mine sets it aside.")).toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", { name: /not mine/i }));
  expect(onOutcome).toHaveBeenCalledWith(TRIAGE_ITEMS[2].id, { kind: "setAside" });
});
it("never fetches", async () => { /* fetch spy around a full item's taps, not called */ });
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** Keep heading "How do you feel about this one?", image card, item name. Above the heading: kicker (`text-sm text-ink-soft`) `A Triage round` + explainer (both from `ROUND_COPY` — the mirror of the hub's pinning; composing "A {name} round" keeps the taught noun the hub's exact token). Controls: `<DecisionControls submit={{ kind: "local", onDecision: (d) => onOutcome(item.id, { kind: "tier", tier: RESULT_TO_TIER[d.result] }) }} type="triage" decisions={triageDecisions(item.id)} />`; beneath a hairline (mirroring the real triage row): `<DeferControl submit={{ kind: "local", onDecision: () => onOutcome(item.id, { kind: "deferred" }) }} itemId={item.id} />` and `<SetAsideButton submit={{ kind: "local", onDecision: () => onOutcome(item.id, { kind: "setAside" }) }} itemId={item.id} itemName={item.name} />`, then the caption `<p className="text-sm text-ink-soft">Not yet keeps it for later. Not mine sets it aside.</p>`. No provider is mounted (Task 4 makes that legal).
- [ ] **Step 4: Run + PASS; `npm run lint`.**
- [ ] **Step 5: Commit** — `git commit -m "feat(onboarding): triage beat renders real controls in local mode"`

---

### Task 9: `WelcomeCompare` rewrite — real `CompareChoice` in local mode

**Files:**
- Rewrite: `src/features/onboarding/WelcomeCompare.tsx`
- Modify: `src/features/onboarding/beats.test.tsx`

**Interfaces:**
- Consumes: `CompareChoice` local mode (Task 5), `COMPARE_PAIR`, `toItem`, `CompareOutcome` (Task 6), `ROUND_COPY`, `COMPARE_SUBLINE` (Task 1).
- Produces: `WelcomeCompare({ onOutcome }: { onOutcome: (outcome: CompareOutcome) => void })`.

- [ ] **Step 1: Failing tests** — kicker `A Compare round` + shared explainer + `COMPARE_SUBLINE` render; tapping the left card → `onOutcome({ kind: "win", winnerId: COMPARE_PAIR[0].id })`; Tie → `{ kind: "tie" }`; Skip → `{ kind: "skip" }`; fetch spy never called.
- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** Heading "Which do you love more?" stays; sub-line = `COMPARE_SUBLINE`. `<CompareChoice submit={{ kind: "local", onDecision: (result) => onOutcome(result === "item_a" ? { kind: "win", winnerId: left.id } : result === "item_b" ? { kind: "win", winnerId: right.id } : { kind: result }) }} itemA={toItem(left)} itemB={toItem(right)} heroA={left.imageSrc} heroB={right.imageSrc} comparisonsMade={0} />`.
- [ ] **Step 4: Run + PASS.**
- [ ] **Step 5: Commit** — `git commit -m "feat(onboarding): compare beat renders real CompareChoice with tie/skip"`

---

### Task 10: `WelcomeStanding` rewrite + new `WelcomeRefine`

**Files:**
- Rewrite: `src/features/onboarding/WelcomeStanding.tsx`
- Create: `src/features/onboarding/WelcomeRefine.tsx`
- Modify: `src/features/onboarding/beats.test.tsx`, `copy-a11y.test.tsx`

**Interfaces:**
- Consumes: `buildStanding`, `Standing`, outcome types (Task 6).
- Produces: `WelcomeStanding({ compare, triage, onNext }: { compare: CompareOutcome; triage: Record<string, TriageOutcome>; onNext: () => void })`; `WelcomeRefine({ onNext }: { onNext: () => void })`.

- [ ] **Step 1: Failing tests**

```tsx
it("titles the beat like the real results page, hero labeled 'What you love most'", …);
// heading "Where things stand"; hero item + "What you love most" as its (sub)heading text
it("affirmation is the LAST content: 'What you love most is at the top.'", () => {
  render(<WelcomeStanding compare={win} triage={allTiers} onNext={vi.fn()} />);
  const section = screen.getByRole("region", { name: /where things stand/i }); // or container query
  const paras = within(section).getAllByText(/./, { selector: "p, h2, h3, li" });
  expect(paras[paras.length - 1]).toHaveTextContent("What you love most is at the top.");
});
it("Onward items get 'Where these go next' in subordinate styling; absent when none", …);
it("set-aside row 'Waiting, whenever you want them' only after a Not mine", …);
it("deferred row 'Ready when you are' only after a Not yet", …);
it("all-deferred/set-aside: no hero, closes on 'You've made your choices.'", …);
it("refine beat quotes the real button name and the forward reference", () => {
  render(<WelcomeRefine onNext={vi.fn()} />);
  expect(screen.getByText(/put things in order/i)).toBeInTheDocument();
  expect(screen.getByText(/finalize it and share it/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement `WelcomeStanding`.** `const standing = buildStanding(compare, triage)`. Composition, in order: `<h2>` "Where things stand" → hero block (first ranked item, image + name + TierBadge, with the eyebrow "What you love most") → remaining ranked rows (as today) → *(only when non-empty, each with quiet eyebrow `text-xl text-ink-soft` mirroring `RankedResults.tsx:96-99`)* "Where these go next" (onward-tier rows), "Set aside — waiting, whenever you want them" (`standing.setAside`), "Ready when you are" (`standing.deferred`) → `<Button>` Continue → final `<p>` "What you love most is at the top." *(the affirmation is the last content element — nothing renders after it; if ordering the button before the line reads oddly, place the line immediately above the button but after ALL groups — pick one and pin it in the test)*. Empty-ranking variant: skip hero + affirmation; render "You've made your choices." as the closing line instead.
- [ ] **Step 4: Implement `WelcomeRefine`.** Heading e.g. "It keeps getting truer" is NOT specified — use spec copy exactly: two sentences: `The standing keeps updating as you sort — "Put things in order" starts another round whenever you want it truer.` and `When it feels complete, you can finalize it and share it.` plus a Continue button. Keep it one short screen; heading `Refine it any time` (`font-display`, matching other beats).
- [ ] **Step 5: Run + PASS.**
- [ ] **Step 6: Commit** — `git commit -m "feat(onboarding): standing mirrors real results; new refine beat"`

---

### Task 11: `WalkthroughShell` — seven beats, outcome state, focus, aria-live

**Files:**
- Modify: `src/features/onboarding/WalkthroughShell.tsx`
- Modify: `src/features/onboarding/WalkthroughShell.test.tsx` (heading assertions: line 43's "What you love most" → beat title "Where things stand"; keep a hero assertion pinning "What you love most" inside the beat)

**Interfaces:**
- Consumes: every prior task. `BEAT_ORDER = ["purpose", "triage", "usage", "compare", "standing", "refine", "handoff"]`.
- Produces: shell state `{ beat, triageIndex, triageOutcomes: Record<string, TriageOutcome>, compareOutcome: CompareOutcome | null }`.

- [ ] **Step 1: Failing tests**

```tsx
it("full happy path: purpose → 3 triage taps → compare → standing → refine → handoff", …);
it("tie path and skip path reach a standing with both pair items ranked", …);
it("defer path: deferred item does NOT resurface — 3 choices always reach compare", async () => {
  // tap Not yet on item 1, tiers on 2 and 3 → beat is compare, no 4th triage item
});
it("set-aside path shows the set-aside group in standing", …);
it("all-escapes path shows the calm variant", …);
it("skip-for-now on each beat dismisses and routes to /collections", …); // parameterized over beats
it("focus moves to the new beat's heading on advance", async () => {
  // after a tier tap: expect(document.activeElement).toBe(screen.getByRole("heading", { level: 2 } /* or the h1 */))
});
it("beat content is wrapped in an aria-live=polite region", () => {
  render(<WalkthroughShell />);
  expect(screen.getByText(/rediscover what you love/i).closest("[aria-live='polite']")).not.toBeNull();
});
```

- [ ] **Step 2: Run — FAIL.**
- [ ] **Step 3: Implement.** State: `triageOutcomes: Record<string, TriageOutcome>`, `compareOutcome: CompareOutcome | null`. `handleTriageOutcome(itemId, outcome)` records and advances (index+1 or → compare — deferred items never re-enter). `handleCompareOutcome` records → standing. `goTo("handoff")` keeps `dismissWelcome()`. Beat content wrapper: `<div aria-live="polite">…</div>`. Focus: `const headingRef = useRef<HTMLDivElement>(null)` on the wrapper (`tabIndex={-1}`) + `useEffect` on `[beat, triageIndex]` → `headingRef.current?.focus()` — focus the wrapper (not the heading element) so SR announces the region without stealing a labeled control's focus semantics; assert `document.activeElement === wrapper` in the test if targeting the heading proves brittle — pick ONE target and pin it.
- [ ] **Step 4: Run the whole onboarding suite** — `npx vitest run src/features/onboarding/` PASS. Extend `copy-a11y.test.tsx` to cover all new beat copy (refine beat, captions, kickers).
- [ ] **Step 5: Full gates** — `npm run test:ci && npm run lint && npm run build`.
- [ ] **Step 6: Commit** — `git commit -m "feat(onboarding): six-beat shell with typed outcomes, focus-on-advance, aria-live"`

---

### Task 12: e2e — `e2e/welcome-walkthrough.spec.ts`

**Files:**
- Create: `e2e/welcome-walkthrough.spec.ts`
- Read first: `e2e/auth.spec.ts` (sign-up pattern), `e2e/auth-navigation.spec.ts:19-31` (how other specs disarm the /welcome redirect — this spec does the OPPOSITE), `playwright.config.ts` (projects share one DB serially).

**Fixture design (from the spec — the suite's defaults fight this scenario):** use a **logged-out context** (`test.use({ storageState: { cookies: [], origins: [] } })`) and sign up a **fresh user unique per project run**: `const email = \`walkthrough-${testInfo.project.name}-${testInfo.workerIndex}-${Date.now()}@example.com\`` — the same DB serves all 3 device projects serially, so a fixed email collides on runs 2-3. Set no dismissal cookie.

- [ ] **Step 1: Write the spec (it IS the failing test until wired):**

```ts
test("zero-collection first login walks through and hands off", async ({ page }) => {
  // sign up fresh → expect redirect to /welcome
  await expect(page).toHaveURL(/\/welcome/);
  await page.getByRole("button", { name: "Show me how" }).click();
  await page.getByRole("button", { name: "Love" }).click();          // item 1
  await page.getByRole("button", { name: /tie/i }).waitFor({ state: "hidden" }).catch(() => {}); // still triage
  await page.getByRole("button", { name: "Like" }).click();          // item 2
  await page.getByRole("button", { name: /not mine/i }).click();     // item 3 — the kid's cushion
  await page.getByRole("button", { name: /tie/i }).click();          // compare: Tie
  await expect(page.getByRole("heading", { name: "Where things stand" })).toBeVisible();
  await expect(page.getByText(/waiting, whenever you want them/i)).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();     // standing → refine
  await expect(page.getByText(/put things in order/i)).toBeVisible();
  await page.getByRole("button", { name: /continue/i }).click();     // refine → handoff
  await page.getByRole("link", { name: "Start a collection" }).click();
  await expect(page).toHaveURL(/\/collections\/new/);
});

test("finishing then exploring dismisses for good", async ({ page }) => {
  // fresh user → /welcome → tap through to handoff → "I'll explore on my own"
  await expect(page).toHaveURL(/\/collections$/);
  await page.reload();
  await expect(page).toHaveURL(/\/collections$/);  // pins the dismissal — no /welcome loop
});

test("skip for now mid-walkthrough dismisses too", async ({ page }) => { /* same shape from beat 2 */ });
```

(Adapt selectors to the real sign-up form per `e2e/auth.spec.ts`; keep the three scenarios.)

- [ ] **Step 2: Run locally** — `npx playwright test e2e/welcome-walkthrough.spec.ts` (needs the dev/db setup the other e2e specs use — mirror their setup exactly). Expected: PASS against the completed feature.
- [ ] **Step 3: Verify CI wiring** — the `e2e` job's paths filter covers `e2e/**` and `src/features/**` (`.github/workflows/ci.yml:179-190`); confirm the new file is picked up by `playwright.config.ts`'s default glob (it is — any `e2e/**/*.spec.ts`). State this in the PR body.
- [ ] **Step 4: Commit** — `git commit -m "test(e2e): welcome walkthrough — gate redirect, full tap-through, dismissal paths"`

---

### Task 13: Ship

- [ ] **Step 1:** Full gates: `npm run build && npm run test:ci && npm run lint && npm run auth:verify && npm run test:db` (pre-push mirrors these).
- [ ] **Step 2:** Whole-branch adversarial review (per repo workflow — personas scaled: UX/tone, Craftsman, QA, Architect) wrapped in requesting/receiving-code-review; fold findings.
- [ ] **Step 3:** `/sync-docs` (walkthrough behavior may be referenced in ARCHITECTURE/README per `docs/doc-ownership.md`; never PRODUCT/TONE) and `graphify update .`.
- [ ] **Step 4:** `/pr-screenshots` — light + dark of each beat (UI PR rule).
- [ ] **Step 5:** PR: branch `walkthrough-fidelity` → `main`, squash-merge after review. Then `/close-out` (close bead, harvest lessons, delete `.git/sdd` scratch) — only after merge is confirmed.

## Self-review

- **Spec coverage:** every spec section maps to a task — shared copy (T1), union on four components (T2-T5), guard (T5), typed buildStanding (T6), seven beats (T7-T11), a11y contract (T11), e2e with fixture design (T12), TONE-fix hub explainers (T1), refine beat / user's manual-refine request honestly scoped (T10). Gaps: none found.
- **Type consistency:** `TriageOutcome`/`CompareOutcome`/`Standing` defined in T6, consumed with the same names in T8-T11; `DecisionSubmit` exported in T2; `submit` prop name uniform across T2-T5.
- **Placeholder scan:** none — the two "as today" references point at existing code the implementer keeps, not code to invent.
