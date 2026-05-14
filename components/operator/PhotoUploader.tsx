'use client'

import { useState, useRef } from 'react'
import { uploadPhoto } from '@/actions/photos'

interface Props {
  /**
   * The item to attach photos to. Pass a number for an existing item, or a
   * resolver that creates one on demand — the resolver runs once per batch,
   * so a batch of photos lands on a single newly-created item.
   */
  itemId: number | (() => Promise<number>)
  onUploaded: () => void
}

interface Preview {
  key: string
  url: string
  status: 'processing' | 'uploading' | 'done' | 'error'
}

export function PhotoUploader({ itemId, onUploaded }: Props) {
  const [previews, setPreviews] = useState<Preview[]>([])
  const cameraRef = useRef<HTMLInputElement>(null)
  const libraryRef = useRef<HTMLInputElement>(null)

  const anyProcessing = previews.some(p => p.status === 'processing')
  const anyUploading = previews.some(p => p.status === 'uploading')
  const busy = anyProcessing || anyUploading
  const cameraLabel = anyUploading
    ? 'Uploading…'
    : anyProcessing
      ? 'Processing…'
      : 'Take photo'

  async function handleFiles(files: FileList) {
    const arr = Array.from(files)
    const queued: Preview[] = arr.map((f, i) => ({
      key: `${Date.now()}-${i}-${f.name}`,
      url: URL.createObjectURL(f),
      status: 'processing',
    }))
    setPreviews(prev => [...prev, ...queued])

    let resolvedItemId: number
    try {
      resolvedItemId = typeof itemId === 'function' ? await itemId() : itemId
    } catch {
      const queuedKeys = new Set(queued.map(q => q.key))
      setPreviews(prev =>
        prev.map(p => (queuedKeys.has(p.key) ? { ...p, status: 'error' } : p)),
      )
      return
    }

    let anySucceeded = false
    for (let i = 0; i < arr.length; i++) {
      const file = arr[i]
      const key = queued[i].key

      let processed: Blob | null = null
      try {
        const { removePhotoBackground } = await import('@/lib/bg-remove')
        processed = await removePhotoBackground(file)
      } catch {
        processed = null
      }

      setPreviews(prev =>
        prev.map(p => (p.key === key ? { ...p, status: 'uploading' } : p)),
      )

      const formData = new FormData()
      formData.append('file', file)
      if (processed) {
        const stem = file.name.replace(/\.[^.]+$/, '')
        formData.append('processed', new File([processed], `${stem}.png`, { type: 'image/png' }))
      }

      try {
        await uploadPhoto(resolvedItemId, formData)
        anySucceeded = true
        setPreviews(prev =>
          prev.map(p => (p.key === key ? { ...p, status: 'done' } : p)),
        )
      } catch {
        setPreviews(prev =>
          prev.map(p => (p.key === key ? { ...p, status: 'error' } : p)),
        )
      }
    }
    if (anySucceeded) onUploaded()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  return (
    <div onDrop={handleDrop} onDragOver={e => e.preventDefault()}>
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        className="hidden"
        data-testid="camera-input"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <input
        ref={libraryRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        data-testid="library-input"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />

      <div className="flex flex-col gap-3 sm:flex-row">
        <button
          type="button"
          onClick={() => cameraRef.current?.click()}
          disabled={busy}
          className="flex-1 bg-accent text-ground font-display text-label uppercase tracking-widest px-6 py-5 rounded-lg hover:opacity-90 transition-opacity disabled:opacity-60"
        >
          {cameraLabel}
        </button>
        <button
          type="button"
          onClick={() => libraryRef.current?.click()}
          disabled={busy}
          className="flex-1 border-2 border-text-primary/20 text-text-primary font-display text-label uppercase tracking-widest px-6 py-5 rounded-lg hover:border-accent transition-colors disabled:opacity-60"
        >
          Pick from library
        </button>
      </div>

      {previews.length > 0 && (
        <ul className="mt-5 grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6">
          {previews.map(p => (
            <li
              key={p.key}
              className="relative aspect-square bg-surface rounded overflow-hidden"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt="" className="w-full h-full object-cover" />
              {p.status === 'processing' && (
                <div className="absolute inset-0 bg-text-primary/40 flex items-center justify-center">
                  <span className="font-display text-label uppercase tracking-widest text-ground">
                    BG…
                  </span>
                </div>
              )}
              {p.status === 'uploading' && (
                <div className="absolute inset-0 bg-text-primary/40 flex items-center justify-center">
                  <span className="font-display text-label uppercase tracking-widest text-ground">
                    …
                  </span>
                </div>
              )}
              {p.status === 'error' && (
                <div className="absolute inset-0 bg-accent/70 flex items-center justify-center">
                  <span className="font-display text-label uppercase tracking-widest text-ground">
                    !
                  </span>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      <p className="hidden sm:block mt-4 font-body text-text-muted text-sm text-center">
        or drop photos here
      </p>
    </div>
  )
}
