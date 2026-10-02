import React from "react";

interface Option {
  value: string;
  label: string;
}

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: Option[];
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className = "", ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-ink mb-2">
          {label}
          {props.required && <span className="text-error">*</span>}
        </label>
      )}
      <select
        className={`
          w-full bg-surface border border-hairline rounded-pill px-4 py-3 text-ink
          transition-shadow duration-200 ease-gentle
          focus:outline-hidden focus:ring-2 focus:ring-primary
          focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
          h-12 min-h-12
          ${error ? "border-error focus:ring-error" : ""}
          ${className}
        `}
        ref={ref}
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="text-error text-sm mt-2">{error}</p>}
    </div>
  )
);
Select.displayName = "Select";

export { Select };
