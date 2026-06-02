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
        rounded-card bg-veil shadow-card
        ${border ? "border border-line" : ""}
        ${paddingMap[padding]}
        ${interactive ? "cursor-pointer transition-all duration-200 ease-gentle hover:-translate-y-0.5 hover:shadow-card-hover active:translate-y-0 active:shadow-card" : ""}
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
