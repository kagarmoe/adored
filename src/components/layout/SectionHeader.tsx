import React from "react";

interface SectionHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  actions?: React.ReactNode;
}

const SectionHeader = React.forwardRef<HTMLDivElement, SectionHeaderProps>(
  ({ title, description, actions, className = "", ...props }, ref) => (
    <div
      className={`flex items-start justify-between gap-6 mb-6 ${className}`}
      ref={ref}
      {...props}
    >
      <div>
        <h2 className="mb-1.5">{title}</h2>
        {description && <p className="text-ink-soft prose-measure">{description}</p>}
      </div>
      {actions && <div className="flex gap-2 flex-shrink-0">{actions}</div>}
    </div>
  )
);
SectionHeader.displayName = "SectionHeader";

export { SectionHeader };
export type { SectionHeaderProps };
