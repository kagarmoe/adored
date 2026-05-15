import { db } from '@/lib/db'
import { auth } from '@/auth'
import { redirect, notFound } from 'next/navigation'
import { PhotoUploader } from '@/components/operator/PhotoUploader'
import { PhotoCard } from '@/components/operator/PhotoCard'
import { NewItemUploader } from '@/components/operator/NewItemUploader'
import { assertCollectionRole } from '@/lib/authz'

type Props = { params: Promise<{ id: string }> }

export default async function UploadPage({ params }: Props) {
  const { id } = await params
  const collectionId = parseInt(id)

  const session = await auth()
  if (!session?.user?.id) redirect('/login')

  // Uploading is content management — operator-level access (curator ⊇ operator).
  try {
    await assertCollectionRole(collectionId, session.user.id, 'operator')
  } catch {
    notFound()
  }

  const collection = await db.collection.findUnique({
    where: { id: collectionId },
    include: { items: { include: { photos: true } } },
  })

  if (!collection) notFound()

  return (
    <div>
      <h1 className="font-display text-heading text-text-primary mb-8">
        Upload to {collection.name}
      </h1>

      <div className="bg-surface rounded-xl p-6 mb-8">
        <p className="font-display text-text-primary mb-1">Add a bag</p>
        <p className="font-body text-sm text-text-muted mb-4">
          Take or pick photos — we&apos;ll create the item and attach them for you.
        </p>
        <NewItemUploader collectionId={collectionId} />
      </div>

      {collection.items.length > 0 && (
        <div className="flex flex-col gap-8">
          {collection.items.map(item => (
            <div key={item.id} className="bg-surface rounded-xl p-6">
              <p className="font-display text-text-primary mb-4">Item #{item.id}</p>
              {item.photos.length > 0 && (
                <ul className="mb-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
                  {item.photos.map(photo => (
                    <li key={photo.id}>
                      <PhotoCard photo={photo} />
                    </li>
                  ))}
                </ul>
              )}
              <PhotoUploader itemId={item.id} onUploaded={() => {}} />
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
