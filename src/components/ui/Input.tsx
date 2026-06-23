import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ label, error, className = "", id, ...props }, ref) => {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  return (
    <div className="w-full">
      {label && (
        <label htmlFor={inputId} className="block text-sm font-medium text-ink mb-2">
          {label}
          {props.required && <span className="text-error">*</span>}
        </label>
      )}
      <input
        id={inputId}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${inputId}-error` : undefined}
        className={`
          w-full bg-surface border border-hairline rounded-control px-4 py-3 text-ink
          transition-shadow duration-200 ease-gentle
          placeholder:text-ink-soft focus:outline-none focus-visible:ring-2 focus-visible:ring-primary
          focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
          h-12 min-h-12
          ${error ? "border-error focus:ring-error" : ""}
          ${className}
        `}
        ref={ref}
        {...props}
      />
      {error && (
        <p id={`${inputId}-error`} className="text-error text-sm mt-2">
          {error}
        </p>
      )}
    </div>
  );
});
Input.displayName = "Input";

export { Input };
export type { InputProps };
