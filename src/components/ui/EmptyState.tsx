import React from "react";
import { Button } from "./Button";
import Link from "next/link";

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  heading: string;
  message?: string;
  action?: {
    label: string;
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
      {icon && <div className="mb-4 text-clay text-5xl">{icon}</div>}
      <h3 className="text-lg text-ink mb-2">{heading}</h3>
      {message && <p className="text-ink-soft mb-6 max-w-sm">{message}</p>}
      {action?.href ? (
        <Link href={action.href}>
          <Button variant="primary">{action.label}</Button>
        </Link>
      ) : action ? (
        <Button variant="primary" onClick={action.onClick}>
          {action.label}
        </Button>
      ) : null}
    </div>
  )
);
EmptyState.displayName = "EmptyState";

export { EmptyState };
export type { EmptyStateProps };
