import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function CuratorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-ground">
      <header className="px-6 py-5 border-b border-surface">
        <p className="font-display text-sm text-text-muted">
          {session.user?.name ?? session.user?.email}
        </p>
      </header>
      <div className="max-w-2xl mx-auto px-6 py-10">
        {children}
      </div>
    </div>
  )
}
