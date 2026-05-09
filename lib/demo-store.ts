/**
 * Client-side per-session ranking store for the PurseInator demo.
 *
 * Persists comparisons in localStorage, keyed by collection id, so the demo's
 * tiering & next-pair logic can run without any DB writes. Only used when the
 * page is loaded on the demo host (see `isDemoHost` / proxy.ts).
 */
export interface DemoComparison {
  itemAId: number
  itemBId: number
  winnerId: number
}

const KEY_PREFIX = 'purseinator-demo:rankings:v1:'

function storageKey(collectionId: number): string {
  return `${KEY_PREFIX}${collectionId}`
}

function safeStorage(): Storage | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage
  } catch {
    return null
  }
}

export function loadDemoComparisons(collectionId: number): DemoComparison[] {
  const ls = safeStorage()
  if (!ls) return []
  const raw = ls.getItem(storageKey(collectionId))
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (c): c is DemoComparison =>
        typeof c?.itemAId === 'number' &&
        typeof c?.itemBId === 'number' &&
        typeof c?.winnerId === 'number',
    )
  } catch {
    return []
  }
}

export function appendDemoComparison(collectionId: number, c: DemoComparison): DemoComparison[] {
  const ls = safeStorage()
  const existing = loadDemoComparisons(collectionId)
  const next = [...existing, c]
  if (ls) ls.setItem(storageKey(collectionId), JSON.stringify(next))
  return next
}

export function clearDemoComparisons(collectionId: number): void {
  const ls = safeStorage()
  if (ls) ls.removeItem(storageKey(collectionId))
}
