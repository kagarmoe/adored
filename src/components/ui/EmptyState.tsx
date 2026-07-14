import React from "react";
import { Button, buttonVariants } from "./Button";
import Link from "next/link";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  heading: string;
  message?: string;
  action?: {
    label: string;
    mobileLabel?: string;
    href?: string;
    onClick?: () => void;
  };
}

const EmptyState = React.forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon, heading, message, action, className = "", ...props }, ref) => (
    <div
      className={`
        flex flex-col items-center justify-center py-12 px-4 text-center
        ${className}
      `}
      ref={ref}
      {...props}
    >
      {icon && <div className="mb-4 text-primary text-5xl">{icon}</div>}
      <h3 className="text-lg text-ink mb-2">{heading}</h3>
      {message && <p className="text-ink-soft mb-6 max-w-sm">{message}</p>}
      {action?.href ? (
        <Link
          href={action.href}
          aria-label={action.mobileLabel ? action.label : undefined}
          className={`${buttonVariants({ variant: "primary" })} w-full max-w-xs sm:w-auto`}
        >
          {action.mobileLabel ? (
            <>
              <span className="sm:hidden">{action.mobileLabel}</span>
              <span className="hidden sm:inline">{action.label}</span>
            </>
          ) : (
            action.label
          )}
        </Link>
      ) : action ? (
        <Button
          variant="primary"
          onClick={action.onClick}
          aria-label={action.mobileLabel ? action.label : undefined}
          className="w-full max-w-xs sm:w-auto"
        >
          {action.mobileLabel ? (
            <>
              <span className="sm:hidden">{action.mobileLabel}</span>
              <span className="hidden sm:inline">{action.label}</span>
            </>
          ) : (
            action.label
          )}
        </Button>
      ) : null}
    </div>
  )
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
