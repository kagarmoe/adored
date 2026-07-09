import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  COMPARE_SUBLINE,
  ROUND_COPY,
  triageDecisions,
  usageDecisions,
  USAGE_PASS_ARIA_LABEL,
  USAGE_PASS_LABEL,
  USAGE_PASS_TITLE,
  QUICK_PACE_LABEL,
  QUICK_INTRO_LINE,
  WELCOME_ROUND_KICKER,
  THIS_ROUND_LABEL,
} from "./roundCopy";
import { answeredSoFar } from "./UsageRound";
import { TIMED_BOX_HELPER, NO_TIMER_HELPER } from "./StartSessionForm";
import { SUB_MINUTE_LABEL } from "./RoundTimer";
import { ROUND_BOX_OPTIONS } from "@/lib/round-preference";
import { inYourLifeLine, restingLine } from "@/lib/what-moved";

describe("roundCopy", () => {
  it("names both rounds with person-side arc names + explainers", () => {
    expect(ROUND_COPY.triage.name).toBe("Get acquainted");
    expect(ROUND_COPY.compare.name).toBe("Which do you love more?");
    // TONE litmus: no inventory verbs, no pace words (spec: rewritten person-side).
    for (const round of Object.values(ROUND_COPY)) {
      expect(round.explainer.toLowerCase()).not.toMatch(/bucket|quickly|refine ranking/);
    }
  });

  it("carries the usage round copy verbatim", () => {
    expect(ROUND_COPY.usage.name).toBe("Do you use this?");
    expect(ROUND_COPY.usage.explainer).toBe(
      "One piece at a time — is it in your life these days?",
    );
  });

  it("builds the four tier decisions for an item", () => {
    expect(triageDecisions("item-1")).toEqual([
      { label: "Love", decision: { itemId: "item-1", result: "top" } },
      { label: "Like", decision: { itemId: "item-1", result: "high" } },
      { label: "Maybe", decision: { itemId: "item-1", result: "medium" } },
      { label: "Onward", decision: { itemId: "item-1", result: "low" } },
    ]);
  });

  it("builds the two usage decisions for an item", () => {
    expect(usageDecisions("item-1")).toEqual([
      { label: "Yes, I use it", decision: { itemId: "item-1", result: "uses" } },
      { label: "Not these days", decision: { itemId: "item-1", result: "not_uses" } },
    ]);
  });

  it("carries the usage pass-button copy verbatim", () => {
    expect(USAGE_PASS_LABEL).toBe("Skip for now");
    expect(USAGE_PASS_TITLE).toBe("It'll come around again");
    expect(USAGE_PASS_ARIA_LABEL).toBe("Skip for now — it'll come around again");
    // WCAG 2.5.3: the accessible name begins with the visible label.
    expect(USAGE_PASS_ARIA_LABEL.startsWith(USAGE_PASS_LABEL)).toBe(true);
  });

  it("carries the compare sub-line", () => {
    expect(COMPARE_SUBLINE).toBe("Tap the one you love more. Tie or skip whenever you like.");
  });

  it("stays server-importable (no 'use client')", () => {
    const src = readFileSync(new URL("./roundCopy.ts", import.meta.url), "utf8");
    expect(src).not.toContain("use client");
  });
});

// The spec-§4 copy inventory: the named PR-2 TONE gate. Two guarantees, both in CI:
//   1. Reachability — every §4 usage-round string exists as an EXPORTED constant
//      (proven by importing it here; a gap fails to compile/import).
//   2. Register rules — the D2 rules enforced mechanically: no digits (remaining
//      counts are always numeric), no denominators, no urgency/game/race framing.
// The recap + answered-count TEMPLATES interpolate a by-design affirming count
// (F20) — we scan the template with the leading count stripped, so a stray SECOND
// digit still fails. ROUND_BOX_OPTIONS labels are the length menu (§3.1), not round
// copy, and legitimately carry digits ("30 seconds") — excluded from the digit rule
// but still scanned for urgency/game terms.
describe("usage-round §4 copy inventory (TONE gate)", () => {
  const DIGIT = /\d/;
  const DENOM = /\bof\b|\bout of\b|\/|%/i;
  // "left" is deliberately NOT banned as a bare word: SUB_MINUTE_LABEL's timer cue
  // ("a minute left in this round") is the accepted §3.1 wrap-up, and it carries no
  // numeral. A remaining-ITEM count ("3 left", "5 remaining") is numeric and caught
  // by the digit rule; "remaining" as a word is banned outright (it never appears).
  const URGENCY =
    /\b(hurry|remaining|only|last chance|today only|don't miss|expires?|challenge|race|score|streak|winner?|level up|combo|beat)\b/i;

  // Returns the first register-rule a string breaks, or null. `allowDigits` is for
  // the ROUND_BOX_OPTIONS length labels, whose numerals are the menu, not a count.
  function registerViolation(value: string, allowDigits = false): string | null {
    if (!allowDigits && DIGIT.test(value)) return "digit";
    if (DENOM.test(value)) return "denominator";
    if (URGENCY.test(value)) return "urgency/game";
    return null;
  }

  // §4 static copy: NO digits anywhere. Key = the §4 slot; value = its constant.
  const staticCopy: Record<string, string> = {
    "ROUND_COPY.usage.name (h1)": ROUND_COPY.usage.name,
    "ROUND_COPY.usage.explainer": ROUND_COPY.usage.explainer,
    "ROUND_COPY.triage.name (rename)": ROUND_COPY.triage.name,
    "ROUND_COPY.compare.name (rename)": ROUND_COPY.compare.name,
    "usageDecisions Yes": usageDecisions("x")[0].label,
    "usageDecisions No": usageDecisions("x")[1].label,
    "USAGE_PASS_LABEL": USAGE_PASS_LABEL,
    "USAGE_PASS_TITLE": USAGE_PASS_TITLE,
    "USAGE_PASS_ARIA_LABEL": USAGE_PASS_ARIA_LABEL,
    "QUICK_PACE_LABEL": QUICK_PACE_LABEL,
    "QUICK_INTRO_LINE": QUICK_INTRO_LINE,
    "WELCOME_ROUND_KICKER": WELCOME_ROUND_KICKER,
    "THIS_ROUND_LABEL (roundLabel)": THIS_ROUND_LABEL,
    "TIMED_BOX_HELPER": TIMED_BOX_HELPER,
    "NO_TIMER_HELPER": NO_TIMER_HELPER,
    "SUB_MINUTE_LABEL": SUB_MINUTE_LABEL,
  };

  // §4 count-templates: interpolate a by-design count. Scan text with the leading
  // count stripped (a stray non-leading digit still fails). Key = slot, value = builder.
  const countTemplates: Record<string, (n: number) => string> = {
    "answeredSoFar cue": answeredSoFar,
    "inYourLifeLine recap": inYourLifeLine,
    "restingLine recap": restingLine,
  };

  it("reaches every §4 usage-round string as an exported constant", () => {
    for (const [slot, value] of Object.entries(staticCopy)) {
      expect(value, slot).toBeTruthy();
    }
    for (const [slot, build] of Object.entries(countTemplates)) {
      expect(build(1), slot).toBeTruthy();
    }
    // The length menu's ONLY home (§3.1): reachable and a full five-option list.
    expect(ROUND_BOX_OPTIONS.map((o) => o.label)).toEqual([
      "30 seconds",
      "1 minute",
      "2 minutes",
      "5 minutes",
      "No timer",
    ]);
  });

  it("covers exactly the §4 slot set (a new copy slot without a constant fails)", () => {
    // Adding a §4 row means adding it here — this pins the inventory's shape so an
    // un-wired slot can't slip through the audit.
    expect(new Set(Object.keys(staticCopy))).toEqual(
      new Set([
        "ROUND_COPY.usage.name (h1)",
        "ROUND_COPY.usage.explainer",
        "ROUND_COPY.triage.name (rename)",
        "ROUND_COPY.compare.name (rename)",
        "usageDecisions Yes",
        "usageDecisions No",
        "USAGE_PASS_LABEL",
        "USAGE_PASS_TITLE",
        "USAGE_PASS_ARIA_LABEL",
        "QUICK_PACE_LABEL",
        "QUICK_INTRO_LINE",
        "WELCOME_ROUND_KICKER",
        "THIS_ROUND_LABEL (roundLabel)",
        "TIMED_BOX_HELPER",
        "NO_TIMER_HELPER",
        "SUB_MINUTE_LABEL",
      ]),
    );
    expect(new Set(Object.keys(countTemplates))).toEqual(
      new Set(["answeredSoFar cue", "inYourLifeLine recap", "restingLine recap"]),
    );
  });

  it("keeps every §4 static constant free of digits, denominators, and urgency", () => {
    for (const [slot, value] of Object.entries(staticCopy)) {
      expect(registerViolation(value), `${slot}: "${value}"`).toBeNull();
    }
  });

  it("keeps every §4 count-template's static text clean (count stripped)", () => {
    for (const [slot, build] of Object.entries(countTemplates)) {
      const stripped = build(0).replace(/^\d+/, "");
      expect(registerViolation(stripped), `${slot}: "${stripped}"`).toBeNull();
    }
  });

  it("keeps the length-menu labels clean of urgency/game framing (digits allowed)", () => {
    for (const { label } of ROUND_BOX_OPTIONS) {
      expect(registerViolation(label, /* allowDigits */ true), label).toBeNull();
    }
  });

  it("register scan is adversarial — it catches planted violations (not a no-op)", () => {
    expect(registerViolation("3 items left")).toBe("digit");
    expect(registerViolation("5 remaining")).toBe("digit");
    expect(registerViolation("still remaining")).toBe("urgency/game"); // word ban, no digit
    expect(registerViolation("two of three")).toBe("denominator");
    expect(registerViolation("hurry — last chance!")).toBe("urgency/game");
    expect(registerViolation("beat your score")).toBe("urgency/game");
    expect(registerViolation("2/10 sorted")).toBe("digit");
    // A stray SECOND digit survives the leading-count strip and still fails.
    expect(registerViolation("more, 7 to go".replace(/^\d+/, ""))).toBe("digit");
    // And the real strings must be clean under the same function.
    expect(registerViolation(ROUND_COPY.usage.name)).toBeNull();
    expect(registerViolation(SUB_MINUTE_LABEL)).toBeNull();
  });
});
