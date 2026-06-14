---
name: adversarial-review
description: Use when reviewing a change, PR, or feature before merge, or when asked to red-team, find holes, stress-test, or critique work — especially to pressure-test test honesty (mock-heavy suites, tests that pass but don't run in CI, tautological assertions), security (authz, IDOR, injection, secrets), system design, simplicity, visual-design fidelity, and UX/accessibility. Use when a normal review felt too agreeable.
---

# Adversarial Review

## Overview

A structured, multi-persona review (QA/Test, Security, Architecture, Simplicity, Graphic Design, UX) that assumes the work is **guilty until proven exceptional** and is built to defeat LLM sycophancy. Standard review rubber-stamps; this one forces each persona to **find at least one real problem or prove, with evidence, that there isn't one.** Judge artifacts (the diff, the tests, the rendered UI), never stated intent.

**Core rule:** Violating the letter of these checks is violating the spirit. "It's probably fine" is not evidence.

## When to use

- Before merging any substantial feature or migration.
- When a normal/automated review came back clean and that felt too easy.
- When asked to "red-team this," "find holes," "what breaks," or "critique."
- Complements — does not replace — the spec-compliance + code-quality reviews in `superpowers:subagent-driven-development`. This adds the design/UX lenses and the test-honesty teeth those don't have.

When NOT to use: trivial/mechanical diffs (renames, dep bumps, copy tweaks) where the ceremony costs more than it finds.

## The personas

Run each persona independently (ideally as separate subagents so they don't anchor on each other). **Each must return ≥1 finding, or an explicit "CLEAN — here is the evidence I looked for and didn't find."** A persona that just says "looks good" has not done its job.

**Scale the set to the change.** A substantial feature gets all six. A backend-only change can skip Graphic Design/UX; a copy tweak might need only UX. Don't run a persona that has nothing to bite on — but don't skip one that does just to save time.

### 1. QA / Test — *break the test suite's credibility*
The suite passing means nothing until you prove it *could fail*. Check, in order:

1. **Does it actually run?** Is the test gated behind an env flag (`RUN_DB_TESTS`, `describe.skip`, `it.skip`, `test.only` leaking) or a runner/CI path that never executes it? **A test that doesn't run in CI is not a test — it's a comment.** Grep the CI workflow + test runner scripts and confirm the file is actually invoked.
2. **Mock theater.** Does the test mock the unit under test, or mock *all* internal collaborators with no un-mocked seam test anywhere? Mocking is only legitimate for **true boundaries** (network, time, auth session, external APIs/Blob) — never your own layers. If layer A's test mocks layer B, *some* test must exercise A→B for real, or the two mock contracts can drift silently.
3. **Tautology.** Does it assert only that a mock was called, rather than on real output/returned state? `expect(mock).toHaveBeenCalledWith(...)` with no assertion on a real result is theater.
4. **Seam coverage.** Is there ≥1 test that crosses the real layers end-to-end (request → service → repo → DB) with the business logic un-mocked?
5. **Negative + boundary space.** Error paths, partial failures, malformed input, re-thrown/unexpected errors, the empty/oversized cases — tested, or asserted only by a comment?
6. **Completeness — is everything that needs testing tested?** Don't trust a coverage %; line coverage can read 100% while branches, invariants, and seams go untested. Derive the obligation from the code instead: enumerate every public **behavior**, every **branch/decision**, every **error path**, every **invariant the unit claims** (often stated in a comment — "exactly one hero", "all-or-reject", "leaves the pool untouched"), every **seam** it crosses, and the **boundary inputs** (empty, max, malformed, duplicate, concurrent). Map a test to each and **name the ones with no test.** A claimed invariant with no test is the highest-value gap — that's how a real bug ships green.
7. **No waste — does every test earn its keep?** Flag for merge/deletion: two tests asserting the *same* behavior; the same rule tested redundantly at repo **and** service **and** route when one layer owns it; tests of trivial getters / framework / language behavior; tests so coupled to implementation they break on any refactor without catching a real bug; tests that can never fail (assert a constant, or only a mock's own return value). Lean coverage of the right things beats a bloated suite that is slow to run and expensive to change. (Over-mocking from check 2 is a common source of these — note the overlap.)

### 2. Security — *think like a hostile caller, not a builder*
Assume the caller is an attacker. Authorization enforced on **every** surface (member/owner re-checked server-side, not trusted from the client)? **IDOR / BOLA** — can you reach another tenant's row by changing an id? Injection (SQL, template, command)? Secrets/PII exposure in logs, responses, or the client bundle? SSRF, unsafe deserialization, missing rate limits, replayable tokens? Trust boundaries: does the server re-verify what the client claims, or take it on faith? Walk the OWASP Top 10 as a checklist, not a vibe.

### 3. Architect — *system design & correctness*
Do the seam contracts (arg order, types, status codes, response shape) line up across layers? Data integrity without a transaction — guards, idempotency, partial-failure states that are recoverable not corrupt? What breaks under concurrency, scale, or a malformed/oversized input? Does it actually do what it claims, including the error paths? Are the boundaries and names honest? Asks: **is it right?**

### 4. Craftsman — *simplicity & elegance*
The opposite pull from the Architect — and that tension is the point. Push for **the simplest thing that could possibly work** (DTSTTCPW): over-abstraction, premature generalization, a factory where a function would do; dead code, needless indirection, duplicated logic, an interface with one implementation that earns nothing. Could a whole layer, branch, or file be **deleted**? Would a senior engineer wince?

**But YAGNI is not a licence for debt.** It is an XP practice that stays safe *only* alongside continuous refactoring, automated tests, and CI — drop those and "simplest thing" rots into technical debt. So flag the inverse too: a simplification bought by skipping the safety net (no test, or one that doesn't run in CI) is under-engineering, not elegance — hand that to the QA persona. Honors this repo's "no premature abstraction / DRY within reason." Asks: **is it more than it needs to be — and is the simplicity backed by tests + CI, or is it just debt?**

### 5. Graphic Design — *visual fidelity*
Accountable to **`DESIGN.md`** (the "Adored" luminous system: role-based tokens — `ink`/`surface`/`primary #004a67`/accent aqua-sky-cornflower-periwinkle/`spark`/tier colours; Playfair Display for display type). Are real tokens used, not invented or hard-coded hexes? **Both light and dark** themes correct? Contrast meets **WCAG 2.1 AA**? Spacing, elevation, type scale, and rhythm consistent with the system, not ad hoc?

### 6. UX — *usability & interaction*
Accountable **first** to `TONE.md` and `PRODUCT.md`: when a generic UX convention conflicts with the tone contract, the contract wins (this product forbids swiping, so "respect standard swipe gestures" does **not** apply; it is not a catalog, so SKU/inventory idioms do not).

**Depth via `ui-ux-pro-max`:** when reviewing rendered UI, invoke the installed `ui-ux-pro-max` skill (99 UX guidelines, accessibility, interaction states, design-system reasoning) for heuristic depth — then **re-judge its output against `TONE.md`** and discard anything that conflicts with the first-order contract (swipe gestures, platform/catalog idioms). It is the engine; the tone contract is the authority. It's an optional dependency: if it isn't loaded, the heuristics below are the floor. Either way, name the law you're applying — don't review on vibes:

- **Fitts's Law** — primary/most-frequent actions large and reachable; targets ≥44px with real spacing; never seat a destructive action against a primary one.
- **Hick's Law** — fewer choices per step; progressive disclosure; one decision at a time, never the whole pile.
- **Miller's Law / Cognitive Load** — chunk information; don't front-load a wall of options; show, don't make them recall.
- **Jakob's Law** — meet learned expectations for controls the user already knows — *except* where the contract demands a gentler, non-standard pattern.
- **Peak-End Rule** — the end of a flow (the confirmation, the error recovery) dominates memory; make success affirming and recovery painless.
- **Norman — affordances, signifiers, feedback** — interactive things look interactive; state is visible; every action gets feedback within ~100–300ms (loading / optimistic / confirm).
- **Gestalt** — proximity, alignment, and grouping carry meaning; related controls read as one unit.
- **Error prevention > error messages** — make the wrong action hard; confirm destructive/irreversible ones; never lose the user's input on failure.

**Anti-patterns to flag:** colour as the *only* signal; icon-only controls without a label/aria; hover-only interactions (no touch/keyboard equivalent); instant 0ms state changes (no feedback); layout shift / content jump; horizontal scroll; disabled zoom; a "select-all → act on the whole pile" gesture.

**Accessibility (WCAG 2.1 AA):** keyboard-operable, visible focus, correct roles / `aria-pressed` / live regions, real labels, 4.5:1 text contrast, a reduced-motion path.

**Tone checks (first-order):** affirming and judgement-free; tap-first, **no swiping** (drag only where it genuinely helps); no gamification (confetti/streaks/scores); no shaming metrics ("N incomplete / too many"); no catalog/inventory framing; gentle, reversible error / empty / loading states. Apply the `TONE.md` litmus: does the copy speak from the *person's* side or the *machine's*?

## Method: forced debate

For each candidate finding, run one author↔reviewer round before accepting it:
1. **Reviewer** states the finding + how to reproduce/observe it.
2. **Author** (steelman the code) rebuts: is it actually wrong, or already handled elsewhere?
3. **Reviewer** concedes (drop it) or escalates (keep it, note the rebuttal was insufficient).

Assign each surviving finding a **confidence 1–10** and a severity. A finding raised independently by two personas is **promoted** one severity level — convergence is signal.

## Verdict

End with one line: **BLOCK** / **CONCERNS** / **CLEAN**.
- **BLOCK** — ≥1 finding that would ship a real defect (security hole, untested critical guard, broken seam, AA failure, tone violation).
- **CONCERNS** — real issues, none merge-blocking; list them with severities.
- **CLEAN** — each persona looked hard and documented what it checked. Rare; suspicious if reached quickly.

Output: per-persona findings (file:line, confidence, severity, the debate outcome), then the verdict. Be specific; cite artifacts.

## Rationalizations to reject

| Excuse | Reality |
|--------|---------|
| "The suite is green." | Green means nothing if the real-behavior test is `describe.skip`ped in CI. Prove it runs. |
| "Coverage is 100%." | Line coverage ≠ behaviour coverage — untested branches, claimed invariants, and seams hide at 100%. Enumerate behaviours and map a test to each. |
| "More tests is safer." | Duplicate/low-value tests cost maintenance and slow the suite without catching more bugs. Each test must earn its keep. |
| "Mocking the repo is fine — the repo is tested elsewhere." | Only if *some* test crosses the seam un-mocked. Two mock contracts drift silently. |
| "It asserts the mock was called." | That's testing your test setup, not the behavior. Assert on real output/state. |
| "Looks on-brand." | Open DESIGN.md. Name the tokens. Check dark mode + AA contrast, don't eyeball. |
| "Reads gently enough." | Check it against TONE.md commitments explicitly, not vibes. |
| "Each persona didn't find much." | Then show what each one *looked for*. "Nothing found" without evidence is a skipped review. |

## Red flags — the review itself is too soft

- A persona returned "LGTM"/"looks good" with no specific artifact cited.
- CLEAN reached without naming what was checked.
- No finding about tests that are skipped/gated/CI-absent on a change that added tests.
- QA reached CLEAN without enumerating the behaviours / branches / claimed invariants / seams that must be tested and mapping each to a test (or to an explicit gap).
- Design/UX personas never opened DESIGN.md / TONE.md.

**Any of these mean: the review didn't happen. Re-run that persona harder.**
