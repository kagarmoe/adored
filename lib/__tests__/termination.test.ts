import { describe, it, expect } from 'vitest'
import {
  checkTermination,
  defaultHardFloor,
  initialTerminationState,
} from '@/lib/termination'

const mkItems = (n: number, ratings?: number[]) =>
  Array.from({ length: n }, (_, i) => ({
    id: i + 1,
    eloRating: ratings?.[i] ?? 1000 - i * 10,
  }))

function runStableStreak(
  items: { id: number; eloRating: number }[],
  count: number,
  startCompCount: number,
  options?: { stableComparisons?: number; hardFloor?: number },
) {
  let state = initialTerminationState()
  let last = { state, terminated: false, stableStreak: 0 }
  for (let i = 0; i < count; i++) {
    last = checkTermination(items, startCompCount + i, state, options)
    state = last.state
  }
  return last
}

describe('defaultHardFloor', () => {
  it('returns 0 for fewer than 2 items', () => {
    expect(defaultHardFloor(0)).toBe(0)
    expect(defaultHardFloor(1)).toBe(0)
  })

  it('scales as n*log2(n)', () => {
    expect(defaultHardFloor(8)).toBe(Math.ceil(8 * 3))
    expect(defaultHardFloor(20)).toBe(Math.ceil(20 * Math.log2(20)))
  })
})

describe('checkTermination', () => {
  it('does not terminate before the hard floor', () => {
    const items = mkItems(20)
    const result = runStableStreak(items, 50, 0, { stableComparisons: 3, hardFloor: 1000 })
    expect(result.terminated).toBe(false)
  })

  it('does not terminate before reaching the stable streak length', () => {
    const items = mkItems(20)
    const result = runStableStreak(items, 5, 1000, { stableComparisons: 10, hardFloor: 0 })
    expect(result.terminated).toBe(false)
  })

  it('terminates when both hard floor and stable streak are met', () => {
    const items = mkItems(20)
    const result = runStableStreak(items, 11, 1000, { stableComparisons: 10, hardFloor: 0 })
    expect(result.terminated).toBe(true)
  })

  it('first observation never counts as stable', () => {
    const items = mkItems(20)
    const r = checkTermination(items, 1000, initialTerminationState(), {
      stableComparisons: 1,
      hardFloor: 0,
    })
    expect(r.stableStreak).toBe(0)
    expect(r.terminated).toBe(false)
  })

  it('resets stable streak when favorites set changes', () => {
    const itemsA = mkItems(20)
    let state = initialTerminationState()
    // Build a streak.
    for (let i = 0; i < 5; i++) {
      const r = checkTermination(itemsA, 1000 + i, state, { stableComparisons: 100, hardFloor: 0 })
      state = r.state
    }
    expect(state.stableStreak).toBe(4) // 5 calls, first doesn't count
    // Now swap the top item to change the favorites set.
    const itemsB = itemsA.map(i => (i.id === 1 ? { ...i, eloRating: 0 } : i))
    const r = checkTermination(itemsB, 2000, state, { stableComparisons: 100, hardFloor: 0 })
    expect(r.stableStreak).toBe(0)
  })

  it('resets when only the above-the-line set changes', () => {
    // 20 items: top 25% (5) is favorites; above-the-line (favorites+strongKeeps+maybeKeeps) is the top 45% (9).
    // We'll swap an item between maybeKeeps and belowTheLine so favorites is unchanged but aboveLine changes.
    const items = mkItems(20)
    let state = initialTerminationState()
    for (let i = 0; i < 5; i++) {
      const r = checkTermination(items, 1000 + i, state, { stableComparisons: 100, hardFloor: 0 })
      state = r.state
    }
    expect(state.stableStreak).toBe(4)
    // Item at position 8 (id 9) is currently maybeKeeps; item at 9 (id 10) is belowTheLine.
    // Swap their ratings to flip them.
    const swapped = items.map(i => {
      if (i.id === 9) return { ...i, eloRating: items.find(x => x.id === 10)!.eloRating }
      if (i.id === 10) return { ...i, eloRating: items.find(x => x.id === 9)!.eloRating }
      return i
    })
    const r = checkTermination(swapped, 2000, state, { stableComparisons: 100, hardFloor: 0 })
    expect(r.stableStreak).toBe(0)
  })

  it('does not terminate when items.length < 2', () => {
    const r = checkTermination([], 9999, initialTerminationState(), {
      stableComparisons: 0,
      hardFloor: 0,
    })
    expect(r.terminated).toBe(false)
  })

  it('uses default hard floor of n*log2(n) when not provided', () => {
    const items = mkItems(8) // hardFloor = 24
    // With stableComparisons=2 and only 10 comparisons, hard floor (24) blocks termination.
    const r = runStableStreak(items, 5, 10, { stableComparisons: 2 })
    expect(r.terminated).toBe(false)
    // With 100 comparisons (well above 24) and 5 stable observations, terminates.
    const r2 = runStableStreak(items, 5, 100, { stableComparisons: 2 })
    expect(r2.terminated).toBe(true)
  })
})
