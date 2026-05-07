'use client'

import { useState, useRef } from 'react'
import { uploadPhoto } from '@/actions/photos'

interface Props {
  itemId: number
  onUploaded: () => void
}

export function PhotoUploader({ itemId, onUploaded }: Props) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleFiles(files: FileList) {
    setUploading(true)
    for (const file of Array.from(files)) {
      const formData = new FormData()
      formData.append('file', file)
      await uploadPhoto(itemId, formData)
    }
    setUploading(false)
    onUploaded()
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files)
  }

  return (
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-surface rounded-xl p-10 text-center cursor-pointer hover:border-accent transition-colors"
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => e.target.files && handleFiles(e.target.files)}
      />
      <p className="font-display text-text-muted">
        {uploading ? 'Uploading…' : 'Drop photos here or click to browse'}
      </p>
    </div>
  )
}
