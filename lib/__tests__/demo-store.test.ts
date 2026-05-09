import { describe, it, expect, beforeEach } from 'vitest'
import {
  loadDemoComparisons,
  appendDemoComparison,
  clearDemoComparisons,
} from '@/lib/demo-store'

describe('demo-store', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })

  it('returns [] when no rankings stored', () => {
    expect(loadDemoComparisons(1)).toEqual([])
  })

  it('round-trips appended comparisons', () => {
    appendDemoComparison(7, { itemAId: 1, itemBId: 2, winnerId: 1 })
    appendDemoComparison(7, { itemAId: 1, itemBId: 3, winnerId: 3 })
    expect(loadDemoComparisons(7)).toEqual([
      { itemAId: 1, itemBId: 2, winnerId: 1 },
      { itemAId: 1, itemBId: 3, winnerId: 3 },
    ])
  })

  it('keeps comparisons separated per collection', () => {
    appendDemoComparison(1, { itemAId: 1, itemBId: 2, winnerId: 1 })
    appendDemoComparison(2, { itemAId: 5, itemBId: 6, winnerId: 6 })
    expect(loadDemoComparisons(1)).toHaveLength(1)
    expect(loadDemoComparisons(2)).toHaveLength(1)
    expect(loadDemoComparisons(2)[0].winnerId).toBe(6)
  })

  it('clears comparisons for a single collection', () => {
    appendDemoComparison(3, { itemAId: 1, itemBId: 2, winnerId: 2 })
    appendDemoComparison(4, { itemAId: 1, itemBId: 2, winnerId: 1 })
    clearDemoComparisons(3)
    expect(loadDemoComparisons(3)).toEqual([])
    expect(loadDemoComparisons(4)).toHaveLength(1)
  })

  it('ignores corrupt JSON gracefully', () => {
    window.localStorage.setItem('purseinator-demo:rankings:v1:99', 'not-json{')
    expect(loadDemoComparisons(99)).toEqual([])
  })

  it('filters non-numeric entries', () => {
    window.localStorage.setItem(
      'purseinator-demo:rankings:v1:5',
      JSON.stringify([
        { itemAId: 1, itemBId: 2, winnerId: 2 },
        { itemAId: 'x', itemBId: 3, winnerId: 3 },
      ]),
    )
    expect(loadDemoComparisons(5)).toEqual([{ itemAId: 1, itemBId: 2, winnerId: 2 }])
  })
})
