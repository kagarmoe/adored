import type { ReactNode } from "react";
import { Card } from "@/components/ui";

interface SessionResumeCardProps {
  status: "active" | "paused";
  goal: string | null;
  headingLevel: "h2" | "h3";
  className?: string;
  actions: ReactNode;
}

/**
 * The one resume card (workspace Continue + sort hub) — shell, heading, and
 * body only. The ENTIRE action area is the consumer's: the workspace swaps
 * Resume for its set-aside confirm group mid-flow; the hub renders
 * Resume+Details. Strings live here so a tone pass lands on both surfaces.
 */
export function SessionResumeCard({ status, goal, headingLevel, className = "", actions }: SessionResumeCardProps) {
  const Heading = headingLevel;
  const paused = status === "paused";
  return (
    <Card padding="lg" className={`border-hairline bg-content-soft ${className}`}>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Heading className="mb-2 text-lg text-ink">
            {paused ? "Your sort is paused" : "Keep sorting"}
          </Heading>
          <p className="text-sm text-ink">
            {paused
              ? "Your sort is safe — pick up where you left off."
              : goal || "Pick up where you left off — one decision at a time."}
          </p>
        </div>
        {actions}
      </div>
    </Card>
  );
}
