// The per-item usage chip's copy (Epic S1, spec §2.2): a quiet, count-free
// annotation on the Standing surface — "In your life" (uses) / "Resting"
// (not_uses). First-order TONE items: affirming, no number, no denominator, no
// urgency. Kept in one dependency-free module so the render and the register
// scan assert against the same strings.
import type { UsageAnswer } from "@/lib/derive-usage";

export const IN_LIFE_CHIP = "In your life";
export const RESTING_CHIP = "Resting";

export function usageChipLabel(usage: UsageAnswer): string {
  return usage === "uses" ? IN_LIFE_CHIP : RESTING_CHIP;
}
