# Timer Ring + Touch-Set Dial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the linear round-timer bar with a quiet conic-gradient ring, make round length a touch-set dial (30 s–5 min, 30 s snaps, below-min = "no timer", live via a mid-round dialog), add the gold completion moment and feel-based length names.

**Architecture:** One presentational `TimerRing` (HTML+CSS conic-gradient, no SVG) consumed by the header display (`RoundTimer`), the input dial (`TimerDial` = ring + pointer/keyboard), and the recap badge. Round length moves from a minutes union to a seconds union (`RoundBoxSeconds`) with one shared `boxToMs`. The mid-round dialog follows the existing `SortHelpDialog` pattern and commits once, on Done — expiry ENDS a round, so mid-drag preview must never re-arm the clock.

**Tech Stack:** Next.js App Router, React 19 client components, Tailwind v4 tokens in `src/app/globals.css`, vitest + testing-library (jsdom), Playwright e2e.

**Spec:** `docs/superpowers/specs/2026-07-16-timer-ring-dial-design.md` (rev 2). Read it before starting any task.

## Global Constraints

- No digits on the RUNNING ring; digits allowed only where a length is being chosen/announced.
- New tokens must clear ≥3:1 sweep-on-track in both themes, enforced by `contrast.test.ts` (values below are pre-computed to pass: light `#7b6a99`/`#e5eef0` = 4.08, dark `#a795c9`/`#173f4d` = 4.20).
- Mid-round: preview never calls `onBoxChange`; only the dialog's Done commits. Esc/scrim = cancel.
- "No timer" is never a dead end: the header adjust button stays rendered in the no-timer state.
- Feel names (total): 30–60 s "a breath"; 90–150 s "a handful"; 180–300 s "a real dent"; none "no clock at all". Format: "30 seconds", "1 minute", "1½ minutes", "2 minutes"…
- Motion: discrete 1 s steps; NO CSS transition on the gradient.
- Touch targets ≥44 px (`h-11`). No swiping; drag is allowed (dial).
- TDD: every task writes its failing test first. Commit after each task.
- Legacy `pi-round-box` values `0.5|1|2|5|10|20|none` (minutes) must parse; `10` and `20` clamp to 300.

---

### Task 1: Ring tokens + contrast gate

**Files:**
- Modify: `src/app/globals.css` (add 2 tokens to `:root` AND to `[data-theme="dark"]` — the parser-honesty guard requires dark to redeclare every light token)
- Modify: `src/lib/design/contrast.test.ts` (add pairs)

**Interfaces:**
- Produces: CSS vars `--color-ring-sweep`, `--color-ring-track` (Tailwind-exposed via the existing `@theme inline` pattern — mirror how `--color-decor` is exposed; grep `@theme` in globals.css and add `--color-ring-sweep: var(--color-ring-sweep);` style lines exactly like the neighbors).

- [ ] **Step 1: Write the failing test** — in `contrast.test.ts`, add to the `pairings()` array:

```ts
    [t.ringSweep, t.ringTrack, 3.0, "ring sweep on ring track (round timer, sole sighted signal)"],
    [t.ink, t.surface, 4.5, "expired ring ✓ (ink) on the ring disc (surface)"],
```

- [ ] **Step 2: Run to verify it fails** — `npx vitest run src/lib/design/contrast.test.ts` → FAIL: `no --color var for token "ringSweep"`.

- [ ] **Step 3: Add tokens** — in `globals.css` `:root` block (next to `--color-decor`):

```css
  /* Round-timer ring: the depleting edge is the sole sighted signal (time text is
     sr-only), so this pair is pinned at ≥3:1 by contrast.test.ts in BOTH themes. */
  --color-ring-sweep: #7b6a99;
  --color-ring-track: #e5eef0;
```

and in the `[data-theme="dark"]` block:

```css
  --color-ring-sweep: #a795c9;
  --color-ring-track: #173f4d;
```

Expose both in the `@theme inline` block exactly as the sibling tokens are.

- [ ] **Step 4: Run to verify pass** — `npx vitest run src/lib/design/contrast.test.ts` → PASS (including the dark-redeclares-every-light-token guard).

- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(timer): ring sweep/track tokens, AA-gated in both themes"`

---

### Task 2: Seconds model in round-preference.ts

**Files:**
- Modify: `src/lib/round-preference.ts` (full rewrite below)
- Test: `src/lib/round-preference.test.ts` (extend; keep existing passing cases that still apply)

**Interfaces:**
- Produces (exact, later tasks depend on these names):
  - `type RoundBoxSeconds = 30 | 60 | 90 | 120 | 150 | 180 | 210 | 240 | 270 | 300 | "none"`
  - `DEFAULT_ROUND_BOX: RoundBoxSeconds` (= 120), `MIN_BOX_SECONDS = 30`, `MAX_BOX_SECONDS = 300`, `BOX_STEP_SECONDS = 30`
  - `getRoundBox(): RoundBoxSeconds`, `setRoundBox(v: RoundBoxSeconds): void`
  - `boxToMs(box: RoundBoxSeconds): number | null`
  - `feelName(box: RoundBoxSeconds): string`, `formatBoxDuration(seconds: Exclude<RoundBoxSeconds,"none">): string`, `roundBoxLabel(box: RoundBoxSeconds): string`
- Removes: `ROUND_BOX_OPTIONS`, the old `RoundBox` type (compile errors in consumers are fixed task-by-task; this task only fixes this module + its test).

- [ ] **Step 1: Write the failing tests** (add to `round-preference.test.ts`):

```ts
describe("seconds model", () => {
  it("parses every legacy minutes value, clamping 10 and 20 to 300", () => {
    const cases: Array<[string, unknown]> = [
      ["0.5", 30], ["1", 60], ["2", 120], ["5", 300], ["10", 300], ["20", 300], ["none", "none"],
    ];
    for (const [raw, expected] of cases) {
      window.localStorage.setItem("pi-round-box", raw);
      expect(getRoundBox()).toBe(expected);
    }
  });
  it("round-trips new second values and defaults on garbage", () => {
    setRoundBox(150);
    expect(getRoundBox()).toBe(150);
    window.localStorage.setItem("pi-round-box", "97");
    expect(getRoundBox()).toBe(120);
  });
  it("boxToMs: seconds to ms, none to null", () => {
    expect(boxToMs(30)).toBe(30_000);
    expect(boxToMs(300)).toBe(300_000);
    expect(boxToMs("none")).toBeNull();
  });
  it("every reachable value has a feel name and a duration label (totality)", () => {
    const steps = [30, 60, 90, 120, 150, 180, 210, 240, 270, 300] as const;
    for (const s of steps) expect(roundBoxLabel(s)).toMatch(/ — (a breath|a handful|a real dent)$/);
    expect(roundBoxLabel("none")).toBe("no clock at all");
  });
  it("formats: 30 seconds, whole and half minutes", () => {
    expect(formatBoxDuration(30)).toBe("30 seconds");
    expect(formatBoxDuration(60)).toBe("1 minute");
    expect(formatBoxDuration(90)).toBe("1½ minutes");
    expect(formatBoxDuration(120)).toBe("2 minutes");
    expect(roundBoxLabel(120)).toBe("2 minutes — a handful");
  });
  it("band edges: 60 is a breath, 90 a handful, 150 a handful, 180 a real dent", () => {
    expect(feelName(60)).toBe("a breath");
    expect(feelName(90)).toBe("a handful");
    expect(feelName(150)).toBe("a handful");
    expect(feelName(180)).toBe("a real dent");
  });
});
```

- [ ] **Step 2: Run to verify fail** — `npx vitest run src/lib/round-preference.test.ts` → FAIL (missing exports).

- [ ] **Step 3: Rewrite the module** (keep the top-of-file comment's intent, update it to the seconds model; preserve the window/try-catch guards verbatim):

```ts
export type RoundBoxSeconds = 30 | 60 | 90 | 120 | 150 | 180 | 210 | 240 | 270 | 300 | "none";

export const DEFAULT_ROUND_BOX: RoundBoxSeconds = 120;
export const MIN_BOX_SECONDS = 30;
export const MAX_BOX_SECONDS = 300;
export const BOX_STEP_SECONDS = 30;

const KEY = "pi-round-box";

// Pre-seconds devices stored MINUTES ("0.5".."20"); disjoint from second values
// (all ≥30), so this read-once map is unambiguous. 10/20 keep their old clamp.
const LEGACY_MINUTES: Record<string, RoundBoxSeconds> = {
  "0.5": 30, "1": 60, "2": 120, "5": 300, "10": 300, "20": 300,
};

function isStep(n: number): n is Exclude<RoundBoxSeconds, "none"> {
  return Number.isInteger(n) && n >= MIN_BOX_SECONDS && n <= MAX_BOX_SECONDS && n % BOX_STEP_SECONDS === 0;
}

export function getRoundBox(): RoundBoxSeconds {
  if (typeof window === "undefined") return DEFAULT_ROUND_BOX;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (raw === null) return DEFAULT_ROUND_BOX;
    if (raw === "none") return "none";
    if (raw in LEGACY_MINUTES) return LEGACY_MINUTES[raw];
    const n = Number(raw);
    return isStep(n) ? n : DEFAULT_ROUND_BOX;
  } catch {
    return DEFAULT_ROUND_BOX;
  }
}

export function setRoundBox(value: RoundBoxSeconds): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, String(value));
  } catch {
    // private mode / storage disabled — the in-memory choice still applies
  }
}

// The ONE seconds→ms converter (replaces the duplicated box·MINUTE_MS pair —
// a missed call site is now a type error, not a silent 60× timing bug).
export function boxToMs(box: RoundBoxSeconds): number | null {
  return box === "none" ? null : box * 1_000;
}

export function feelName(box: RoundBoxSeconds): string {
  if (box === "none") return "no clock at all";
  if (box <= 60) return "a breath";
  if (box <= 150) return "a handful";
  return "a real dent";
}

export function formatBoxDuration(seconds: Exclude<RoundBoxSeconds, "none">): string {
  if (seconds === 30) return "30 seconds";
  const m = Math.floor(seconds / 60);
  const half = seconds % 60 === 30;
  return `${m}${half ? "½" : ""} minute${m === 1 && !half ? "" : "s"}`;
}

export function roundBoxLabel(box: RoundBoxSeconds): string {
  return box === "none" ? "no clock at all" : `${formatBoxDuration(box)} — ${feelName(box)}`;
}
```

- [ ] **Step 4: Update the existing tests in this file** that assert the minutes model (old clamp cases fold into the legacy-map test; delete `ROUND_BOX_OPTIONS` assertions). Run: `npx vitest run src/lib/round-preference.test.ts` → PASS. Other suites will fail to compile — expected; do NOT fix them here.

- [ ] **Step 5: Commit** — `git commit -am "feat(timer): RoundBoxSeconds model, legacy parsing, feel names, single boxToMs"`

---

### Task 3: Consumers adopt the seconds model (compile green)

**Files:**
- Modify: `src/features/sorting/useOptimisticRound.ts` (delete local `MINUTE_MS`/`boxToMs`, import `boxToMs`, type `RoundBoxSeconds`)
- Modify: `src/features/sorting/RoundSurface.tsx` (same dedup at its lines 31–34; `onBoxChange` type)
- Modify: `src/features/sorting/RoundLengthChooser.tsx` (minimal type fix ONLY — it is deleted in Task 6; make it compile: options list built inline from `[30,60,120,300,"none"]` with `roundBoxLabel`)
- Modify: `src/features/sorting/StartSessionForm.tsx` (minimal type fix ONLY — `useState<RoundBoxSeconds>(DEFAULT_ROUND_BOX)`, options inline; full dial replacement happens in Task 7)
- Modify: any test fixture that type-errors (`TriageRound.test.tsx`, `UsageRound.test.tsx`, `RoundSurface.test.tsx`, `StartSessionForm.test.tsx`, `RoundLengthChooser.test.tsx`): migrate seeded values minutes→seconds (`0.5`→`30`, `2`→`120`, `5`→`300`; localStorage seeds may keep legacy strings — they parse).
- Modify: `e2e/screenshots/capture.ts` line ~129: `pi-round-box` seed `"2"` → `"120"`.

**Interfaces:**
- Consumes: Task 2's `boxToMs`, `RoundBoxSeconds`.
- Produces: whole repo compiles; `onBoxChange(box: RoundBoxSeconds)` is the hook contract later tasks wire to.

- [ ] **Step 1:** Make the edits above. In `useOptimisticRound.ts` and `RoundSurface.tsx` the two local converters become `import { boxToMs, getRoundBox, type RoundBoxSeconds } from "@/lib/round-preference";` and `const storedBoxMs = (): number | null => boxToMs(getRoundBox());` — behavior identical, minutes math gone.
- [ ] **Step 2:** Run: `npx tsc --noEmit && npm run test:ci` → PASS (full suite; timing-assertion fixtures updated as needed — a 2-minute fixture is now `120`).
- [ ] **Step 3: Commit** — `git commit -am "refactor(timer): consumers on RoundBoxSeconds, single converter"`

---

### Task 4: TimerRing (shared presentational)

**Files:**
- Create: `src/features/sorting/TimerRing.tsx`
- Test: `src/features/sorting/TimerRing.test.tsx`

**Interfaces:**
- Produces:

```tsx
interface TimerRingProps {
  /** 0..1 — how much of the sweep is filled (remaining time, or duration set). */
  fraction: number;
  /** Outer diameter in px: 40 header, 200 dial, 56 recap badge. */
  size: number;
  /** Gold band + centered ✓ (ink on the disc). */
  expired?: boolean;
  /** Disc matches the HOST backdrop so the ring reads as a cut-out. */
  discClassName?: string; // default "bg-surface"
  className?: string;
  children?: React.ReactNode; // overlay layer (the dial's handle)
}
export function TimerRing(props: TimerRingProps): JSX.Element
```

- [ ] **Step 1: Failing test:**

```tsx
// @vitest-environment jsdom
import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { TimerRing } from "./TimerRing";

it("renders the conic sweep with the anti-aliased stop at the fraction", () => {
  const { container } = render(<TimerRing fraction={0.5} size={40} />);
  const ring = container.firstElementChild as HTMLElement;
  expect(ring.style.background).toContain("conic-gradient");
  expect(ring.style.background).toContain("calc(50% - 0.5%)");
  expect(ring.style.width).toBe("40px");
});

it("expired: gold band, ✓ visible but decorative", () => {
  render(<TimerRing fraction={0} size={56} expired />);
  const check = screen.getByText("✓");
  expect(check).toHaveAttribute("aria-hidden");
  expect(check.parentElement?.className).toContain("bg-spark");
});

it("clamps fraction into 0..1", () => {
  const { container } = render(<TimerRing fraction={1.4} size={40} />);
  expect((container.firstElementChild as HTMLElement).style.background).toContain("calc(100% - 0.5%)");
});
```

- [ ] **Step 2:** Run `npx vitest run src/features/sorting/TimerRing.test.tsx` → FAIL (module not found).
- [ ] **Step 3: Implement:**

```tsx
import type { ReactNode } from "react";

interface TimerRingProps {
  fraction: number;
  size: number;
  expired?: boolean;
  discClassName?: string;
  className?: string;
  children?: ReactNode;
}

/**
 * The quiet ring (wireframes: "violet ring = round timer (no digits)"), shared by
 * the header display, the set-length dial, and the recap badge. HTML+CSS only:
 * a conic-gradient band (0.5% blended stop kills hard-edge aliasing) around a
 * disc that matches the host backdrop. Expired = gold band + ink ✓ (colour is
 * never the sole signal; the consumer's live region carries the words).
 */
export function TimerRing({ fraction, size, expired = false, discClassName = "bg-surface", className = "", children }: TimerRingProps) {
  const pct = Math.min(1, Math.max(0, fraction)) * 100;
  return (
    <div
      className={`relative flex shrink-0 items-center justify-center rounded-full ${expired ? "bg-spark" : ""} ${className}`}
      style={{
        width: size,
        height: size,
        background: expired
          ? undefined
          : `conic-gradient(var(--color-ring-sweep) calc(${pct}% - 0.5%), var(--color-ring-track) ${pct}%)`,
      }}
    >
      <div
        className={`flex items-center justify-center rounded-full ${discClassName}`}
        style={{ width: size * 0.75, height: size * 0.75 }}
      >
        {expired ? (
          <span aria-hidden className="text-ink" style={{ fontSize: size * 0.4 }}>
            ✓
          </span>
        ) : null}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 4:** Run the test → PASS. (Adjust the expired-band assertion if the class landed on the outer div — the test asserts the ✓'s parent chain; keep test and code consistent: put `bg-spark` on the OUTER div and assert `check.closest("div[class*='bg-spark']")` is non-null instead if needed.)
- [ ] **Step 5: Commit** — `git commit -am "feat(timer): TimerRing shared conic-gradient ring"`

---

### Task 5: RoundTimer shows the ring (sr-only digits, no-timer affordance)

**Files:**
- Modify: `src/features/sorting/RoundTimer.tsx`
- Modify: `src/features/sorting/RoundShell.tsx` (timer slot `min-w-40 flex-1 sm:max-w-xs` → `shrink-0` — ring + button are intrinsic width)
- Test: `src/features/sorting/RoundTimer.test.tsx` (extend existing)

**Interfaces:**
- Consumes: `TimerRing`.
- Produces: `RoundTimerProps` gains `onAdjust?: () => void` — when provided, the ring is wrapped in a ≥44 px button (`aria-label="Change round length"`); in the no-timer state the button renders an EMPTY ring + visible "No clock" label (never a dead end). Everything else (props, `onExpire` one-shot, tick) unchanged.

- [ ] **Step 1: Failing tests** (add):

```tsx
it("renders the quiet ring with NO visible digits while running", () => {
  render(<RoundTimer startedAtMs={Date.now()} boxMs={120_000} onExpire={vi.fn()} roundLabel="Triage round" />);
  const timer = screen.getByRole("timer");
  // the remaining-time words exist for SR users only
  expect(screen.getByText(/about 2 minutes left/i)).toHaveClass("sr-only");
  expect(timer.querySelector("[style*='conic-gradient']")).toBeTruthy();
});

it("a 30-second box never claims a whole minute (honesty contract)", () => {
  render(<RoundTimer startedAtMs={Date.now()} boxMs={30_000} onExpire={vi.fn()} roundLabel="Triage round" />);
  expect(screen.getByText(SUB_MINUTE_LABEL)).toHaveClass("sr-only");
  expect(screen.queryByText(/about 1 minute/i)).not.toBeInTheDocument();
});

it("no-timer + onAdjust: empty-ring button stays (no dead end)", () => {
  render(<RoundTimer startedAtMs={Date.now()} boxMs={null} onExpire={vi.fn()} roundLabel="Triage round" onAdjust={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Change round length" })).toBeInTheDocument();
  expect(screen.getByText("No clock")).toBeInTheDocument();
});

it("timed + onAdjust: tapping the ring calls onAdjust", () => {
  const onAdjust = vi.fn();
  render(<RoundTimer startedAtMs={Date.now()} boxMs={120_000} onExpire={vi.fn()} roundLabel="Triage round" onAdjust={onAdjust} />);
  fireEvent.click(screen.getByRole("button", { name: "Change round length" }));
  expect(onAdjust).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2:** Run → FAIL. Existing bar-era tests (bar width transition, visible text) will need updating in Step 3 — port their INTENT (expiry announcement, one-shot onExpire, null-box) to the ring rendering; delete assertions that are bar-specific (width %, transition class).
- [ ] **Step 3: Rewrite the render** (tick effect, refs, `SUB_MINUTE_LABEL`, `minutesLeft` all stay):

```tsx
  const ring = (
    <TimerRing
      fraction={boxMs === null ? 0 : 1 - fractionElapsed(startedAtMs, boxMs, now)}
      size={40}
      expired={boxMs !== null && expired}
      discClassName="bg-ground"
    />
  );
  const adjustButton = onAdjust ? (
    <button
      type="button"
      onClick={onAdjust}
      aria-label="Change round length"
      className="flex h-11 w-11 items-center justify-center rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
    >
      {ring}
    </button>
  ) : (
    ring
  );

  if (boxMs === null) {
    // No countdown, no live region — but the adjust affordance must survive
    // ("'No timer' is a first-class peer, never a hidden mode").
    return onAdjust ? (
      <div className="flex items-center gap-2">
        {adjustButton}
        <span className="text-sm text-ink-soft">No clock</span>
      </div>
    ) : (
      <p className="text-sm text-ink-soft">{roundLabel}</p>
    );
  }

  return (
    <div className="flex items-center gap-2">
      {adjustButton}
      <div aria-live="polite" role="timer">
        {expired ? (
          <p className="flex items-center gap-1 text-sm text-ink-soft">
            <span aria-hidden>✓</span>
            <span>Round complete</span>
          </p>
        ) : (
          <p className="sr-only">
            {remaining < 60_000
              ? SUB_MINUTE_LABEL
              : `About ${mins} ${mins === 1 ? "minute" : "minutes"} left in this round`}
          </p>
        )}
      </div>
    </div>
  );
```

(`useReducedMotion` import goes — there is no animation left to guard; the tick still runs. "Round complete" stays VISIBLE: it is state text, not a countdown digit.)

- [ ] **Step 4:** `npx vitest run src/features/sorting/RoundTimer.test.tsx` → PASS. Then `npx tsc --noEmit` (RoundShell slot edit compiles).
- [ ] **Step 5: Commit** — `git commit -am "feat(timer): RoundTimer renders the quiet ring, digits sr-only, no-timer keeps the affordance"`

---

### Task 6: Dial math + TimerDial + RoundLengthDialog; chooser replaced in all three hosts

**Files:**
- Create: `src/features/sorting/round-dial.ts` (pure math) + `src/features/sorting/round-dial.test.ts`
- Create: `src/features/sorting/TimerDial.tsx` + `TimerDial.test.tsx`
- Create: `src/features/sorting/RoundLengthDialog.tsx` + `RoundLengthDialog.test.tsx`
- Modify: `src/features/sorting/RoundSurface.tsx`, `TriageRound.tsx`, `UsageRound.tsx` (replace `RoundLengthChooser` with dialog wiring; pass `onAdjust` to `RoundTimer` gated on `!ended`)
- Delete: `src/features/sorting/RoundLengthChooser.tsx` + `RoundLengthChooser.test.tsx` (port its pins: persist + live re-arm + no-timer-peer are covered by the dialog tests below)

**Interfaces:**
- Consumes: `RoundBoxSeconds`, `boxToMs`, `roundBoxLabel`, `setRoundBox`, `TimerRing`, `RoundTimer.onAdjust`.
- Produces:

```ts
// round-dial.ts — 12 o'clock = 0°, clockwise; full circle = 300 s (36°/step);
// the first step-width below 30 s is the "no clock" zone.
export function angleToBox(angleDeg: number): RoundBoxSeconds;
export function boxToAngle(box: RoundBoxSeconds): number; // "none" → 0
export function pointToAngle(cx: number, cy: number, x: number, y: number): number;
export function stepBox(box: RoundBoxSeconds, delta: 1 | -1): RoundBoxSeconds; // 30 - 1 → "none"; "none" + 1 → 30

// TimerDial.tsx — dumb: reports every previewed value; the HOST decides commit.
interface TimerDialProps { value: RoundBoxSeconds; onChange: (b: RoundBoxSeconds) => void; size?: number; discClassName?: string }

// RoundLengthDialog.tsx — commits ONCE on Done (expiry ends a round; a finger
// passing through low values must never end it). Esc/scrim = cancel.
interface RoundLengthDialogProps { open: boolean; initial: RoundBoxSeconds; onCommit: (b: RoundBoxSeconds) => void; onClose: () => void }
```

- [ ] **Step 1: Failing math tests** (`round-dial.test.ts`):

```ts
import { angleToBox, boxToAngle, pointToAngle, stepBox } from "./round-dial";

it("maps angles to 30s steps (36° each), nearest-step rounding", () => {
  expect(angleToBox(36)).toBe(30);
  expect(angleToBox(50)).toBe(30);   // 50/36 → 1.39 → step 1
  expect(angleToBox(55)).toBe(60);   // → 1.53 → step 2
  expect(angleToBox(180)).toBe(150);
  expect(angleToBox(360 - 1)).toBe(300); // 359° never wraps to none
});
it("the first step-width below 30s is the no-clock zone", () => {
  expect(angleToBox(0)).toBe("none");
  expect(angleToBox(17)).toBe("none");
  expect(angleToBox(18)).toBe(30);
});
it("boxToAngle inverts the steps", () => {
  expect(boxToAngle(30)).toBe(36);
  expect(boxToAngle(300)).toBe(360);
  expect(boxToAngle("none")).toBe(0);
});
it("pointToAngle: top=0, right=90, bottom=180, left=270", () => {
  expect(pointToAngle(100, 100, 100, 0)).toBe(0);
  expect(pointToAngle(100, 100, 200, 100)).toBe(90);
  expect(pointToAngle(100, 100, 100, 200)).toBe(180);
  expect(pointToAngle(100, 100, 0, 100)).toBe(270);
});
it("stepBox walks the steps and through the none boundary", () => {
  expect(stepBox(60, -1)).toBe(30);
  expect(stepBox(30, -1)).toBe("none");
  expect(stepBox("none", 1)).toBe(30);
  expect(stepBox(300, 1)).toBe(300);
  expect(stepBox("none", -1)).toBe("none");
});
```

- [ ] **Step 2:** Run → FAIL. **Step 3: Implement `round-dial.ts`:**

```ts
import { BOX_STEP_SECONDS, MAX_BOX_SECONDS, MIN_BOX_SECONDS, type RoundBoxSeconds } from "@/lib/round-preference";

const DEG_PER_STEP = 360 / (MAX_BOX_SECONDS / BOX_STEP_SECONDS); // 36

export function angleToBox(angleDeg: number): RoundBoxSeconds {
  const a = ((angleDeg % 360) + 360) % 360;
  const step = Math.round(a / DEG_PER_STEP);
  const seconds = step * BOX_STEP_SECONDS;
  if (seconds < MIN_BOX_SECONDS) return "none";
  return Math.min(seconds, MAX_BOX_SECONDS) as RoundBoxSeconds;
}

export function boxToAngle(box: RoundBoxSeconds): number {
  return box === "none" ? 0 : (box / BOX_STEP_SECONDS) * DEG_PER_STEP;
}

export function pointToAngle(cx: number, cy: number, x: number, y: number): number {
  return (Math.atan2(x - cx, cy - y) * (180 / Math.PI) + 360) % 360;
}

export function stepBox(box: RoundBoxSeconds, delta: 1 | -1): RoundBoxSeconds {
  if (box === "none") return delta === 1 ? MIN_BOX_SECONDS : "none";
  const next = box + delta * BOX_STEP_SECONDS;
  if (next < MIN_BOX_SECONDS) return "none";
  return Math.min(next, MAX_BOX_SECONDS) as RoundBoxSeconds;
}
```

- [ ] **Step 4: Failing TimerDial tests** (keyboard semantics, valuetext, persistent label + hint):

```tsx
it("slider semantics: arrows step 30s, Home=none, End=5min, valuetext=feel label", () => {
  const onChange = vi.fn();
  render(<TimerDial value={120} onChange={onChange} />);
  const slider = screen.getByRole("slider", { name: /round length/i });
  expect(slider).toHaveAttribute("aria-valuenow", "120");
  expect(slider).toHaveAttribute("aria-valuetext", "2 minutes — a handful");
  fireEvent.keyDown(slider, { key: "ArrowDown" });
  expect(onChange).toHaveBeenLastCalledWith(90);
  fireEvent.keyDown(slider, { key: "Home" });
  expect(onChange).toHaveBeenLastCalledWith("none");
  fireEvent.keyDown(slider, { key: "End" });
  expect(onChange).toHaveBeenLastCalledWith(300);
});
it("below 30s the label reads no clock at all — the non-hue empty-vs-30s discriminator", () => {
  render(<TimerDial value="none" onChange={vi.fn()} />);
  expect(screen.getByText("no clock at all")).toBeInTheDocument();
  expect(screen.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
});
it("teaches itself: the drag-or-tap hint is always rendered", () => {
  render(<TimerDial value={120} onChange={vi.fn()} />);
  expect(screen.getByText("Drag or tap to set.")).toBeInTheDocument();
});
it("tap on the dial maps pointer position to a step", () => {
  const onChange = vi.fn();
  render(<TimerDial value={120} onChange={onChange} />);
  const surface = screen.getByRole("slider");
  surface.getBoundingClientRect = () => ({ left: 0, top: 0, width: 200, height: 200, right: 200, bottom: 200, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect;
  fireEvent.pointerDown(surface, { clientX: 200, clientY: 100 }); // 3 o'clock = 90° = 75s → snaps 60 or 90 (Math.round(90/36)=3 → wait: 2.5 → 2? compute: 90/36 = 2.5 → round = 3 → 90s)
  expect(onChange).toHaveBeenLastCalledWith(90);
});
```

- [ ] **Step 5: Implement `TimerDial.tsx`:**

```tsx
"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { roundBoxLabel, MAX_BOX_SECONDS, type RoundBoxSeconds } from "@/lib/round-preference";
import { angleToBox, boxToAngle, pointToAngle, stepBox } from "./round-dial";
import { TimerRing } from "./TimerRing";

interface TimerDialProps {
  value: RoundBoxSeconds;
  onChange: (box: RoundBoxSeconds) => void;
  size?: number;
  discClassName?: string;
}

/**
 * The touch-set length dial: TimerRing at dial size + a visible handle at the
 * value angle (the draggability signifier and the drag target). Reports every
 * previewed value via onChange — the HOST owns commit semantics (the mid-round
 * dialog commits on Done only, because a commit below elapsed ends the round).
 */
export function TimerDial({ value, onChange, size = 200, discClassName = "bg-surface-raised" }: TimerDialProps) {
  const surfaceRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function valueFromPointer(event: PointerEvent<HTMLDivElement>) {
    const rect = surfaceRef.current!.getBoundingClientRect();
    const angle = pointToAngle(rect.left + rect.width / 2, rect.top + rect.height / 2, event.clientX, event.clientY);
    const next = angleToBox(angle);
    if (next !== value) onChange(next);
  }

  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    dragging.current = true;
    surfaceRef.current?.setPointerCapture(event.pointerId);
    valueFromPointer(event);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (dragging.current) valueFromPointer(event);
  }
  function onPointerUp() {
    dragging.current = false;
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    let next: RoundBoxSeconds | undefined;
    if (event.key === "ArrowUp" || event.key === "ArrowRight") next = stepBox(value, 1);
    else if (event.key === "ArrowDown" || event.key === "ArrowLeft") next = stepBox(value, -1);
    else if (event.key === "Home") next = "none";
    else if (event.key === "End") next = MAX_BOX_SECONDS as RoundBoxSeconds;
    if (next !== undefined) {
      event.preventDefault();
      if (next !== value) onChange(next);
    }
  }

  const handleAngle = boxToAngle(value);
  return (
    <div className="flex flex-col items-center gap-3">
      <div
        ref={surfaceRef}
        role="slider"
        tabIndex={0}
        aria-label="Round length"
        aria-valuemin={0}
        aria-valuemax={300}
        aria-valuenow={value === "none" ? 0 : value}
        aria-valuetext={roundBoxLabel(value)}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onKeyDown={onKeyDown}
        className="touch-none rounded-full focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
      >
        <TimerRing fraction={value === "none" ? 0 : value / 300} size={size} discClassName={discClassName}>
          {value !== "none" && (
            <span
              aria-hidden
              className="absolute left-1/2 top-1/2 h-4 w-4 rounded-full border-2 border-surface bg-ring-sweep"
              style={{
                transform: `translate(-50%, -50%) rotate(${handleAngle}deg) translateY(-${size / 2 - 8}px)`,
              }}
            />
          )}
        </TimerRing>
      </div>
      <p className="text-sm text-ink" aria-hidden>
        {roundBoxLabel(value)}
      </p>
      <p className="text-xs text-ink-soft">Drag or tap to set.</p>
    </div>
  );
}
```

- [ ] **Step 6: Failing RoundLengthDialog tests** (focus contract + commit-on-Done):

```tsx
it("previews without committing; Done commits once; Esc cancels", () => {
  const onCommit = vi.fn();
  const onClose = vi.fn();
  render(<RoundLengthDialog open initial={120} onCommit={onCommit} onClose={onClose} />);
  const slider = screen.getByRole("slider");
  fireEvent.keyDown(slider, { key: "ArrowDown" }); // preview 90
  expect(onCommit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Done" }));
  expect(onCommit).toHaveBeenCalledTimes(1);
  expect(onCommit).toHaveBeenCalledWith(90);
});
it("Esc closes without committing", () => {
  const onCommit = vi.fn();
  const onClose = vi.fn();
  render(<RoundLengthDialog open initial={120} onCommit={onCommit} onClose={onClose} />);
  fireEvent.keyDown(document, { key: "Escape" });
  expect(onClose).toHaveBeenCalled();
  expect(onCommit).not.toHaveBeenCalled();
});
it("focuses the slider on open", () => {
  render(<RoundLengthDialog open initial={120} onCommit={vi.fn()} onClose={vi.fn()} />);
  expect(screen.getByRole("slider")).toHaveFocus();
});
```

- [ ] **Step 7: Implement `RoundLengthDialog.tsx`** following `SortHelpDialog.tsx`'s trap/Escape/portal verbatim, with: `role="dialog" aria-modal aria-labelledby` title **"Round length"**; a draft `useState(initial)` (re-seeded on open via `useEffect`); `TimerDial value={draft} onChange={setDraft}`; footer `Button` **"Done"** → `onCommit(draft); onClose();`; close ×/scrim/Esc → `onClose()` only. Panel classes: container `fixed inset-0 z-50 flex items-end justify-center px-0 sm:items-center sm:px-4`; panel `w-full rounded-t-card sm:max-w-sm sm:rounded-card border border-hairline bg-surface-raised p-5 shadow-raised` (phone bottom-aligned, tablet centered — CSS only). Focus: `useEffect` on open focuses the slider (`panelRef.current?.querySelector('[role="slider"]')`); the HOST's ring button regains focus natively when the portal unmounts — assert via the host test if flaky, else rely on `triggerRef` refocus in the host wiring below.
- [ ] **Step 8: Wire the three hosts.** In each of `RoundSurface.tsx`, `TriageRound.tsx`, `UsageRound.tsx`:
  - Delete the `RoundLengthChooser` import and its `{!ended && <RoundLengthChooser onChange={onBoxChange} />}` render.
  - Add state + wiring (names may adapt to each host's locals — `boxMs`/`ended`/`onBoxChange` already exist in all three):

```tsx
const [lengthDialogOpen, setLengthDialogOpen] = useState(false);
const currentBox: RoundBoxSeconds = boxMs === null ? "none" : ((boxMs / 1000) as RoundBoxSeconds);
// RoundTimer gains: onAdjust={!ended ? () => setLengthDialogOpen(true) : undefined}
<RoundLengthDialog
  open={lengthDialogOpen}
  initial={currentBox}
  onCommit={(box) => {
    setRoundBox(box); // persist for the next round…
    onBoxChange(box); // …and re-arm THIS round against its unchanged start
  }}
  onClose={() => setLengthDialogOpen(false)}
/>
```

  - Delete `RoundLengthChooser.tsx` + `RoundLengthChooser.test.tsx`.
- [ ] **Step 9:** Add the re-arm invariant test in `RoundSurface.test.tsx` (or the existing timer-wiring suite): committing a LARGER box mid-round keeps the original start — remaining time reflects `startedAtMs + newBox`, not a reset (assert via the sr-only remaining text after advancing fake timers).
- [ ] **Step 10:** `npx tsc --noEmit && npm run test:ci` → PASS. **Step 11: Commit** — `git commit -am "feat(timer): touch-set dial + Done-gated mid-round dialog; chooser retired"`

---

### Task 7: StartSessionForm hosts the dial

**Files:**
- Modify: `src/features/sorting/StartSessionForm.tsx`
- Test: `src/features/sorting/StartSessionForm.test.tsx`

**Interfaces:** Consumes `TimerDial`, `setRoundBox`, `DEFAULT_ROUND_BOX`, `roundBoxLabel`. No running clock here — the dial commits the stored preference directly in `onChange`.

- [ ] **Step 1: Failing test:** the form renders the dial (`getByRole("slider", { name: /round length/i })`); stepping it persists (`ArrowUp` from default 120 → `getRoundBox()` returns 150 — seed jsdom localStorage first); the helper line swaps to `NO_TIMER_HELPER` at Home.
- [ ] **Step 2:** Run → FAIL.
- [ ] **Step 3:** Replace the length `<Select>` (state `timebox`, `TIMEBOX_OPTIONS`, `chooseTimebox`) with:

```tsx
const [timebox, setTimebox] = useState<RoundBoxSeconds>(DEFAULT_ROUND_BOX);
function chooseTimebox(box: RoundBoxSeconds) {
  setTimebox(box);
  setRoundBox(box); // no running clock at start — persist immediately
}
// in the JSX where the Select was:
<TimerDial value={timebox} onChange={chooseTimebox} size={200} discClassName="bg-surface" />
<p className="text-sm text-ink-soft">{timebox === "none" ? NO_TIMER_HELPER : TIMED_BOX_HELPER}</p>
```

- [ ] **Step 4:** Run form tests + `npx tsc --noEmit` → PASS. **Step 5: Commit** — `git commit -am "feat(timer): start form sets length on the dial"`

---

### Task 8: Gold completion moment in the recap

**Files:**
- Modify: `src/features/sorting/WhatMoved.tsx` (+ its hosts pass the new prop: grep `<WhatMoved` in `TriageRound.tsx`, `UsageRound.tsx`, `RoundSurface.tsx`)
- Test: `src/features/sorting/WhatMoved.test.tsx`

**Interfaces:** `WhatMoved` gains `hadTimer?: boolean`; hosts pass `hadTimer={boxMs !== null}`.

- [ ] **Step 1: Failing test:** with `hadTimer`, the recap renders the gold badge (`container.querySelector(".bg-spark")` truthy, `aria-hidden`) above the heading; without it, no badge.
- [ ] **Step 2:** Run → FAIL. **Step 3:** Lead the recap with `{hadTimer && <TimerRing fraction={0} size={56} expired discClassName="bg-surface-raised" />}` inside an `aria-hidden` wrapper (meaning stays with the existing live-region text — a marker, not a celebration). Wire the prop in all three hosts.
- [ ] **Step 4:** Run + `npx tsc --noEmit` → PASS. **Step 5: Commit** — `git commit -am "feat(timer): gold ring completion moment in the recap"`

---

### Task 9: e2e + CI spec map

**Files:**
- Create: `e2e/timer-ring.spec.ts`
- Modify: `.github/workflows/ci.yml` — the `A_SORT` add-list gains `e2e/timer-ring.spec.ts`.

- [ ] **Step 1: Write the spec** (keyboard-driven; drag math is unit-tested — Playwright arc-drag is brittle):

```ts
// Timer ring journey: set length on the dial at start (keyboard), quiet ring
// runs with no visible digits, adjust mid-round via the ring button, complete
// a 30s round into the gold recap moment.
import { test, expect } from "@playwright/test";
import { seedBaseline, seedJourneyScenario } from "./fixtures/seed";

let slug = "";
let sessionNumber = 0;

test.beforeAll(async () => {
  const ownerId = await seedBaseline();
  ({ slug, sessionNumber } = await seedJourneyScenario(ownerId, 2));
});

test("dial → quiet ring → live adjust → gold recap", async ({ page }) => {
  await page.goto(`/collections/${slug}/sort/${sessionNumber}/triage`);

  // The running ring: an adjust button, and no visible remaining-time digits.
  const adjust = page.getByRole("button", { name: "Change round length" });
  await expect(adjust).toBeVisible();
  await expect(page.getByText(/left in this round/)).toHaveClass(/sr-only/);

  // Live adjust: open the dialog, keyboard down to 30 seconds, Done.
  await adjust.click();
  const slider = page.getByRole("slider", { name: "Round length" });
  await expect(slider).toBeFocused();
  await slider.press("Home"); // no clock at all
  await slider.press("ArrowUp"); // 30 seconds — a breath
  await expect(page.getByText("30 seconds — a breath")).toBeVisible();
  await page.getByRole("button", { name: "Done" }).click();
  await expect(adjust).toBeVisible();

  // 30s later the round ends itself into the recap, led by the gold moment.
  await expect(page.getByRole("heading", { name: /what moved/i })).toBeVisible({ timeout: 45_000 });
});
```

Adjust the entry URL/labels to the real triage surface if they differ (read the existing `e2e/sort-session.spec.ts` for the canonical entry) — assertions must target real rendered strings.

- [ ] **Step 2:** Run `npx playwright test e2e/timer-ring.spec.ts --project=tablet` → PASS.
- [ ] **Step 3:** Add the file to ci.yml's `A_SORT` list. **Step 4: Commit** — `git commit -am "test(timer): e2e ring journey, wired into CI's sort area"`

---

### Task 10: Full gates + branch review

- [ ] `npm run lint && npm run test:ci && npm run build` → all green.
- [ ] Mapped e2e locally: `npx playwright test e2e/timer-ring.spec.ts e2e/sort-session.spec.ts e2e/session-pause.spec.ts e2e/usage-round.spec.ts --project=tablet` → green. Then `PW_VIEWPORT=phone npx playwright test e2e/timer-ring.spec.ts` (phone-responsive dialog styling).
- [ ] Whole-branch adversarial review (Security is light here; UX + Design + QA + Craftsman on the diff), fold findings.
- [ ] `/sync-docs` (DESIGN.md gains the ring tokens note per doc-ownership: `src/app/globals.css :: DESIGN.md`), `/graphify --update`, PR screenshots (light + dark: running ring, dial dialog, gold recap; phone dialog), draft PR → screenshots → ready.
