'use client'

import { useState } from 'react'

interface Props {
  collectionId: number
  /** Server action that records the invite (and emails the curator). */
  onAdd: (collectionId: number, email: string) => Promise<void>
}

/**
 * Operator-facing "add a curator" form. Submitting an email hands off to the
 * `addCuratorByEmail` server action — the curator is invited whether or not
 * they already have an account.
 */
export function AddCuratorForm({ collectionId, onAdd }: Props) {
  const [email, setEmail] = useState('')
  const [invited, setInvited] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = email.trim()
    if (!trimmed) return
    setLoading(true)
    await onAdd(collectionId, trimmed)
    setInvited(trimmed)
    setEmail('')
    setLoading(false)
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="font-display text-label uppercase tracking-widest text-text-muted">
          Curator email
        </span>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          className="border border-surface rounded px-3 py-2 bg-ground font-body text-text-primary focus:outline-none focus:border-accent"
          placeholder="curator@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="bg-accent text-ground font-display text-label uppercase tracking-widest px-6 py-3 rounded hover:opacity-90 disabled:opacity-50 transition-opacity self-start"
      >
        {loading ? 'Adding…' : 'Add curator'}
      </button>
      {invited && (
        <p className="font-body text-sm text-text-muted">
          Invited {invited}. They&apos;ll get an email and can sign in with that address.
        </p>
      )}
    </form>
  )
}
