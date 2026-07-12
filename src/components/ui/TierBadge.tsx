import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

const tierBadgeVariants = cva(
  "inline-flex items-center gap-1.5 font-semibold rounded-full text-sm px-3 py-1",
  {
    variants: {
      tier: {
        love: "bg-tier-love text-tier-love-ink",
        like: "bg-tier-like text-tier-like-ink",
        maybe: "bg-tier-maybe text-tier-maybe-ink",
        onward: "bg-tier-onward text-tier-onward-ink",
      },
    },
    defaultVariants: { tier: "love" },
  }
);

const TIER_META = {
  love: { glyph: "●", label: "Love" }, // ●
  like: { glyph: "◕", label: "Like" }, // ◕
  maybe: { glyph: "◑", label: "Maybe" }, // ◑
  onward: { glyph: "○", label: "Onward" }, // ○
} as const;

type Tier = keyof typeof TIER_META;

interface TierBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof tierBadgeVariants> {
  /** Where this item sits on the value-ramp. */
  tier: Tier;
  /** Show the text label beside the glyph. Default true. */
  showLabel?: boolean;
}

const TierBadge = React.forwardRef<HTMLSpanElement, TierBadgeProps>(
  ({ tier = "love", showLabel = true, className = "", ...props }, ref) => {
    const meta = TIER_META[tier as Tier];
    // Glyph-only badges carry the tier in their accessible name — a visible text
    // label would break the loved ranking's deliberately label-free surface.
    return (
      <span
        ref={ref}
        className={`${tierBadgeVariants({ tier })} ${className}`}
        {...(showLabel ? {} : { role: "img", "aria-label": meta.label })}
        {...props}
      >
        <span aria-hidden="true">{meta.glyph}</span>
        {showLabel && <span>{meta.label}</span>}
      </span>
    );
  }
);
TierBadge.displayName = "TierBadge";

export { TierBadge };
