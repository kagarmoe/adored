import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

const badgeVariants = cva("inline-flex items-center justify-center font-semibold rounded-full text-sm px-3 py-1", {
  variants: {
    variant: {
      // Tiers — the cool value-ramp; each pairs hue with a label + position too.
      top: "bg-tier-love text-tier-love-ink",
      high: "bg-tier-like text-tier-like-ink",
      medium: "bg-tier-maybe text-tier-maybe-ink",
      low: "bg-tier-onward text-tier-onward-ink",
      // Status — semantic where it carries meaning, neutral otherwise.
      draft: "bg-accent-aqua text-ink",
      finalized: "bg-success-soft text-success-deep",
      active: "bg-accent-aqua text-ink",
      // Pause is calm, reversible, and not an error — it must NOT speak Danger
      // (DESIGN.md: brand never poaches safety hues). Cool-blue benign, matching
      // the "Patient waiting / Not yet" treatment (accent-cornflower + ink).
      paused: "bg-accent-cornflower text-ink",
      completed: "bg-success-soft text-success-deep",
      abandoned: "bg-hairline text-ink",
      archived: "bg-hairline text-ink",
      deleted: "bg-error-soft text-error-deep",
      pending: "bg-hairline text-ink",
      owner: "bg-accent-periwinkle text-ink",
      curator: "bg-accent-aqua text-ink",
    },
  },
  defaultVariants: {
    variant: "low",
  },
});

interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  children: React.ReactNode;
}

const Badge = React.forwardRef<HTMLDivElement, BadgeProps>(({ className, variant, children, ...props }, ref) => (
  <div className={`${badgeVariants({ variant })} ${className || ""}`} ref={ref} {...props}>
    {children}
  </div>
));
Badge.displayName = "Badge";

export { Badge, badgeVariants };
export type { BadgeProps };
