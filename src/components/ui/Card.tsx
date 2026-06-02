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
  lg: "p-5",
  none: "",
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", children, padding = "md", border = true, interactive = false, ...props }, ref) => (
    <div
      className={`
        rounded-card bg-chalk
        ${border ? "border border-line" : ""}
        ${paddingMap[padding]}
        ${interactive ? "cursor-pointer transition-shadow duration-200 ease-gentle hover:shadow-lift active:opacity-90" : ""}
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
