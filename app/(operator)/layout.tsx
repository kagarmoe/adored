import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-ground">
      <header className="px-4 sm:px-6 md:px-8 py-4 sm:py-5 bg-surface flex items-baseline justify-between gap-3">
        <Link
          href="/dashboard"
          className="font-display text-text-primary no-underline"
          style={{ fontSize: 'clamp(1.5rem, 3vw, 2.25rem)' }}
        >
          PurseInator
        </Link>
        <span className="font-body text-sm italic text-text-muted truncate">
          {session.user?.name ?? session.user?.email} · operator
        </span>
      </header>
      <main className="max-w-5xl mx-auto px-4 sm:px-6 md:px-8 py-6 sm:py-8 md:py-12">
        {children}
      </main>
    </div>
  )
}
