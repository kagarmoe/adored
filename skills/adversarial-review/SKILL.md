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

### 2. Security — *think like a hostile caller, not a builder*
Assume the caller is an attacker. Authorization enforced on **every** surface (member/owner re-checked server-side, not trusted from the client)? **IDOR / BOLA** — can you reach another tenant's row by changing an id? Injection (SQL, template, command)? Secrets/PII exposure in logs, responses, or the client bundle? SSRF, unsafe deserialization, missing rate limits, replayable tokens? Trust boundaries: does the server re-verify what the client claims, or take it on faith? Walk the OWASP Top 10 as a checklist, not a vibe.

### 3. Architect — *system design & correctness*
Do the seam contracts (arg order, types, status codes, response shape) line up across layers? Data integrity without a transaction — guards, idempotency, partial-failure states that are recoverable not corrupt? What breaks under concurrency, scale, or a malformed/oversized input? Does it actually do what it claims, including the error paths? Are the boundaries and names honest? Asks: **is it right?**

### 4. Craftsman — *simplicity & elegance*
The opposite pull from the Architect — and that tension is the point. The simplest thing that works; **YAGNI**; over-abstraction, premature generalization, a factory where a function would do; dead code, needless indirection, duplicated logic, an interface with one implementation that earns nothing. Could a whole layer, branch, or file be **deleted**? Would a senior engineer wince? Honors this repo's "no premature abstraction / DRY within reason" rule. Asks: **is it more than it needs to be?**

### 5. Graphic Design — *visual fidelity*
Accountable to **`DESIGN.md`** (the "Adored" luminous system: role-based tokens — `ink`/`surface`/`primary #004a67`/accent aqua-sky-cornflower-periwinkle/`spark`/tier colours; Playfair Display for display type). Are real tokens used, not invented or hard-coded hexes? **Both light and dark** themes correct? Contrast meets **WCAG 2.1 AA**? Spacing, elevation, type scale, and rhythm consistent with the system, not ad hoc?

### 6. UX — *usability & interaction*
Accountable to **`TONE.md`** (first-order) and **`PRODUCT.md`**. Affirming, judgement-free, low-cognitive-load? One decision at a time — never the whole pile? **Tap-first, no swiping** (drag only where it genuinely helps); touch targets ≥44px. No gamification, no shaming metrics ("N incomplete/too many"), no catalog/inventory framing. Error/empty/loading states honest and gentle? Keyboard + screen-reader operable (roles, `aria-pressed`, live regions, focus)?

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
| "Mocking the repo is fine — the repo is tested elsewhere." | Only if *some* test crosses the seam un-mocked. Two mock contracts drift silently. |
| "It asserts the mock was called." | That's testing your test setup, not the behavior. Assert on real output/state. |
| "Looks on-brand." | Open DESIGN.md. Name the tokens. Check dark mode + AA contrast, don't eyeball. |
| "Reads gently enough." | Check it against TONE.md commitments explicitly, not vibes. |
| "Each persona didn't find much." | Then show what each one *looked for*. "Nothing found" without evidence is a skipped review. |

## Red flags — the review itself is too soft

- A persona returned "LGTM"/"looks good" with no specific artifact cited.
- CLEAN reached without naming what was checked.
- No finding about tests that are skipped/gated/CI-absent on a change that added tests.
- Design/UX personas never opened DESIGN.md / TONE.md.

**Any of these mean: the review didn't happen. Re-run that persona harder.**
