import React from "react";

interface PageContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

const PageContainer = React.forwardRef<HTMLDivElement, PageContainerProps>(
  ({ children, className = "", ...props }, ref) => (
    <div className={`max-w-4xl mx-auto px-4 py-6 ${className}`} ref={ref} {...props}>
      {children}
    </div>
  )
);
PageContainer.displayName = "PageContainer";

export { PageContainer };
export type { PageContainerProps };
