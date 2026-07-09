import Link from "next/link";
import { Button, Card } from "@/components/ui";
import type { NextRound } from "@/lib/next-round";

interface RecommendedRoundCardProps {
  round: NextRound;
  href: string;
}

/**
 * The calm "here's a good next step" card on the sort hub. It surfaces the
 * derived recommendation (recommendNextRound) as one gentle, affirming suggestion
 * — never a to-do count or a "you still have N left" nag. Coexists with the
 * Triage/Compare cards below it: this is the *suggested* path, not the only one.
 */
export function RecommendedRoundCard({ round, href }: RecommendedRoundCardProps) {
  return (
    <Card padding="lg" className="min-h-52 border-hairline bg-content-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-ink-soft">A good next step</p>
          <h2 className="mt-1 text-lg text-ink">{round.label}</h2>
          <p className="mt-1 text-sm text-ink-soft">{round.description}</p>
        </div>
        <Link href={href} className="shrink-0">
          <Button>{round.cta}</Button>
        </Link>
      </div>
    </Card>
  );
}
