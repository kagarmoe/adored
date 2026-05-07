import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { LoginForm } from '@/components/LoginForm'

const mockSignIn = vi.fn()
vi.mock('next-auth/react', () => ({ signIn: (...args: unknown[]) => mockSignIn(...args) }))

describe('LoginForm', () => {
  beforeEach(() => {
    mockSignIn.mockResolvedValue({ ok: true })
  })

  it('renders email input and submit button', () => {
    render(<LoginForm />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /send link/i })).toBeInTheDocument()
  })

  it('button is enabled by default', () => {
    render(<LoginForm />)
    expect(screen.getByRole('button', { name: /send link/i })).not.toBeDisabled()
  })

  it('calls signIn with entered email', async () => {
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: /send link/i }).closest('form')!)
    await waitFor(() => expect(mockSignIn).toHaveBeenCalledWith('resend', {
      email: 'test@example.com',
      redirect: false,
      callbackUrl: '/',
    }))
  })

  it('shows confirmation message after submit', async () => {
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'test@example.com' } })
    fireEvent.submit(screen.getByRole('button', { name: /send link/i }).closest('form')!)
    await waitFor(() => expect(screen.getByText(/check your email/i)).toBeInTheDocument())
  })

  it('includes entered email in confirmation', async () => {
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'unique@test.io' } })
    fireEvent.submit(screen.getByRole('button', { name: /send link/i }).closest('form')!)
    await waitFor(() => expect(screen.getByText(/unique@test\.io/)).toBeInTheDocument())
  })

  it('shows "Sending…" while loading', async () => {
    let resolve!: () => void
    mockSignIn.mockReturnValue(new Promise<void>(r => { resolve = r }))
    render(<LoginForm />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } })
    fireEvent.submit(screen.getByRole('button').closest('form')!)
    expect(await screen.findByRole('button', { name: /sending/i })).toBeDisabled()
    resolve()
  })
})
