import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

const badgeVariants = cva("inline-flex items-center justify-center font-semibold rounded-full text-sm px-3 py-1", {
  variants: {
    variant: {
      top: "bg-gold-soft-strong text-ink",
      high: "bg-espresso-soft text-espresso-deep",
      medium: "bg-warning-soft text-warning-deep",
      low: "bg-vellum text-ink",
      draft: "bg-espresso-soft text-espresso-deep",
      finalized: "bg-success-soft text-success-deep",
      active: "bg-espresso-soft text-espresso-deep",
      paused: "bg-warning-soft text-warning-deep",
      completed: "bg-success-soft text-success-deep",
      abandoned: "bg-vellum text-ink",
      archived: "bg-vellum text-ink",
      deleted: "bg-error-soft text-error-deep",
      pending: "bg-vellum text-ink",
      owner: "bg-gold-soft text-ink",
      curator: "bg-espresso-soft text-espresso-deep",
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
