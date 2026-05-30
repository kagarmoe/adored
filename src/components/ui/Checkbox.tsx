import React from "react";

interface CheckboxProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ label, className = "", ...props }, ref) => (
    <div className="flex items-center gap-3">
      <input
        type="checkbox"
        className={`
          w-6 h-6 min-h-6 min-w-6 rounded border-2 border-gray-300
          text-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500
          focus:ring-offset-2 cursor-pointer disabled:opacity-50
          disabled:cursor-not-allowed
          ${className}
        `}
        ref={ref}
        {...props}
      />
      {label && (
        <label className="text-sm font-medium text-gray-700 cursor-pointer" htmlFor={props.id}>
          {label}
          {props.required && <span className="text-red-600">*</span>}
        </label>
      )}
    </div>
  )
);
Checkbox.displayName = "Checkbox";

export { Checkbox };
export type { CheckboxProps };
