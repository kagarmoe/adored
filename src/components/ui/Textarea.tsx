import React from "react";

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className = "", id, rows = 3, ...props }, ref) => {
    const generatedId = React.useId();
    const textareaId = id ?? generatedId;
    const inner = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => inner.current!);
    // Grow to the content so a filled story never clips mid-line; `rows` is the floor.
    React.useLayoutEffect(() => {
      const el = inner.current;
      if (!el) return;
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + el.offsetHeight - el.clientHeight}px`;
    }, [props.value]);
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={textareaId} className="block text-sm font-medium text-ink mb-2">
            {label}
            {props.required && <span className="text-error-deep">*</span>}
          </label>
        )}
        <textarea
          id={textareaId}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${textareaId}-error` : undefined}
          className={`
            w-full bg-glass border border-hairline rounded-control px-4 py-3 text-ink
            transition-shadow duration-200 ease-gentle
            placeholder:text-ink-soft focus:outline-hidden focus-visible:ring-2 focus-visible:ring-primary
            focus-visible:border-transparent disabled:opacity-50 disabled:cursor-not-allowed
            resize-none
            ${error ? "border-error focus-visible:ring-error" : ""}
            ${className}
          `}
          ref={inner}
          rows={rows}
          {...props}
        />
        {error && (
          <p id={`${textareaId}-error`} className="text-error-deep text-sm mt-2">
            {error}
          </p>
        )}
      </div>
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
