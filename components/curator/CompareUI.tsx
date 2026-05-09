'use client'

import { useCallback, useEffect, useMemo, useRef, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getNextPair, submitComparison } from '@/actions/ranking'
import { ComparisonTimer } from '@/components/curator/ComparisonTimer'
import { ComparisonCard } from '@/components/curator/ComparisonCard'
import { selectNextPair } from '@/lib/pairing'
import { updateElo } from '@/lib/elo'
import { appendDemoComparison, loadDemoComparisons } from '@/lib/demo-store'

export interface CompareItem {
  id: number
  brand: string
  style: string
  heroUrl: string | null
}

interface Pair {
  itemA: CompareItem
  itemB: CompareItem
}

interface Props {
  collectionId: number
  demoItems?: CompareItem[]
}

function CompareInner({ collectionId, demoItems }: Props) {
  const searchParams = useSearchParams()
  const duration = parseInt(searchParams.get('duration') ?? '300')
  const router = useRouter()

  const isDemo = !!demoItems
  const itemsRef = useRef<CompareItem[]>(demoItems ?? [])
  const ratingsRef = useRef<Map<number, number>>(new Map())

  const [pair, setPair] = useState<Pair | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)
  const [exhausted, setExhausted] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  // A ref backs the guard so synchronous double-clicks (which fire before
  // React's next render flushes `submitting` state) still take the early-return.
  const submittingRef = useRef(false)

  // Initialize demo state from localStorage on mount.
  useEffect(() => {
    if (!isDemo) return
    const items = itemsRef.current
    const ratings = new Map<number, number>(items.map(i => [i.id, 1000]))
    const comps = loadDemoComparisons(collectionId)
    for (const c of comps) {
      const winner = c.winnerId
      const loser = winner === c.itemAId ? c.itemBId : c.itemAId
      const wr = ratings.get(winner)
      const lr = ratings.get(loser)
      if (wr === undefined || lr === undefined) continue
      const { winnerNew, loserNew } = updateElo(wr, lr)
      ratings.set(winner, winnerNew)
      ratings.set(loser, loserNew)
    }
    ratingsRef.current = ratings
  }, [isDemo, collectionId])

  const loadPair = useCallback(async () => {
    setLoading(true)
    if (isDemo) {
      const items = itemsRef.current
      const comps = loadDemoComparisons(collectionId)
      const ratedItems = items.map(i => ({
        id: i.id,
        eloRating: ratingsRef.current.get(i.id) ?? 1000,
      }))
      const next = selectNextPair(ratedItems, comps)
      if (!next) {
        setPair(null)
        setExhausted(true)
      } else {
        const itemA = items.find(i => i.id === next.itemA.id)!
        const itemB = items.find(i => i.id === next.itemB.id)!
        setPair({ itemA, itemB })
      }
    } else {
      const next = await getNextPair(collectionId)
      setPair(next as Pair | null)
      if (!next) setExhausted(true)
    }
    setLoading(false)
  }, [isDemo, collectionId])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadPair()
  }, [loadPair])

  const handleExpire = useCallback(() => setDone(true), [])

  async function pick(winnerId: number) {
    if (!pair) return
    // In-flight guard: a double-click would otherwise produce two
    // submitComparison calls (duplicate DB row) or two appendDemoComparison
    // entries (corrupt localStorage history) and double-apply ELO updates.
    // The ref check catches synchronous double-clicks; the state mirror drives
    // visual disabled feedback.
    if (submittingRef.current) return
    submittingRef.current = true
    setSubmitting(true)
    try {
      if (isDemo) {
        const loserId = winnerId === pair.itemA.id ? pair.itemB.id : pair.itemA.id
        const wr = ratingsRef.current.get(winnerId) ?? 1000
        const lr = ratingsRef.current.get(loserId) ?? 1000
        const { winnerNew, loserNew } = updateElo(wr, lr)
        ratingsRef.current.set(winnerId, winnerNew)
        ratingsRef.current.set(loserId, loserNew)
        appendDemoComparison(collectionId, {
          itemAId: pair.itemA.id,
          itemBId: pair.itemB.id,
          winnerId,
        })
      } else {
        await submitComparison(
          collectionId,
          pair.itemA.id,
          pair.itemB.id,
          winnerId,
          'photo_only',
        )
      }
      await loadPair()
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const finishedCopy = useMemo(
    () =>
      isDemo
        ? 'Good session. Your rankings stay in this browser.'
        : 'Good session. Your rankings are saved.',
    [isDemo],
  )

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="font-display text-heading text-text-primary mb-3">
            That&apos;s enough for today.
          </p>
          <p className="font-body text-text-muted mb-8">{finishedCopy}</p>
          <button
            onClick={() => router.push(`/${collectionId}`)}
            className="font-display text-label uppercase tracking-widest text-accent"
          >
            See results →
          </button>
        </div>
      </div>
    )
  }

  // Defensive: a degenerate demo collection (0 or 1 items) should not even
  // attempt pair selection. The seed always inserts 20, so this is belt-and-
  // suspenders, but it produces a clearer message than "no more pairs".
  if (isDemo && (demoItems?.length ?? 0) < 2) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="font-body text-text-muted">Not enough items to rank.</p>
      </div>
    )
  }

  if (loading) return null

  if (!pair || exhausted) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <p className="font-body text-text-muted">No more pairs to compare.</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex flex-col px-4 sm:px-6 md:px-10 py-8 md:py-12">
      <ComparisonTimer durationSeconds={duration} onExpire={handleExpire} />
      <p className="font-display text-label uppercase tracking-widest text-text-muted text-center mb-8">
        Which one?
      </p>
      <div
        className="flex gap-4 sm:gap-6 md:gap-10 flex-1 max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto w-full"
        aria-busy={submitting}
      >
        <ComparisonCard
          {...pair.itemA}
          disabled={submitting}
          onPick={() => pick(pair.itemA.id)}
        />
        <ComparisonCard
          {...pair.itemB}
          disabled={submitting}
          onPick={() => pick(pair.itemB.id)}
        />
      </div>
    </div>
  )
}

export function CompareUI(props: Props) {
  return (
    <Suspense>
      <CompareInner {...props} />
    </Suspense>
  )
}
