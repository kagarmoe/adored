# PR1b — pv9 polish: role badge, primitive a11y, member/invite forms — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development. Steps use `- [ ]`. Spec: `docs/superpowers/specs/2026-06-23-ui-experience-design.md` §5.2–5.5 (+ PR1a review deferrals).

**Goal:** Finish the Epic-A design-system polish: route roles through the existing Badge variants (kill the tier-ramp-for-identity bug), give the shared error/input primitives their a11y affordances, clean up the member/invite forms, and add the members e2e — all low-risk, no auth/JWT change.

**Architecture:** Reuse what exists. `Badge` already ships `owner`/`curator` variants — `RoleBadge` is a thin wrapper. The a11y fixes mirror PR1a's `Input` label fix. No new tokens, no schema, no API change.

**Tech Stack:** Next.js, TypeScript, Vitest + @testing-library (jsdom), Playwright e2e.

## Global Constraints

- **Design (DESIGN.md):** real tokens only; **roles are identity, not tiers** — never the value-ramp tokens (`top/high/medium/low`) for a role; Owner=`accent-periwinkle`, Curator=`accent-aqua` (the existing AA-locked Badge variants). Colour never the sole signal (label always present). ≥44px; `:focus-visible` never bare `outline:none`.
- **a11y (WCAG 2.1 AA, both themes):** label↔control association; error text associated via `aria-describedby` + `aria-invalid`; status/errors announced via a live region (`role="alert"`/`role="status"`).
- **Tone (TONE.md):** gentle, person-side; no shaming/count; identity not leaderboard.
- **Tests:** TDD failing-first; component tests `// @vitest-environment jsdom`; e2e under `e2e/**`; un-mocked-seam under `src/lib/db/`. Coverage floor 82. Every changed primitive's new a11y behavior gets a real assertion.
- **Git:** one logical change per commit; never commit to `main`. graphify: `graphify query` before reading source; `graphify update .` after.

---

### Task 1: `RoleBadge` + fix `MemberList` tier-ramp-for-identity (purses-c0w)

**Files:** Create `src/features/collections/RoleBadge.tsx` (+ `.test.tsx`); Modify `src/features/collections/MemberList.tsx`.

**Interfaces:** Produces `RoleBadge({ role: "owner" | "curator" | string })` → renders the matching **existing** `Badge` variant (`owner`/`curator`) with a visible label ("Owner"/"Curator"); any non-owner role → curator treatment. No new colour token.

- [ ] **Step 1: Read.** `graphify query "Badge variant owner curator MemberList role"`; confirm `src/components/ui/Badge.tsx` has `owner: bg-accent-periwinkle text-ink` and `curator: bg-accent-aqua text-ink` (it does). Read `MemberList.tsx`.
- [ ] **Step 2: Failing test** (`RoleBadge.test.tsx`, jsdom):
```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { RoleBadge } from "./RoleBadge";
it("renders an Owner badge on the role token, not a tier token", () => {
  const { container } = render(<RoleBadge role="owner" />);
  expect(screen.getByText("Owner")).toBeInTheDocument();
  // identity, not the value-ramp: must use the role variant, never tier-* tokens
  expect(container.querySelector(".bg-accent-periwinkle")).not.toBeNull();
  expect(container.querySelector(".bg-tier-like, .bg-tier-maybe")).toBeNull();
});
it("treats any non-owner role as Curator", () => {
  render(<RoleBadge role="curator" />);
  expect(screen.getByText("Curator")).toBeInTheDocument();
});
```
- [ ] **Step 3: Run → FAIL.** `npx vitest run src/features/collections/RoleBadge.test.tsx`.
- [ ] **Step 4: Implement** `RoleBadge.tsx`: `<Badge variant={role === "owner" ? "owner" : "curator"}>{role === "owner" ? "Owner" : "Curator"}</Badge>`. Then in `MemberList.tsx` replace the `Badge variant={member.role === "owner" ? "high" : "medium"}` block (the tier-ramp mis-map) with `<RoleBadge role={member.role} />`. Also replace the raw `userId` secondary line / fallback with a gentler identity (show `member.name`; if absent, the member's email if available, else nothing — do NOT surface the raw ULID as the primary identity).
- [ ] **Step 5: Run → PASS** + `npx vitest run src/features/collections` (MemberList tests still green).
- [ ] **Step 6: Commit.** `feat(members): RoleBadge over existing Badge variants; drop tier-ramp-for-identity (purses-c0w)`

---

### Task 2: `ErrorMessage` live region (purses-na0a) + de-dupe ProfileForm wrapper

**Files:** Modify `src/components/ui/ErrorMessage.tsx` (+ test create/extend); Modify `src/features/profile/ProfileForm.tsx`.

**Interfaces:** Produces `ErrorMessage` that announces via `role="alert"` (assertive) by default, overridable via props.

- [ ] **Step 1: Read.** `graphify query "ErrorMessage role alert aria-live forwardRef"`; read `ErrorMessage.tsx` (plain `<div>`, forwardRef, spreads `...props`) and `ProfileForm.tsx` (currently wraps it in its own `<div role="alert">`).
- [ ] **Step 2: Failing test** (`src/components/ui/ErrorMessage.test.tsx`, jsdom):
```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { ErrorMessage } from "./ErrorMessage";
it("announces via an assertive alert role", () => {
  render(<ErrorMessage message="Boom" />);
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Boom");
});
```
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement.** Give the `ErrorMessage` root `<div>` `role="alert"` (default; keep `{...props}` AFTER so a caller can override). Then in `ProfileForm.tsx` remove the now-redundant outer `<div role="alert">` wrapper (the component announces itself) — render `{error && <ErrorMessage message={error} />}` directly. Update `ProfileForm.test.tsx` if its alert query depended on the wrapper (it queries `getByRole("alert")`, which still resolves — to the ErrorMessage now).
- [ ] **Step 5: Run → PASS** + `npx vitest run src/components/ui src/features/profile`.
- [ ] **Step 6: Commit.** `a11y(error): ErrorMessage announces via role=alert; de-dupe ProfileForm wrapper (purses-na0a)`

---

### Task 3: `Textarea` a11y — label + error association + focus-visible (completes purses-1qor)

**Files:** Modify `src/components/ui/Textarea.tsx` (+ test create).

**Interfaces:** `Textarea` label associated via `useId()`/`htmlFor`/`id`; error associated via `aria-describedby` + `aria-invalid`; ring on `:focus-visible`.

- [ ] **Step 1: Read.** `graphify query "Textarea label error focus"`; read `Textarea.tsx` (same gaps Input had pre-PR1a: no `htmlFor`/`id`, error `<p>` unassociated, `:focus` not `:focus-visible`).
- [ ] **Step 2: Failing test** (`src/components/ui/Textarea.test.tsx`, jsdom):
```tsx
// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { Textarea } from "./Textarea";
it("associates the label with the control", () => {
  render(<Textarea label="Story" value="" onChange={() => {}} />);
  expect(screen.getByLabelText("Story")).toBeInstanceOf(HTMLTextAreaElement);
});
it("associates the error text and marks the control invalid", () => {
  render(<Textarea label="Story" error="Too long" value="" onChange={() => {}} />);
  const ta = screen.getByLabelText("Story");
  expect(ta).toHaveAttribute("aria-invalid", "true");
  expect(ta.getAttribute("aria-describedby")).toBeTruthy();
  expect(screen.getByText("Too long").id).toBe(ta.getAttribute("aria-describedby"));
});
```
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement.** `useId()` → `textareaId` (prefer explicit `id` prop); `<label htmlFor={textareaId}>` + `<textarea id={textareaId}>`. When `error`: give the `<p>` `id={`${textareaId}-error`}`, set `aria-describedby` + `aria-invalid` on the textarea. Switch `focus:ring-2 focus:ring-primary` → `focus-visible:ring-2 focus-visible:ring-primary` (keep `focus:outline-none`).
- [ ] **Step 5: Run → PASS** + `npx vitest run src/components/ui`.
- [ ] **Step 6: Commit.** `a11y(textarea): label + error association + focus-visible (completes purses-1qor)`

---

### Task 4: `Input` error association + focus-visible (PR1a review deferrals)

**Files:** Modify `src/components/ui/Input.tsx` (+ extend `Input.test.tsx`).

**Interfaces:** `Input` error associated via `aria-describedby` + `aria-invalid`; ring on `:focus-visible` (label association already shipped in PR1a).

- [ ] **Step 1: Read.** `graphify query "Input error focus-visible aria-describedby"`; read the current `Input.tsx` (PR1a added `useId` label assoc; the error `<p>` is still unassociated and the ring is on `:focus`).
- [ ] **Step 2: Failing test** (extend `src/components/ui/Input.test.tsx`):
```tsx
it("associates the error text and marks the control invalid", () => {
  render(<Input label="Name" error="Required" value="" onChange={() => {}} />);
  const input = screen.getByLabelText("Name");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(screen.getByText("Required").id).toBe(input.getAttribute("aria-describedby"));
});
```
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement.** Mirror Task 3: error `<p id={`${inputId}-error`}>`, `aria-describedby` + `aria-invalid` on the input when `error` is set; `:focus` ring → `:focus-visible` (keep `focus:outline-none`).
- [ ] **Step 5: Run → PASS** + `npx vitest run src/components/ui src/features` (consumers green).
- [ ] **Step 6: Commit.** `a11y(input): error association + focus-visible (PR1a review folds)`

---

### Task 5: `InviteForm` — timer cleanup (purses-th14) + live-region success + polish

**Files:** Modify `src/features/collections/InviteForm.tsx` (+ extend `InviteForm.test.tsx`).

**Interfaces:** success `setTimeout` cleared on unmount; success surface announced via `role="status"`.

- [ ] **Step 1: Read.** `graphify query "InviteForm setTimeout success state useEffect cleanup"`; read `InviteForm.tsx` (the `setTimeout(() => setSuccess(false), 3000)` has no cleanup → state update on unmounted; success div is not a live region).
- [ ] **Step 2: Failing test** (extend `InviteForm.test.tsx`): assert the success confirmation is announced via `role="status"`; and a cleanup test — render, trigger success, unmount before the timer fires, advance fake timers, and assert no "state update on unmounted" warning / no throw. Use `vi.useFakeTimers()`.
```tsx
it("announces a sent invitation via role=status", async () => {
  // ...mock apiPost resolve, submit a valid email...
  expect(await screen.findByRole("status")).toHaveTextContent(/sent/i);
});
it("clears the success timer on unmount (no state update after unmount)", async () => {
  vi.useFakeTimers();
  // ...submit, success shown, then unmount(), then vi.advanceTimersByTime(3000)...
  // expect no act() warning / no throw
  vi.useRealTimers();
});
```
- [ ] **Step 3: Run → FAIL.**
- [ ] **Step 4: Implement.** Move the success auto-reset into a `useEffect(() => { if (!success) return; const t = setTimeout(() => setSuccess(false), 3000); return () => clearTimeout(t); }, [success])`. Wrap the success confirmation in `role="status" aria-live="polite"`. Keep the design tokens; ≥44px.
- [ ] **Step 5: Run → PASS** + `npx vitest run src/features/collections`.
- [ ] **Step 6: Commit.** `fix(invite): clear success timer on unmount + announce via role=status (purses-th14)`

---

### Task 6: Members + invitations e2e spec (purses-nvj)

**Files:** Create `e2e/members.spec.ts`.

**Interfaces:** Consumes the auth fixture + `e2e/fixtures/ui.ts`/`seed.ts`. Asserts the members surface: the owner sees the RoleBadge(s) + InviteForm; sending an invitation shows the announced success; the accept-invitation page renders; remove is gated to non-owner rows.

- [ ] **Step 1: Read.** `graphify query "e2e members invitations seed collection owner curator accept-invitation"`; read `e2e/fixtures/seed.ts` (what members/collections it seeds), `e2e/fixtures/api-auth.ts`, the members page route, and the accept-invitation route. Determine which assertions the seed supports without new seeding.
- [ ] **Step 2: Write `e2e/members.spec.ts`** (3-viewport, fixture auth): owner visits `/collections/<slug>/members` → sees RoleBadge "Owner" and the email-only InviteForm; submitting a valid email shows the `role=status` success; (if the seed supports it) a second member row shows a "Curator" RoleBadge and a Remove control, and the owner's own row has no Remove. Keep it deterministic (unique invite email per run); do not depend on cross-spec state.
- [ ] **Step 3: Run e2e** (Docker up): `npx playwright test e2e/members.spec.ts`. If a needed fixture (a second member/invitation) is missing, either seed it within the spec via the API or scope the spec to what the baseline seed supports — note which.
- [ ] **Step 4: Cross-spec safety.** Run the broader suite (at least members + auth-navigation + layout) to confirm no interference.
- [ ] **Step 5: Commit.** `test(e2e): members + invitations spec (purses-nvj)`

---

### Task 7: Confirm PhotoDeleteControl any-curator coverage (§5.4) + items-page test reconcile (§5.5)

**Files:** Possibly Modify `src/app/collections/[id]/items/[itemNumber]/page.test.tsx` and/or `page.tsx` (only if a real drift is found).

- [ ] **Step 1: Read.** `graphify query "item detail page PhotoDeleteControl photos write capability membership"`; read `src/app/collections/[id]/items/[itemNumber]/page.tsx`, `src/features/items/PhotoDeleteControl.tsx`, and the photos DELETE route's capability (`src/app/api/collections/[id]/items/[itemId]/photos/[photoId]/route.ts`).
- [ ] **Step 2: Confirm §5.4.** `page.test.tsx:96-102` already asserts "any curator sees the delete control" and runs in `test:ci`. Verify it still passes: `npx vitest run "src/app/collections/[id]/items/[itemNumber]/page.test.tsx"`. If green, §5.4 is discharged by an executed CI assertion — record that; no code change.
- [ ] **Step 3: Reconcile §5.5.** Compare the page's actual delete-control gating (what membership/role gates `PhotoDeleteControl` rendering) against (a) the test's expectation and (b) the photos:write API capability (member-or-owner). If all three agree, the test is correct — add a one-line comment documenting that the assertion matches the photos:write contract (resolving the "stricter than API" note), commit as a docs-in-test clarification. If they DISAGREE (the page shows/hides the control under a condition the API doesn't enforce, or vice versa), fix the page to match the API capability and update the test — do not weaken the test to pass a wrong page.
- [ ] **Step 4:** Run `npx vitest run "src/app/collections/[id]/items"`.
- [ ] **Step 5: Commit.** `test(items): reconcile item-detail delete-control test to photos:write contract (spec §5.5); confirm any-curator coverage (§5.4)`

---

## Definition of done (PR1b)

- [ ] All tasks committed; `npm run build`, `test:ci`, `lint`, `auth:verify` green; `RUN_DB_TESTS=1 npm run test:db` green (no DB-layer change expected, but run it).
- [ ] `graphify update .`; `/sync-docs` (likely none — no API/schema change; DESIGN.md unaffected as we use existing tokens; confirm).
- [ ] Light+dark screenshots of the **members** surface (RoleBadge + InviteForm) embedded inline in the PR body (extend `e2e/screenshots/capture.ts` — `members` surface already captured; re-capture).
- [ ] Whole-branch adversarial review (Design/UX/a11y/QA) run; folds applied.
- [ ] CI green incl. selective e2e; PR merged; close beads **purses-c0w, purses-na0a, purses-1qor, purses-th14, purses-nvj** via `/close-out` after merge.

## Self-review notes
- **Spec coverage:** §5.2→T1, §5.3→T2/T5, §5.4→T7, §5.5→T7; PR1a deferrals (Textarea, Input error/focus-visible) →T3/T4; nvj→T6.
- **Type consistency:** `RoleBadge({ role })` (T1) maps to the existing Badge `owner`/`curator` variants (no new tokens). The `aria-describedby` id pattern (`${id}-error`) is identical in Input (T4) and Textarea (T3).
- **Closes:** c0w, na0a, 1qor (Input+Textarea both now), th14, nvj. (purses-wew/y1o/asz closed in PR1a.)
