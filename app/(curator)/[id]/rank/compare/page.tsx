'use client'

import { use, useCallback, useEffect, useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { getNextPair, submitComparison } from '@/actions/ranking'
import { ComparisonTimer } from '@/components/curator/ComparisonTimer'
import { ComparisonCard } from '@/components/curator/ComparisonCard'

interface Item {
  id: number
  brand: string
  style: string
  heroUrl: string | null
}

interface Pair {
  itemA: Item
  itemB: Item
}

function CompareInner({ collectionId }: { collectionId: number }) {
  const searchParams = useSearchParams()
  const duration = parseInt(searchParams.get('duration') ?? '300')
  const router = useRouter()

  const [pair, setPair] = useState<Pair | null>(null)
  const [done, setDone] = useState(false)
  const [loading, setLoading] = useState(true)

  async function loadPair() {
    setLoading(true)
    const next = await getNextPair(collectionId)
    setPair(next as Pair | null)
    setLoading(false)
  }

  useEffect(() => { loadPair() }, [])

  const handleExpire = useCallback(() => setDone(true), [])

  async function pick(winnerId: number) {
    if (!pair) return
    await submitComparison(collectionId, pair.itemA.id, pair.itemB.id, winnerId, 'photo_only')
    await loadPair()
  }

  if (done) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6 text-center">
        <div>
          <p className="font-display text-heading text-text-primary mb-3">
            That&apos;s enough for today.
          </p>
          <p className="font-body text-text-muted mb-8">
            Good session. Your rankings are saved.
          </p>
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

  if (loading) return null

  if (!pair) {
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
      <div className="flex gap-4 sm:gap-6 md:gap-10 flex-1 max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto w-full">
        <ComparisonCard {...pair.itemA} onPick={() => pick(pair.itemA.id)} />
        <ComparisonCard {...pair.itemB} onPick={() => pick(pair.itemB.id)} />
      </div>
    </div>
  )
}

export default function ComparePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const collectionId = parseInt(id)

  return (
    <Suspense>
      <CompareInner collectionId={collectionId} />
    </Suspense>
  )
}
