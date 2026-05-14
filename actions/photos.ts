'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { assertCollectionRole } from '@/lib/authz'
import { put } from '@vercel/blob'
import { revalidatePath } from 'next/cache'

function processedFilename(originalName: string) {
  const dot = originalName.lastIndexOf('.')
  const stem = dot === -1 ? originalName : originalName.slice(0, dot)
  return `${stem}.bg-removed.png`
}

export async function uploadPhoto(itemId: number, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const file = formData.get('file') as File | null
  if (!file) throw new Error('No file provided')
  const processed = formData.get('processed') as File | null

  const item = await db.item.findUnique({ where: { id: itemId } })
  if (!item) throw new Error('Item not found')
  await assertCollectionRole(item.collectionId, session.user.id, 'operator')

  const dir = `collections/${item.collectionId}/items/${itemId}`

  const { url: originalUrl } = await put(`${dir}/${file.name}`, file, { access: 'public' })

  let blobKey = originalUrl
  let bgRemoved = false
  if (processed) {
    const { url: processedUrl } = await put(
      `${dir}/${processedFilename(file.name)}`,
      processed,
      { access: 'public' },
    )
    blobKey = processedUrl
    bgRemoved = true
  }

  const existingHero = await db.photo.findFirst({
    where: { itemId, isHero: true },
  })

  const photo = await db.photo.create({
    data: {
      itemId,
      blobKey,
      originalBlobKey: originalUrl,
      bgRemoved,
      isHero: !existingHero,
    },
  })

  revalidatePath(`/collections/${item.collectionId}`)
  revalidatePath(`/collections/${item.collectionId}/upload`)
  return photo
}

export async function togglePhotoBackground(photoId: number) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const photo = await db.photo.findUnique({
    where: { id: photoId },
    include: { item: true },
  })
  if (!photo) throw new Error('Photo not found')
  await assertCollectionRole(photo.item.collectionId, session.user.id, 'operator')

  if (photo.blobKey === photo.originalBlobKey) return

  await db.photo.update({
    where: { id: photoId },
    data: {
      blobKey: photo.originalBlobKey,
      originalBlobKey: photo.blobKey,
      bgRemoved: !photo.bgRemoved,
    },
  })

  revalidatePath(`/collections/${photo.item.collectionId}`)
  revalidatePath(`/collections/${photo.item.collectionId}/upload`)
}
