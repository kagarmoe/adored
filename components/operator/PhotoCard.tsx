'use client'

import { useState, useTransition } from 'react'
import { togglePhotoBackground } from '@/actions/photos'
import { displayPhotoUrl, hasProcessedVersion, type PhotoLike } from '@/lib/photo'

interface PhotoCardPhoto extends PhotoLike {
  id: number
}

interface Props {
  photo: PhotoCardPhoto
}

export function PhotoCard({ photo }: Props) {
  const [pending, startTransition] = useTransition()
  const [optimistic, setOptimistic] = useState(photo)
  const canToggle = hasProcessedVersion(optimistic)
  const url = displayPhotoUrl(optimistic)
  const showingOriginal = !optimistic.bgRemoved

  function onToggle() {
    setOptimistic(p => ({
      ...p,
      blobKey: p.originalBlobKey,
      originalBlobKey: p.blobKey,
      bgRemoved: !p.bgRemoved,
    }))
    startTransition(async () => {
      try {
        await togglePhotoBackground(optimistic.id)
      } catch {
        setOptimistic(p => ({
          ...p,
          blobKey: p.originalBlobKey,
          originalBlobKey: p.blobKey,
          bgRemoved: !p.bgRemoved,
        }))
      }
    })
  }

  return (
    <div className="relative aspect-square bg-surface rounded overflow-hidden group">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`/api/photos/${encodeURIComponent(url)}`}
        alt=""
        className="w-full h-full object-cover"
      />
      {canToggle && (
        <button
          type="button"
          onClick={onToggle}
          disabled={pending}
          aria-label={showingOriginal ? 'Use background-removed version' : 'Use original'}
          className="absolute bottom-1 right-1 px-2 py-1 text-xs font-display uppercase tracking-wider bg-text-primary/80 text-ground rounded disabled:opacity-50"
        >
          {showingOriginal ? 'Original' : 'No bg'}
        </button>
      )}
    </div>
  )
}
