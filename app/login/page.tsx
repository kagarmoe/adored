import { LoginForm } from '@/components/LoginForm'

export const metadata = { title: 'Sign in — Purseinator' }

export default function LoginPage() {
  return (
    <main className="min-h-screen grid grid-rows-[1fr_auto] px-8 pt-12 pb-10">
      <div className="flex items-end">
        <h1
          className="font-display text-text-primary leading-none"
          style={{ fontSize: 'clamp(5rem, 20vw, 16rem)' }}
        >
          Purse-<br />inator
        </h1>
      </div>
      <div className="border-t border-text-primary/20 pt-8 max-w-xs">
        <LoginForm />
      </div>
    </main>
  )
}
