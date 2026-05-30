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
        <label className="block text-sm font-medium text-gray-700 mb-2">
          {label}
          {props.required && <span className="text-red-600">*</span>}
        </label>
      )}
      <select
        className={`
          w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900
          focus:outline-none focus:ring-2 focus:ring-blue-500
          focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
          h-12 min-h-12
          ${error ? "border-red-500 focus:ring-red-500" : ""}
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
      {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
    </div>
  )
);
Select.displayName = "Select";

export { Select };
export type { SelectProps, Option };
