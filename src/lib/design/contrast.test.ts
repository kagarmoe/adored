import { describe, expect, it } from "vitest";
import { wcagContrast } from "culori";
import { light, dark, type ThemeTokens } from "./tokens";

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
    [t.sparkInk, t.spark, 4.5, "text on spark"],
    [t.ink, t.accentAqua, 4.5, "ink on accent-aqua (chips/cards)"],
    [t.ink, t.accentSky, 4.5, "ink on accent-sky (Not yet banner + paused badge)"],
    ["#FFFFFF", t.accentPeriwinkle, 4.5, "white on accent-periwinkle (owner badge)"],
    [t.tierLoveInk, t.tierLove, 4.5, "text on Love chip"],
    [t.tierLikeInk, t.tierLike, 4.5, "text on Like chip"],
    [t.tierMaybeInk, t.tierMaybe, 4.5, "text on Maybe chip"],
    [t.tierOnwardInk, t.tierOnward, 4.5, "text on Onward chip"],
    [t.errorDeep, t.errorSoft, 4.5, "error-deep on error-soft"],
    [t.warningDeep, t.warningSoft, 4.5, "warning-deep on warning-soft"],
    [t.successDeep, t.successSoft, 4.5, "success-deep on success-soft"],
    [t.infoDeep, t.infoSoft, 4.5, "info-deep on info-soft"],
    [t.primaryInk, t.error, 4.5, "text on error (destructive button)"],
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
