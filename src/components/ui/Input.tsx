import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(({ label, error, className = "", ...props }, ref) => (
  <div className="w-full">
    {label && (
      <label className="block text-sm font-medium text-gray-700 mb-2">
        {label}
        {props.required && <span className="text-red-600">*</span>}
      </label>
    )}
    <input
      className={`
        w-full border border-gray-300 rounded-lg px-4 py-3 text-gray-900
        placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500
        focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
        h-12 min-h-12
        ${error ? "border-red-500 focus:ring-red-500" : ""}
        ${className}
      `}
      ref={ref}
      {...props}
    />
    {error && <p className="text-red-600 text-sm mt-2">{error}</p>}
  </div>
));
Input.displayName = "Input";

export { Input };
export type { InputProps };
