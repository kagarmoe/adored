import { LoginForm } from '@/components/LoginForm'

export const metadata = { title: 'Sign in — Purseinator' }

export default function LoginPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="w-full max-w-sm">
        <h1 className="font-display text-heading text-text-primary mb-8">
          Purseinator
        </h1>
        <LoginForm />
      </div>
    </main>
  )
}
