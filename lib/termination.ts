import { computeTiers, Tier } from './elo'

const ABOVE_LINE: Tier[] = ['favorites', 'strongKeeps', 'maybeKeeps']

export interface TerminationState {
  prevFavorites: ReadonlySet<number>
  prevAboveLine: ReadonlySet<number>
  stableStreak: number
}

export interface TerminationOptions {
  stableComparisons?: number
  hardFloor?: number
}

export interface TerminationResult {
  state: TerminationState
  terminated: boolean
  stableStreak: number
}

export function initialTerminationState(): TerminationState {
  return {
    prevFavorites: new Set(),
    prevAboveLine: new Set(),
    stableStreak: 0,
  }
}

export function defaultHardFloor(itemCount: number): number {
  if (itemCount < 2) return 0
  return Math.ceil(itemCount * Math.log2(itemCount))
}

function setsEqual(a: ReadonlySet<number>, b: ReadonlySet<number>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

export function checkTermination(
  items: { id: number; eloRating: number }[],
  comparisonCount: number,
  state: TerminationState,
  options: TerminationOptions = {},
): TerminationResult {
  const stableN = options.stableComparisons ?? 10
  const hardFloor = options.hardFloor ?? defaultHardFloor(items.length)

  const tiered = computeTiers(items)
  const favorites = new Set<number>()
  const aboveLine = new Set<number>()
  for (const it of tiered) {
    if (it.tier === 'favorites') favorites.add(it.id)
    if (ABOVE_LINE.includes(it.tier)) aboveLine.add(it.id)
  }

  const isFirstObservation =
    state.prevFavorites.size === 0 && state.prevAboveLine.size === 0 && state.stableStreak === 0
  const stable = !isFirstObservation
    && setsEqual(favorites, state.prevFavorites)
    && setsEqual(aboveLine, state.prevAboveLine)

  const stableStreak = stable ? state.stableStreak + 1 : 0

  const newState: TerminationState = {
    prevFavorites: favorites,
    prevAboveLine: aboveLine,
    stableStreak,
  }

  const terminated =
    items.length >= 2 && comparisonCount >= hardFloor && stableStreak >= stableN

  return { state: newState, terminated, stableStreak }
}

export type AboveLineConfidence = 'medium' | 'low'

export interface AboveLineConfidenceOptions {
  stableComparisons?: number
  partialFraction?: number
  hardFloor?: number
}

// Confidence in the above-the-line set at session-end time.
//   'medium' — stable for at least partialFraction*N observations AND past the hard floor.
//   'low'    — anything else; the tier breakdown should not be shown to the user.
// The 'high' case (terminated == true) is handled by SortCompleteScreen, not SessionEndScreen.
export function aboveLineConfidence(
  stableStreak: number,
  comparisonCount: number,
  itemCount: number,
  options: AboveLineConfidenceOptions = {},
): AboveLineConfidence {
  const stableN = options.stableComparisons ?? 10
  const partialFraction = options.partialFraction ?? 0.5
  const hardFloor = options.hardFloor ?? defaultHardFloor(itemCount)
  const partialThreshold = Math.ceil(stableN * partialFraction)
  if (stableStreak >= partialThreshold && comparisonCount >= hardFloor) return 'medium'
  return 'low'
}
