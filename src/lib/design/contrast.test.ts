import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { wcagContrast } from "culori";

// The AA gate reads src/app/globals.css DIRECTLY — the live stylesheet is the
// single source of truth. (A hand-maintained TS mirror drifted before and this
// gate green-lit a stale palette; parsing the real file kills that drift class.)
const css = readFileSync(new URL("../../app/globals.css", import.meta.url), "utf8");

type ThemeTokens = Record<string, string>;

// Extracts flat `--color-<name>: #hex;` declarations from one selector's block
// and keys them camelCase (--color-ink-soft -> inkSoft).
function scopeVars(selector: RegExp): ThemeTokens {
  const block = css.match(selector);
  if (!block) throw new Error(`globals.css: scope ${selector} not found`);
  const vars: ThemeTokens = {};
  for (const m of block[1].matchAll(
    /--color-([a-z0-9-]+)\s*:\s*(#[0-9a-fA-F]{3,8})\s*;/g,
  )) {
    const key = m[1].replace(/-([a-z0-9])/g, (_, c: string) => c.toUpperCase());
    vars[key] = m[2];
  }
  if (Object.keys(vars).length === 0) {
    throw new Error(`globals.css: no --color-*: #hex vars in scope ${selector}`);
  }
  return vars;
}

// A missing token must fail loudly, never skip a pair silently.
function strict(vars: ThemeTokens): ThemeTokens {
  return new Proxy(vars, {
    get(target, prop: string) {
      if (!(prop in target)) {
        throw new Error(`globals.css: no --color var for token "${prop}"`);
      }
      return target[prop];
    },
  });
}

const lightScope = scopeVars(/:root\s*\{([^}]*)\}/);
const darkScope = scopeVars(/\[data-theme="dark"\]\s*\{([^}]*)\}/);

const light = strict(lightScope);
// Dark inherits the way CSS does: a var undeclared in [data-theme="dark"]
// falls back to its :root value.
const dark = strict({ ...lightScope, ...darkScope });

// Parser-honesty guard (QA review, purses-9oxh.6): the light→dark spread makes
// a dark var the PARSER failed to read (nested brace truncating the block, a
// value the hex regex can't match like oklch()/var(), a second dark block)
// silently assert its LIGHT value — a false green strict() cannot catch,
// because the key exists. Today the dark block redeclares every light token,
// so key-set parity converts all of those failure modes into hard failures.
it("dark scope redeclares every light token (parser-honesty guard)", () => {
  const lightKeys = Object.keys(lightScope).sort();
  const darkKeys = Object.keys(darkScope).sort();
  expect(darkKeys).toEqual(lightKeys);
});

// [foreground, background, minRatio, label]
function pairings(t: ThemeTokens): [string, string, number, string][] {
  return [
    [t.ink, t.ground, 4.5, "ink on ground"],
    [t.ink, t.surface, 4.5, "ink on surface"],
    [t.inkSoft, t.ground, 4.5, "ink-soft on ground"],
    [t.inkSoft, t.surface, 4.5, "ink-soft on surface (quiet secondary copy)"],
    [t.primaryInk, t.primary, 4.5, "primary-ink on primary"],
    [t.primary, t.ground, 4.5, "primary text/link on ground"],
    [t.primary, t.surface, 3.0, "primary border on surface"],
    // a:hover recolors live link text to primary-hover (globals.css) — a real
    // text role that had no guard (QA review, purses-9oxh.6).
    [t.primaryHover, t.ground, 4.5, "primary-hover link text on ground"],
    [t.primaryHover, t.surface, 4.5, "primary-hover link text on surface"],
    [t.sparkInk, t.spark, 4.5, "text on spark"],
    [t.ink, t.contentSoft, 4.5, "ink on content-soft (chips/cards)"],
    [t.ink, t.contentMid, 4.5, "ink on content-mid (Not yet banner + paused badge)"],
    // Pending badge uses bg-content-mid + text-ink (was bg-hairline, ~3.9:1 in dark).
    // Dedicated guard so a future token change can't silently regress the pending chip.
    [t.ink, t.contentMid, 4.5, "ink on content-mid (pending badge)"],
    ["#FFFFFF", t.contentDeeper, 4.5, "white on content-deeper (owner badge)"],
    [t.inkSoft, t.surfaceRaised, 4.5, "ink-soft on surface-raised (active panel error span, dark)"],
    [t.inkSoft, t.contentSoft, 4.5, "ink-soft on content-soft (active panel error span, light)"],
    [t.tierLoveInk, t.tierLove, 4.5, "text on Love chip"],
    [t.tierLikeInk, t.tierLike, 4.5, "text on Like chip"],
    [t.tierMaybeInk, t.tierMaybe, 4.5, "text on Maybe chip"],
    [t.tierOnwardInk, t.tierOnward, 4.5, "text on Onward chip"],
    [t.errorDeep, t.errorSoft, 4.5, "error-deep on error-soft"],
    [t.warningDeep, t.warningSoft, 4.5, "warning-deep on warning-soft"],
    [t.successDeep, t.successSoft, 4.5, "success-deep on success-soft"],
    [t.infoDeep, t.infoSoft, 4.5, "info-deep on info-soft"],
    [t.primaryInk, t.error, 4.5, "text on error (destructive button)"],
    [t.ringSweep, t.ringTrack, 3.0, "ring sweep on ring track (round timer, sole sighted signal)"],
    [t.ink, t.surface, 4.5, "expired ring ✓ (ink) on the ring disc (surface)"],
  ];
}

describe("design tokens meet WCAG AA", () => {
  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    for (const [fg, bg, min, label] of pairings(tokens)) {
      it(`${theme}: ${label} >= ${min}:1`, () => {
        expect(wcagContrast(fg, bg)).toBeGreaterThanOrEqual(min);
      });
    }
  }
});
