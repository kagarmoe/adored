import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: "md" | "lg" | "none";
  interactive?: boolean;
}

const paddingMap = {
  md: "p-4",
  lg: "p-5",
  none: "",
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", children, padding = "md", interactive = false, ...props }, ref) => (
    <div
      className={`
        rounded-card bg-surface shadow-card border border-hairline
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
