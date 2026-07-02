import React from "react";

interface ErrorMessageProps extends React.HTMLAttributes<HTMLDivElement> {
  message: string;
}

const ErrorMessage = React.forwardRef<HTMLDivElement, ErrorMessageProps>(
  ({ message, className = "", ...props }, ref) => (
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
    </div>
  )
);
ErrorMessage.displayName = "ErrorMessage";

export { ErrorMessage };
