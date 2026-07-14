import React from "react";

interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ title, description, actions, className = "", ...props }, ref) => (
    <div
      className={`mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-6 ${className}`}
      ref={ref}
      {...props}
    >
      <div>
        <h2 className="mb-1.5">{title}</h2>
        {description && <p className="text-ink-soft prose-measure">{description}</p>}
      </div>
      {actions && <div className="flex w-full shrink-0 flex-wrap gap-2 sm:w-auto">{actions}</div>}
    </div>
  )
);
SectionHeader.displayName = "SectionHeader";

export { SectionHeader };
export type { SectionHeaderProps };
