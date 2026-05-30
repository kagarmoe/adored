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
        bg-red-50 border border-red-200 rounded-lg px-4 py-4
        flex items-start justify-between gap-4
        ${className}
      `}
      ref={ref}
      {...props}
    >
      <div>
        <p className="text-red-900 font-medium">Error</p>
        <p className="text-red-700 text-sm mt-1">{message}</p>
      </div>
      {onRetry && <Button variant="danger" size="sm" onClick={onRetry} className="mt-2">
        Retry
      </Button>}
    </div>
  )
);
ErrorMessage.displayName = "ErrorMessage";

export { ErrorMessage };
export type { ErrorMessageProps };
