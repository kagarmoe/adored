# Collection-Home Continue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** State-aware Continue section (progress-keyed start card, "Sort wins" primary), soft resume copy, one shared `SessionResumeCard`.

**Architecture:** A presentational `SessionResumeCard` (shell + heading + body; the ENTIRE action area is a slot) consumed by `ActiveSessionPanel` (workspace) and the sort hub. `ActiveSessionPanel` gains a start-card branch after undo/settled/session precedence.

**Tech Stack:** React 19 client components, Next.js App Router server pages, vitest+RTL, Playwright.

**Spec:** `docs/superpowers/specs/2026-07-17-collection-home-continue-design.md` (rev 2). Read it first.

## Global Constraints

- Copy, verbatim: active heading **"Keep sorting"**; paused heading **"Your sort is paused"** (unchanged); paused body **"Your sort is safe — pick up where you left off."** (unchanged); active body fallback **"Pick up where you left off — one decision at a time."**; never-sorted start card **"Start sorting"** / **"Begin with how you feel about each."**; sorted-before start card **"Keep sorting"** / **"Pick up where you left off — one decision at a time."**
- No status `Badge` on the card. Card headings render at the consumer-chosen level: workspace `h3`, hub `h2`.
- The #351 invariant holds: no session + no undo + no settled + no `startHref` → the panel renders NOTHING (no heading).
- Undo/settled precedence over the start card.
- The workspace card keeps `dark:bg-surface-raised dark:shadow-raised` (pinned test); the hub card keeps plain `bg-content-soft`.
- e2e copy updates required in ALL of: `session-undo.spec.ts`, `session-pause.spec.ts`, `session-create-after-set-aside.spec.ts`.
- TDD; commit per task; `npm run lint` 0 errors after each task.

---

### Task 1: `SessionResumeCard` + hub adoption

**Files:**
- Create: `src/features/sessions/SessionResumeCard.tsx`, `src/features/sessions/SessionResumeCard.test.tsx`
- Modify: `src/app/collections/[id]/sort/page.tsx` (~L58–91: replace the hand-written card)
- Modify: `e2e/session-pause.spec.ts`, `e2e/session-create-after-set-aside.spec.ts` (copy assertions "Active session" → "Keep sorting" — grep each file; session-undo is updated in Task 2 with the workspace side, but if its assertions hit the hub too, update here)

**Interfaces — Produces:**

```tsx
interface SessionResumeCardProps {
  status: "active" | "paused";
  goal: string | null;
  headingLevel: "h2" | "h3";
  className?: string;   // extra Card classes (workspace dark elevation)
  actions: ReactNode;   // the ENTIRE action area (consumer-owned)
}
export function SessionResumeCard(props: SessionResumeCardProps): JSX.Element
```

- [ ] **Step 1: Failing tests** (`SessionResumeCard.test.tsx`, jsdom + jest-dom, standard file header):

```tsx
it("active: 'Keep sorting' heading at the given level, goal as body", () => {
  render(<SessionResumeCard status="active" goal="Find favorites" headingLevel="h3" actions={<button>Go</button>} />);
  const h = screen.getByRole("heading", { name: "Keep sorting" });
  expect(h.tagName).toBe("H3");
  expect(screen.getByText("Find favorites")).toBeInTheDocument();
  expect(screen.queryByText("active")).not.toBeInTheDocument(); // no status Badge
});
it("active without a goal: the gentle fallback line", () => {
  render(<SessionResumeCard status="active" goal={null} headingLevel="h2" actions={null} />);
  expect(screen.getByRole("heading", { name: "Keep sorting" }).tagName).toBe("H2");
  expect(screen.getByText("Pick up where you left off — one decision at a time.")).toBeInTheDocument();
});
it("paused: paused heading + safe line, no badge", () => {
  render(<SessionResumeCard status="paused" goal="x" headingLevel="h3" actions={null} />);
  expect(screen.getByRole("heading", { name: "Your sort is paused" })).toBeInTheDocument();
  expect(screen.getByText("Your sort is safe — pick up where you left off.")).toBeInTheDocument();
  expect(screen.queryByText(/^paused$/)).not.toBeInTheDocument();
});
it("renders the actions slot", () => {
  render(<SessionResumeCard status="active" goal={null} headingLevel="h3" actions={<button>Resume</button>} />);
  expect(screen.getByRole("button", { name: "Resume" })).toBeInTheDocument();
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement** (mirror the existing card markup in `ActiveSessionPanel.tsx` L172–188 minus Badge; `const Heading = headingLevel;`):

```tsx
import type { ReactNode } from "react";
import { Card } from "@/components/ui";

interface SessionResumeCardProps {
  status: "active" | "paused";
  goal: string | null;
  headingLevel: "h2" | "h3";
  className?: string;
  actions: ReactNode;
}

/**
 * The one resume card (workspace Continue + sort hub) — shell, heading, and
 * body only. The ENTIRE action area is the consumer's: the workspace swaps
 * Resume for its set-aside confirm group mid-flow; the hub renders
 * Resume+Details. Strings live here so a tone pass lands on both surfaces.
 */
export function SessionResumeCard({ status, goal, headingLevel, className = "", actions }: SessionResumeCardProps) {
  const Heading = headingLevel;
  const paused = status === "paused";
  return (
    <Card padding="lg" className={`border-hairline bg-content-soft ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading className="mb-2 text-lg text-ink">
            {paused ? "Your sort is paused" : "Keep sorting"}
          </Heading>
          <p className="text-sm text-ink">
            {paused
              ? "Your sort is safe — pick up where you left off."
              : goal || "Pick up where you left off — one decision at a time."}
          </p>
        </div>
        {actions}
      </div>
    </Card>
  );
}
```

- [ ] **Step 4:** Hub adoption in `sort/page.tsx`: replace the `{currentSession && <Card …>}` block with `SessionResumeCard` (`headingLevel="h2"`, no className), `actions` = the existing grid div (ResumeControl/Link + Details) verbatim. Delete now-unused `Badge` import if unused elsewhere in the file.
- [ ] **Step 5:** Update hub-related e2e copy assertions per the Files list. Run `npx vitest run src/features/sessions src/features/sorting` + `npm run lint` → green. **Step 6: Commit** — `git commit -am "feat(home): shared SessionResumeCard, hub adoption, soft copy"`

---

### Task 2: `ActiveSessionPanel` — card adoption + start card + copy

**Files:**
- Modify: `src/features/sessions/ActiveSessionPanel.tsx`
- Test: `src/features/sessions/ActiveSessionPanel.test.tsx`
- Modify: `e2e/session-undo.spec.ts` (copy assertions)

**Interfaces — Produces:** `ActiveSessionPanelProps` gains `startHref?: string; hasEverSorted?: boolean` (default false).

- [ ] **Step 1: Failing tests:**

```tsx
it("no session + startHref (never sorted): the start card with wireframe copy, primary link", () => {
  render(<ActiveSessionPanel curatorId="u1" session={null} resumeHref="/x" startHref="/collections/c/sort/new" hasEverSorted={false} />);
  expect(screen.getByRole("heading", { name: "Continue" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Start sorting" })).toBeInTheDocument();
  expect(screen.getByText("Begin with how you feel about each.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Start sorting" })).toHaveAttribute("href", "/collections/c/sort/new");
});
it("no session + startHref (sorted before): progress-aware copy", () => {
  render(<ActiveSessionPanel curatorId="u1" session={null} resumeHref="/x" startHref="/s" hasEverSorted />);
  expect(screen.getByRole("heading", { name: "Keep sorting" })).toBeInTheDocument();
  expect(screen.getByText("Pick up where you left off — one decision at a time.")).toBeInTheDocument();
});
it("startHref absent and no session: still renders NOTHING (the #351 pin)", () => {
  const { container } = render(<ActiveSessionPanel curatorId="u1" session={null} resumeHref="/x" />);
  expect(container).toBeEmptyDOMElement();
});
it("undo takes precedence over the start card", async () => {
  (global.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: true });
  const { rerender } = render(<ActiveSessionPanel curatorId="u1" session={session} resumeHref="/x" startHref="/s" />);
  fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
  fireEvent.click(screen.getByRole("button", { name: /^set aside$/i }));
  await screen.findByRole("status");
  rerender(<ActiveSessionPanel curatorId="u1" session={null} resumeHref="/x" startHref="/s" />);
  expect(screen.queryByRole("heading", { name: "Start sorting" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: /undo/i })).toBeInTheDocument();
});
it("session card: 'Keep sorting', no badge, fallback line", () => {
  render(<ActiveSessionPanel curatorId="u1" session={{ ...session, goal: null }} resumeHref="/x" />);
  expect(screen.getByRole("heading", { name: "Keep sorting" })).toBeInTheDocument();
  expect(screen.queryByText(/^active$/)).not.toBeInTheDocument();
  expect(screen.getByText("Pick up where you left off — one decision at a time.")).toBeInTheDocument();
});
```

- [ ] **Step 2:** Run → FAIL (plus existing "Active session" assertions — update them to "Keep sorting" as part of Step 3's port).
- [ ] **Step 3: Implement:** (a) replace the session-card JSX with `SessionResumeCard` (`headingLevel="h3"`, `className="dark:bg-surface-raised dark:shadow-raised"`, `actions` = the existing confirm-flow ternary block moved verbatim into the slot); (b) after the `if (!session)` guard becomes:

```tsx
  if (!session) {
    if (!startHref) return null;
    const started = hasEverSorted;
    return (
      <ContinueSection>
        <Card padding="lg" className="border-hairline bg-content-soft dark:bg-surface-raised dark:shadow-raised">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="mb-2 text-lg text-ink">{started ? "Keep sorting" : "Start sorting"}</h3>
              <p className="text-sm text-ink">
                {started
                  ? "Pick up where you left off — one decision at a time."
                  : "Begin with how you feel about each."}
              </p>
            </div>
            <Link href={startHref}>
              <Button>{started ? "Keep sorting" : "Start sorting"}</Button>
            </Link>
          </div>
        </Card>
      </ContinueSection>
    );
  }
```

(The link is `getByRole("link")` whose accessible name comes from the Button text.) Update remaining old-copy assertions in this test file.
- [ ] **Step 4:** Update `e2e/session-undo.spec.ts` copy assertions. `npx vitest run src/features/sessions` + `npm run lint` → green. **Step 5: Commit** — `git commit -am "feat(home): progress-keyed start card in Continue; workspace adopts SessionResumeCard"`

---

### Task 3: Page wiring + demotion + full gates

**Files:**
- Modify: `src/app/collections/[id]/page.tsx`
- Test: extend `ActiveSessionPanel.test.tsx` only if page-level logic lands in the panel; page wiring itself is covered by e2e.

- [ ] **Step 1:** In the page: `const hasEverSorted = sessions.length > 0;` `const leadActionVariant = currentSession || itemPreview.length > 0 ? "secondary" : "primary";` (update the A1 comment to explain: Sort wins once items exist; zero-primary during the undo window is a deliberate, documented exception — cite the spec). Pass `startHref={itemPreview.length > 0 ? `${base}/sort/new` : undefined}` and `hasEverSorted={hasEverSorted}` to `ActiveSessionPanel`.
- [ ] **Step 2:** Gates: `npm run lint` (0 errors) + `npm run test:ci` + `npm run build`.
- [ ] **Step 3:** e2e: `npx playwright test e2e/adaptive-collection-workspace.spec.ts e2e/session-undo.spec.ts e2e/session-pause.spec.ts e2e/session-create-after-set-aside.spec.ts e2e/sort-session.spec.ts --project=tablet` → all green.
- [ ] **Step 4: Commit** — `git commit -am "feat(home): Sort wins once items exist — start card wiring + lead demotion"`

---

### Task 4: Branch review + PR

- [ ] Whole-branch adversarial review (UX + Craftsman/QA scaled to the diff), fold findings.
- [ ] PR screenshots (light+dark): workspace start card (never-sorted), workspace resume card, hub card.
- [ ] `/sync-docs` check (no governance docs map to these paths — confirm), graphify update, push, PR with gate evidence, merge when green (owner-authorized), /close-out.
