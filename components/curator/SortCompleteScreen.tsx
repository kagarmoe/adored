'use client'

import type { Tier, TieredItem } from '@/lib/elo'

interface Props {
  tiered: TieredItem[]
  comparisonCount: number
  onContinue: () => void
}

const TIER_LABELS: Record<Tier, string> = {
  favorites: 'Top picks',
  strongKeeps: 'Strong keeps',
  maybeKeeps: 'Maybe keeps',
  belowTheLine: 'Below the line',
}

const TIER_ORDER: Tier[] = ['favorites', 'strongKeeps', 'maybeKeeps', 'belowTheLine']

export function SortCompleteScreen({ tiered, comparisonCount, onContinue }: Props) {
  const counts = TIER_ORDER.map(tier => ({
    tier,
    count: tiered.filter(t => t.tier === tier).length,
  }))

  return (
    <div
      data-testid="sort-complete-screen"
      className="min-h-screen flex items-center justify-center px-6 text-center"
    >
      <div className="max-w-md">
        <p className="font-display text-heading text-text-primary mb-3">
          Congratulations — your collection is sorted!
        </p>
        <p className="font-body text-text-muted mb-8">
          We have a confident picture of your top picks and where everything else lands.
        </p>

        <ul className="text-left space-y-2 mb-8">
          {counts.map(({ tier, count }) => (
            <li
              key={tier}
              className="flex justify-between font-body text-text-primary border-b border-border pb-1"
            >
              <span>{TIER_LABELS[tier]}</span>
              <span className="text-text-muted">{count}</span>
            </li>
          ))}
        </ul>

        <p className="font-body text-text-muted text-small mb-8">
          {comparisonCount} comparison{comparisonCount === 1 ? '' : 's'} used.
        </p>

        <button
          onClick={onContinue}
          className="font-display text-label uppercase tracking-widest text-accent"
        >
          See results →
        </button>
      </div>
    </div>
  )
}
