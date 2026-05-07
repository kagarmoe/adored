'use client'

import { signIn } from 'next-auth/react'
import { useState } from 'react'

export function LoginForm() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    await signIn('resend', { email, redirect: false })
    setSent(true)
    setLoading(false)
  }

  if (sent) {
    return (
      <div className="text-center">
        <p className="font-display text-xl text-text-primary mb-2">
          Check your email
        </p>
        <p className="font-body text-text-muted text-sm">
          We sent a link to {email}. It expires in 15 minutes.
        </p>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1">
        <span className="font-display text-label uppercase tracking-widest text-text-muted">
          Email
        </span>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          className="border border-surface rounded px-3 py-2 bg-ground font-body text-text-primary focus:outline-none focus:border-accent"
          placeholder="you@example.com"
        />
      </label>
      <button
        type="submit"
        disabled={loading}
        className="bg-accent text-cream font-display text-label uppercase tracking-widest px-6 py-3 rounded hover:opacity-90 disabled:opacity-50 transition-opacity"
      >
        {loading ? 'Sending…' : 'Send link'}
      </button>
    </form>
  )
}
