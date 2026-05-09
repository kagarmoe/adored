import { auth } from '@/auth'
import { redirect } from 'next/navigation'

export default async function CuratorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-ground">
      <header className="px-6 sm:px-8 md:px-10 py-6 bg-surface flex items-baseline gap-4 sm:gap-6 flex-wrap">
        <span
          className="font-display text-text-primary leading-none"
          style={{ fontSize: 'clamp(1.75rem, 4vw, 3rem)' }}
        >
          PurseInator
        </span>
        <span className="font-body text-sm italic text-text-muted">
          {session.user?.name ?? session.user?.email} · curator
        </span>
      </header>
      <main className="max-w-2xl md:max-w-4xl lg:max-w-5xl mx-auto px-6 sm:px-8 md:px-10 py-8 md:py-10">
        {children}
      </main>
    </div>
  )
}
