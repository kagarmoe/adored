import React from "react";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  padding?: "md" | "lg" | "none";
  interactive?: boolean;
  /** "card": grid/list tile, opaque pre-composited fill, no blur (cheap to scroll).
   *  "glass": a text-carrying panel over photos/scroll — glass-strong + blur + rim.
   *  "danger": a destructive section (delete account / collection) — the card fill with a sober error rim. */
  variant?: "card" | "glass" | "danger";
}

const surfaceMap = {
  card: "bg-card shadow-card border border-hairline",
  glass: "bg-glass-strong backdrop-blur-xl shadow-lift border border-rim",
  danger: "bg-card shadow-card border border-error",
};

const paddingMap = {
  md: "p-4",
  lg: "p-5",
  none: "",
};

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className = "", children, padding = "md", interactive = false, variant = "card", ...props }, ref) => (
    <div
      className={`
        rounded-card ${surfaceMap[variant]}
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
