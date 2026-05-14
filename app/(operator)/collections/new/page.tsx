import { redirect } from 'next/navigation'
import { createCollection } from '@/actions/collections'
import type { Role } from '@/lib/generated/prisma/client'

export const metadata = { title: 'New Collection — PurseInator' }

export default function NewCollectionPage() {
  async function handleCreate(formData: FormData) {
    'use server'
    const name = formData.get('name') as string
    const description = formData.get('description') as string
    const role: Role = formData.get('role') === 'curator' ? 'curator' : 'operator'
    if (!name?.trim()) return
    const collection = await createCollection(name.trim(), description?.trim() ?? '', role)
    // Operators land on the management view (where they can add a curator);
    // curators land straight in the ranking view.
    redirect(role === 'operator' ? `/collections/${collection.id}` : `/${collection.id}`)
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
        <fieldset className="flex flex-col gap-2">
          <legend className="font-display text-label uppercase tracking-widest text-text-muted mb-1">
            Your role
          </legend>
          <label className="flex items-start gap-2 font-body text-text-primary">
            <input type="radio" name="role" value="operator" defaultChecked className="mt-1 accent-accent" />
            <span>
              Operator
              <span className="block font-body text-sm text-text-muted">
                Manage the collection&apos;s photos and items. You can add a curator to do the ranking.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 font-body text-text-primary">
            <input type="radio" name="role" value="curator" className="mt-1 accent-accent" />
            <span>
              Curator
              <span className="block font-body text-sm text-text-muted">
                Manage the collection and rank its items yourself.
              </span>
            </span>
          </label>
        </fieldset>
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
