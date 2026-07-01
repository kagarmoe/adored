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
      draft: "bg-content-soft text-ink",
      finalized: "bg-success-soft text-success-deep",
      active: "bg-content-soft text-ink",
      // Pause is calm, reversible, and not an error — it must NOT speak Danger
      // (DESIGN.md: brand never poaches safety hues). Cool-blue benign, matching
      // the "Patient waiting / Not yet" treatment (content-mid + ink — the Sea Glass
      // content-deep is too dark to carry AA-legible text).
      paused: "bg-content-mid text-ink",
      completed: "bg-success-soft text-success-deep",
      abandoned: "bg-hairline text-ink",
      archived: "bg-hairline text-ink",
      deleted: "bg-error-soft text-error-deep",
      // Pending is a benign "not yet" state, not a warning — cool content-mid + ink
      // (same calm chip as paused). bg-hairline failed AA in dark (~3.9:1); content-mid
      // is AA in both themes (light 8.37:1, dark 5.87:1).
      pending: "bg-content-mid text-ink",
      owner: "bg-content-deeper text-white",
      curator: "bg-content-soft text-ink",
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
