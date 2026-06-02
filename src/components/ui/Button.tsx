import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium rounded-control transition-colors duration-200 ease-gentle focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-verdigris disabled:opacity-50 disabled:cursor-not-allowed active:opacity-75",
  {
    variants: {
      variant: {
        primary: "bg-primary text-white hover:bg-primary-deep",
        secondary: "bg-clay-soft text-ink hover:bg-clay-soft-strong",
        ghost: "bg-transparent text-verdigris hover:bg-verdigris-soft",
        danger: "bg-error text-white hover:bg-error-deep",
      },
      size: {
        sm: "h-9 px-3 text-sm",
        md: "h-11 px-4 text-base",
        lg: "h-14 px-6 text-lg",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  }
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  fullWidth?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, fullWidth, ...props }, ref) => (
    <button
      className={`${buttonVariants({ variant, size })} ${fullWidth ? "w-full" : ""} ${className || ""}`}
      ref={ref}
      {...props}
    />
  )
);
Button.displayName = "Button";

export { Button, buttonVariants };
export type { ButtonProps };
