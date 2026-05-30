import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: "sm" | "md" | "lg" | "none";
  border?: boolean;
  interactive?: boolean;
}

const paddingMap = {
  sm: "p-2",
  md: "p-4",
  lg: "p-6",
  none: "",
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", children, padding = "md", border = true, interactive = false, ...props }, ref) => (
    <div
      className={`
        rounded-lg bg-white shadow-sm
        ${border ? "border border-gray-200" : ""}
        ${paddingMap[padding]}
        ${interactive ? "cursor-pointer hover:shadow-md transition-shadow active:opacity-75" : ""}
        ${className}
      `}
      ref={ref}
      {...props}
    >
      {children}
    </div>
  )
);
Card.displayName = "Card";

export { Card };
export type { CardProps };
