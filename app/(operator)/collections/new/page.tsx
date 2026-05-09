import { redirect } from 'next/navigation'
import { createCollection } from '@/actions/collections'

export const metadata = { title: 'New Collection — PurseInator' }

export default function NewCollectionPage() {
  async function handleCreate(formData: FormData) {
    'use server'
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    if (!name?.trim()) return
    await createCollection(name.trim(), description?.trim() ?? '')
    redirect('/dashboard')
  }

  return (
    <div className="max-w-md">
      <h1 className="font-display text-heading text-text-primary mb-8">New collection</h1>
      <form action={handleCreate} className="flex flex-col gap-6">
        <label className="flex flex-col gap-1">
          <span className="font-display text-label uppercase tracking-widest text-text-muted">Name</span>
          <input
            name="name"
            type="text"
            required
            autoFocus
            className="border border-surface rounded px-3 py-2 bg-ground font-body text-text-primary focus:outline-none focus:border-accent"
            placeholder="e.g. Spring 2026 edit"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="font-display text-label uppercase tracking-widest text-text-muted">Description</span>
          <textarea
            name="description"
            rows={3}
            className="border border-surface rounded px-3 py-2 bg-ground font-body text-text-primary focus:outline-none focus:border-accent resize-none"
            placeholder="Optional notes"
          />
        </label>
        <button
          type="submit"
          className="bg-accent text-ground font-display text-label uppercase tracking-widest px-6 py-3 rounded hover:opacity-90 transition-opacity self-start"
        >
          Create
        </button>
      </form>
    </div>
  )
}
