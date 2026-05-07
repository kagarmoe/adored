import { auth } from '@/auth'
import { redirect } from 'next/navigation'
import Link from 'next/link'

export default async function OperatorLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session) redirect('/login')

  return (
    <div className="min-h-screen bg-ground">
      <header className="px-8 py-4 border-b border-surface flex items-center justify-between">
        <Link href="/dashboard" className="font-display text-lg text-text-primary no-underline">
          Purseinator
        </Link>
        <p className="font-body text-sm text-text-muted">Operator</p>
      </header>
      <main className="max-w-5xl mx-auto px-8 py-10">
        {children}
      </main>
    </div>
  )
}
