'use client'

import { useRouter } from 'next/navigation'
import { PhotoUploader } from './PhotoUploader'
import { createItem } from '@/actions/items'

interface Props {
  collectionId: number
}

/**
 * One-step "add a bag" uploader for a collection. Picking photos creates a new
 * item in the collection and uploads the batch to it — no separate "add item"
 * click required. The whole batch lands on a single item.
 */
export function NewItemUploader({ collectionId }: Props) {
  const router = useRouter()

  return (
    <PhotoUploader
      itemId={async () => {
        const item = await createItem(collectionId, {})
        return item.id
      }}
      onUploaded={() => router.refresh()}
    />
  )
}
