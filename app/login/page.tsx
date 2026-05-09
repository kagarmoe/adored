import { LoginForm } from '@/components/LoginForm'

export const metadata = { title: 'Sign in — PurseInator' }

export default function LoginPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-10 px-8 py-12">
      <h1
        className="font-display text-text-primary leading-none text-center"
        style={{ fontSize: 'clamp(3.5rem, 11vw, 9rem)' }}
      >
        PurseInator
      </h1>
      <div className="border-t border-text-primary/20 pt-8 w-full max-w-xs">
        <LoginForm />
      </div>
    </main>
  )
}
