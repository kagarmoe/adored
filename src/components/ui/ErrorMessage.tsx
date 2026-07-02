import React from "react";
import { Button } from "./Button";

interface ErrorMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  message: string;
  onRetry?: () => void;
}

const ErrorMessage = React.forwardRef<HTMLDivElement, ErrorMessageProps>(
  ({ message, onRetry, className = "", ...props }, ref) => (
    <div
      className={`
        bg-error-soft border border-error-soft rounded-control px-4 py-4
        flex items-start justify-between gap-4
        ${className}
      `}
      ref={ref}
      role="alert"
      {...props}
    >
      <div>
        <p className="text-error-deep font-medium">Error</p>
        <p className="text-error-deep text-sm mt-1">{message}</p>
      </div>
      {onRetry && <Button variant="danger" size="sm" onClick={onRetry} className="mt-2">
        Retry
      </Button>}
    </div>
  )
);
ErrorMessage.displayName = "ErrorMessage";

export { ErrorMessage };
