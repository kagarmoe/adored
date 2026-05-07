'use server'

import { auth } from '@/auth'
import { db } from '@/lib/db'
import { put } from '@vercel/blob'
import { revalidatePath } from 'next/cache'

export async function uploadPhoto(itemId: number, formData: FormData) {
  const session = await auth()
  if (!session?.user?.id) throw new Error('Unauthorized')

  const file = formData.get('file') as File
  if (!file) throw new Error('No file provided')

  const item = await db.item.findUnique({ where: { id: itemId } })
  if (!item) throw new Error('Item not found')

  const { url } = await put(
    `collections/${item.collectionId}/items/${itemId}/${file.name}`,
    file,
    { access: 'public' }
  )

  const existingHero = await db.photo.findFirst({
    where: { itemId, isHero: true },
  })

  const photo = await db.photo.create({
    data: {
      itemId,
      blobKey: url,
      isHero: !existingHero,
    },
  })

  revalidatePath(`/collections/${item.collectionId}`)
  revalidatePath(`/collections/${item.collectionId}/upload`)
  return photo
}
