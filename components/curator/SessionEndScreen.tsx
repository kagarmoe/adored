'use client'

import type { Tier, TieredItem } from '@/lib/elo'
import type { AboveLineConfidence } from '@/lib/termination'

interface Props {
  tiered: TieredItem[]
  comparisonCount: number
  // 'medium' renders the partial tier breakdown with a hedge; 'low' suppresses
  // the breakdown so users aren't shown results the algorithm hasn't stabilized.
  confidence: AboveLineConfidence
  onContinue: () => void
}

const TIER_LABELS: Record<Tier, string> = {
  favorites: 'Top picks',
  strongKeeps: 'Strong keeps',
  maybeKeeps: 'Maybe keeps',
  belowTheLine: 'Below the line',
}

const TIER_ORDER: Tier[] = ['favorites', 'strongKeeps', 'maybeKeeps', 'belowTheLine']

export function SessionEndScreen({
  tiered,
  comparisonCount,
  confidence,
  onContinue,
}: Props) {
  const itemsRanked = tiered.length
  const showTiers = confidence === 'medium'

  const headline = showTiers
    ? `Good job — you ranked ${itemsRanked} item${itemsRanked === 1 ? '' : 's'} in this session.`
    : `Good job! You ranked ${comparisonCount} comparison${comparisonCount === 1 ? '' : 's'}.`

  const note = showTiers
    ? "Here's where things stand — a few more rounds would lock it in."
    : 'Try a longer session next time to lock in the tiers.'

  return (
    <div
      data-testid="session-end-screen"
      className="min-h-screen flex items-center justify-center px-6 text-center"
    >
      <div className="max-w-md">
        <p className="font-display text-heading text-text-primary mb-3">
          {headline}
        </p>
        <p className="font-body text-text-muted mb-8">{note}</p>

        {showTiers && (
          <>
            <p className="font-display text-label uppercase tracking-widest text-text-muted mb-3">
              Where things stand
            </p>
            <ul className="text-left space-y-2 mb-8">
              {TIER_ORDER.map(tier => {
                const count = tiered.filter(t => t.tier === tier).length
                return (
                  <li
                    key={tier}
                    className="flex justify-between font-body text-text-primary border-b border-border pb-1"
                  >
                    <span>{TIER_LABELS[tier]}</span>
                    <span className="text-text-muted">{count}</span>
                  </li>
                )
              })}
            </ul>

            <p className="font-body text-text-muted text-small mb-8">
              {comparisonCount} comparison{comparisonCount === 1 ? '' : 's'} so far.
            </p>
          </>
        )}

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
