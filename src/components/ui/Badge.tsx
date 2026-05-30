import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

const badgeVariants = cva("inline-flex items-center justify-center font-semibold rounded-full text-sm px-3 py-1", {
  variants: {
    variant: {
      top: "bg-yellow-100 text-yellow-900",
      high: "bg-blue-100 text-blue-900",
      medium: "bg-amber-100 text-amber-900",
      low: "bg-gray-100 text-gray-900",
      draft: "bg-blue-100 text-blue-900",
      finalized: "bg-green-100 text-green-900",
      active: "bg-blue-100 text-blue-900",
      paused: "bg-yellow-100 text-yellow-900",
      completed: "bg-green-100 text-green-900",
      abandoned: "bg-gray-100 text-gray-900",
      archived: "bg-gray-100 text-gray-900",
      deleted: "bg-red-100 text-red-900",
      pending: "bg-gray-100 text-gray-900",
      owner: "bg-purple-100 text-purple-900",
      curator: "bg-indigo-100 text-indigo-900",
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
