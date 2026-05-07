import { db } from '@/lib/db'
import { notFound } from 'next/navigation'
import { PhotoUploader } from '@/components/operator/PhotoUploader'
import { createItem } from '@/actions/items'

type Props = { params: Promise<{ id: string }> }

export default async function UploadPage({ params }: Props) {
  const { id } = await params
  const collectionId = parseInt(id)

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
      <form action={async () => {
        'use server'
        await createItem(collectionId, {})
      }}>
        <button
          type="submit"
          className="font-display text-label uppercase tracking-widest text-accent mb-8 block"
        >
          + Add item
        </button>
      </form>
      <div className="flex flex-col gap-8">
        {collection.items.map(item => (
          <div key={item.id} className="bg-surface rounded-xl p-6">
            <p className="font-display text-text-primary mb-4">
              Item #{item.id}
            </p>
            <PhotoUploader itemId={item.id} onUploaded={() => {}} />
          </div>
        ))}
      </div>
    </div>
  )
}
