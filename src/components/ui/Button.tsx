import { cva, type VariantProps } from "class-variance-authority";
import React from "react";

const buttonVariants = cva(
  "inline-flex items-center justify-center font-medium rounded-pill transition-colors duration-200 ease-gentle focus:outline-hidden focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary disabled:opacity-50 disabled:cursor-not-allowed active:opacity-75",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-ink hover:bg-primary-hover",
        secondary: "bg-glass text-ink hover:bg-glass-strong border border-ink-soft",
        ghost: "bg-transparent text-primary hover:bg-glass",
        danger: "bg-error text-primary-ink hover:bg-error-deep",
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
