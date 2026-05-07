import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-ground">
      <header className="px-8 py-5 bg-surface flex items-baseline justify-between">
        <Link
          href="/dashboard"
          className="font-display text-text-primary no-underline"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}
        >
          Purseinator
        </Link>
        <span className="font-body text-sm italic text-text-muted">
          {session.user?.name ?? session.user?.email} · operator
        </span>
      </header>
      <main className="max-w-5xl mx-auto px-8 py-12">
        {children}
      </main>
    </div>
  )
}
