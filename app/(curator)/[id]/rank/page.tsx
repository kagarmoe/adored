'use client'

import { useState, use } from 'react'
import { useRouter } from 'next/navigation'

export default function SessionPicker({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const router = useRouter()
  const [minutes, setMinutes] = useState(5)

  function startSession() {
    router.push(`/${id}/rank/compare?duration=${minutes * 60}`)
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm text-center">
        <h1 className="font-display text-heading text-text-primary mb-4">
          How long?
        </h1>
        <p className="font-body text-text-muted mb-10">
          Pick a length that feels comfortable. Past 15 minutes it stops being useful.
        </p>

        <div className="mb-10">
          <p className="font-display text-display text-accent mb-2">{minutes}</p>
          <p className="font-body text-text-muted text-sm mb-6">minutes</p>
          <input
            type="range"
            min={1}
            max={15}
            value={minutes}
            onChange={e => setMinutes(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <div className="flex justify-between text-label text-text-muted font-display uppercase tracking-widest mt-1">
            <span>1</span>
            <span>15</span>
          </div>
        </div>

        <button
          onClick={startSession}
          className="bg-accent text-ground font-display text-label uppercase tracking-widest px-8 py-3 rounded hover:opacity-90 transition-opacity w-full"
        >
          Start sorting
        </button>
      </div>
    </div>
  )
}
