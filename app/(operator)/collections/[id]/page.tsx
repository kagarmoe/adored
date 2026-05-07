import { db } from '@/lib/db'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'

export const dynamic = 'force-dynamic'

type Props = { params: Promise<{ id: string }> }

export default async function CollectionPage({ params }: Props) {
  const { id } = await params
  const collectionId = parseInt(id)

  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: {
      items: {
        include: { photos: { where: { isHero: true }, take: 1 } },
        orderBy: { createdAt: 'asc' },
      },
    },
  })

  if (!collection) notFound()

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-display text-heading text-text-primary">{collection.name}</h1>
        <Link
          href={`/collections/${collectionId}/upload`}
          className="font-display text-label uppercase tracking-widest text-accent no-underline"
        >
          + Upload photos
        </Link>
      </div>
      {collection.items.length === 0 ? (
        <p className="font-body text-text-muted">
          No items yet.{' '}
          <Link href={`/collections/${collectionId}/upload`} className="text-accent">
            Upload photos to get started.
          </Link>
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {collection.items.map(item => {
            const hero = item.photos[0]
            return (
              <div key={item.id} className="bg-surface rounded-xl overflow-hidden">
                {hero ? (
                  <div className="aspect-square relative">
                    <Image
                      src={`/api/photos/${encodeURIComponent(hero.blobKey)}`}
                      alt={item.brand || 'Bag'}
                      fill
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="aspect-square bg-surface flex items-center justify-center">
                    <span className="font-body text-text-muted text-sm">No photo</span>
                  </div>
                )}
                <div className="p-3">
                  <p className="font-display text-sm text-text-primary">{item.brand || '—'}</p>
                  <p className="font-body text-xs text-text-muted">{item.style || '—'}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
