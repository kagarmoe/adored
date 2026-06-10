import React from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-ink mb-2">
          {label}
          {props.required && <span className="text-error">*</span>}
        </label>
      )}
      <textarea
        className={`
          w-full bg-surface border border-hairline rounded-control px-4 py-3 text-ink
          transition-shadow duration-200 ease-gentle
          placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-primary
          focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
          resize-none
          ${error ? "border-error focus:ring-error" : ""}
          ${className}
        `}
        ref={ref}
        {...props}
      />
      {error && <p className="text-error text-sm mt-2">{error}</p>}
    </div>
  )
);
Textarea.displayName = "Textarea";

export { Textarea };
export type { TextareaProps };
