'use client'

import type { Tier, TieredItem } from '@/lib/elo'

interface Props {
  tiered: TieredItem[]
  comparisonCount: number
  // When true, the user is close to natural completion: ratings have been
  // stable for some comparisons but not the full streak required.
  closeToCompletion?: boolean
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
  closeToCompletion,
  onContinue,
}: Props) {
  const itemsRanked = tiered.length
  const counts = TIER_ORDER.map(tier => ({
    tier,
    count: tiered.filter(t => t.tier === tier).length,
  }))

  const headline = `Good job — you ranked ${itemsRanked} item${itemsRanked === 1 ? '' : 's'} in this session.`
  const progressNote = closeToCompletion
    ? "Your top picks are coming into focus — a few more rounds and you'll be done."
    : 'Your rankings are saved — come back anytime to keep refining.'

  return (
    <div
      data-testid="session-end-screen"
      className="min-h-screen flex items-center justify-center px-6 text-center"
    >
      <div className="max-w-md">
        <p className="font-display text-heading text-text-primary mb-3">
          {headline}
        </p>
        <p className="font-body text-text-muted mb-8">{progressNote}</p>

        <p className="font-display text-label uppercase tracking-widest text-text-muted mb-3">
          Where things stand
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
          {comparisonCount} comparison{comparisonCount === 1 ? '' : 's'} so far.
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
