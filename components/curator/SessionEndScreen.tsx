'use client'

import type { Tier, TieredItem } from '@/lib/elo'
import {
  estimateSessionsRemaining,
  type AboveLineConfidence,
  type EstimableTier,
} from '@/lib/termination'

interface Props {
  tiered: TieredItem[]
  // Cumulative lifetime comparison count (from the DB / persisted store).
  // Used for display ("N comparisons so far"), NOT for the session estimate.
  comparisonCount: number
  // Number of comparisons the user submitted *in this session only*. This is
  // what feeds the per-tier session-count estimate, because the estimate
  // extrapolates from this session's pace. Mixing in cumulative history
  // wildly underestimates remaining work for returning curators (their
  // lifetime count makes "remaining" look small even when this session
  // contributed only a handful of rounds). Defaults to comparisonCount for
  // backward compatibility with the demo path / first-time users where the
  // two numbers are the same.
  comparisonsThisSession?: number
  // 'medium' renders the partial tier breakdown with a hedge; 'low' suppresses
  // the breakdown so users aren't shown results the algorithm hasn't stabilized.
  confidence: AboveLineConfidence
  // Total items being ranked in the collection. Used at low confidence to
  // estimate how many additional sessions would lock in each tier. Defaults
  // to tiered.length when not supplied.
  itemCount?: number
  onContinue: () => void
}

const TIER_LABELS: Record<Tier, string> = {
  favorites: 'Top picks',
  strongKeeps: 'Strong keeps',
  maybeKeeps: 'Maybe keeps',
  belowTheLine: 'Below the line',
}

const TIER_ORDER: Tier[] = ['favorites', 'strongKeeps', 'maybeKeeps', 'belowTheLine']

const ESTIMATE_TIERS: { tier: EstimableTier; label: string }[] = [
  { tier: 'favorites', label: 'favorites' },
  { tier: 'strongKeeps', label: 'likely keeps' },
  { tier: 'maybeKeeps', label: 'maybe keeps' },
]

function formatSessions(n: number): string {
  if (n <= 0) return 'this session'
  return `~${n} session${n === 1 ? '' : 's'}`
}

export function SessionEndScreen({
  tiered,
  comparisonCount,
  comparisonsThisSession,
  confidence,
  itemCount,
  onContinue,
}: Props) {
  const itemsRanked = tiered.length
  const totalItems = itemCount ?? tiered.length
  const showTiers = confidence === 'medium'
  const sessionComparisons = comparisonsThisSession ?? comparisonCount

  // Headline copy: medium frames the work as "items ranked" (the curation
  // outcome — fits the tier breakdown shown below). Low frames it as
  // "comparisons" (the algorithm progress — fits the per-tier session-count
  // estimates shown below, which are denominated in rounds). The asymmetry
  // is intentional design, not an oversight; do not unify without a UX call.
  const headline = showTiers
    ? `Good job — you ranked ${itemsRanked} item${itemsRanked === 1 ? '' : 's'} in this session.`
    : `Good job! You ranked ${comparisonCount} comparison${comparisonCount === 1 ? '' : 's'}.`

  const note = showTiers
    ? "Here's where things stand — a few more rounds would lock it in."
    : 'Try another session of the same length to lock in the tiers.'

  const estimates = ESTIMATE_TIERS.map(({ tier, label }) => ({
    tier,
    label,
    sessions: estimateSessionsRemaining(totalItems, sessionComparisons, tier),
  }))

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

        {!showTiers && (
          <>
            <p className="font-display text-label uppercase tracking-widest text-text-muted mb-3">
              Estimated effort to lock in
            </p>
            <ul
              data-testid="session-estimates"
              className="text-left space-y-2 mb-8"
            >
              {estimates.map(({ tier, label, sessions }) => (
                <li
                  key={tier}
                  className="flex justify-between font-body text-text-primary border-b border-border pb-1"
                >
                  <span>{label}</span>
                  <span className="text-text-muted">
                    {formatSessions(sessions)}
                  </span>
                </li>
              ))}
            </ul>
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
