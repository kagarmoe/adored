import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

const badgeVariants = cva("inline-flex items-center justify-center font-semibold rounded-full text-sm px-3 py-1", {
  variants: {
    variant: {
      top: "bg-warning-soft text-warning-deep",
      high: "bg-verdigris-soft text-verdigris-deep",
      medium: "bg-warning-soft text-warning-deep",
      low: "bg-plaster text-ink",
      draft: "bg-verdigris-soft text-verdigris-deep",
      finalized: "bg-success-soft text-success-deep",
      active: "bg-verdigris-soft text-verdigris-deep",
      paused: "bg-warning-soft text-warning-deep",
      completed: "bg-success-soft text-success-deep",
      abandoned: "bg-plaster text-ink",
      archived: "bg-plaster text-ink",
      deleted: "bg-error-soft text-error-deep",
      pending: "bg-plaster text-ink",
      owner: "bg-verdigris-soft text-verdigris-deep",
      curator: "bg-verdigris-soft text-verdigris-deep",
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
