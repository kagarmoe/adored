import { notFound } from 'next/navigation'
import { getCollection } from '@/actions/collections'
import { computeTiers } from '@/lib/elo'
import type { Tier } from '@/lib/elo'
import { TierSection } from '@/components/curator/TierSection'
import { DemoCollectionView } from '@/components/curator/DemoCollectionView'
import { displayPhotoUrl } from '@/lib/photo'
import { getDemoCollection, isDemoRequest } from '@/lib/demo-server'
import Link from 'next/link'

type Props = { params: Promise<{ id: string }> }

export default async function CollectionPage({ params }: Props) {
  const { id } = await params

  if (await isDemoRequest()) {
    const demo = await getDemoCollection()
    if (!demo || demo.id !== parseInt(id)) notFound()
    return (
      <DemoCollectionView
        collectionId={demo.id}
        collectionName={demo.name}
        items={demo.items.map(item => ({
          id: item.id,
          brand: item.brand,
          style: item.style,
          heroUrl: item.photos[0] ? displayPhotoUrl(item.photos[0]) : null,
        }))}
      />
    )
  }

  const collection = await getCollection(parseInt(id))
  if (!collection) notFound()

  const tieredItems = computeTiers(
    collection.items.map(item => ({ id: item.id, eloRating: item.eloRating }))
  ).map(tiered => {
    const item = collection.items.find(i => i.id === tiered.id)!
    return {
      ...tiered,
      brand: item.brand,
      style: item.style,
      heroUrl: item.photos[0] ? displayPhotoUrl(item.photos[0]) : null,
    }
  })

  const tiers: Tier[] = ['favorites', 'strongKeeps', 'maybeKeeps', 'belowTheLine']
  const grouped = Object.fromEntries(
    tiers.map(t => [t, tieredItems.filter(i => i.tier === t)])
  ) as Record<Tier, typeof tieredItems>

  return (
    <>
      <div className="flex items-baseline justify-between mb-10">
        <h1 className="font-display text-heading text-text-primary">
          {collection.name}
        </h1>
        <Link
          href={`/${id}/rank`}
          className="font-display text-label uppercase tracking-widest text-accent no-underline hover:opacity-75"
        >
          Sort →
        </Link>
      </div>

      {collection.items.length < 2 ? (
        <p className="font-body text-text-muted">
          Not enough items to rank yet.
        </p>
      ) : (
        tiers.map(tier => (
          <TierSection key={tier} tier={tier} items={grouped[tier] ?? []} />
        ))
      )}
    </>
  )
}
