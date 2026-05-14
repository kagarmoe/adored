import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect } from 'vitest'
import { AddCuratorForm } from '@/components/operator/AddCuratorForm'

describe('AddCuratorForm', () => {
  it('renders an email field and an add button', () => {
    render(<AddCuratorForm collectionId={1} onAdd={vi.fn()} />)
    expect(screen.getByLabelText(/email/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /add curator/i })).toBeInTheDocument()
  })

  it('calls onAdd with the collection id and the entered email', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddCuratorForm collectionId={7} onAdd={onAdd} />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'c@d.com' } })
    fireEvent.submit(screen.getByRole('button', { name: /add curator/i }).closest('form')!)
    await waitFor(() => expect(onAdd).toHaveBeenCalledWith(7, 'c@d.com'))
  })

  it('shows a confirmation message after adding', async () => {
    const onAdd = vi.fn().mockResolvedValue(undefined)
    render(<AddCuratorForm collectionId={7} onAdd={onAdd} />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'c@d.com' } })
    fireEvent.submit(screen.getByRole('button', { name: /add curator/i }).closest('form')!)
    await waitFor(() => expect(screen.getByText(/invited c@d\.com/i)).toBeInTheDocument())
  })

  it('does not call onAdd when the email is blank', async () => {
    const onAdd = vi.fn()
    render(<AddCuratorForm collectionId={7} onAdd={onAdd} />)
    fireEvent.submit(screen.getByRole('button', { name: /add curator/i }).closest('form')!)
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('ignores a concurrent double-submit — onAdd fires once (synchronous ref guard)', async () => {
    // A rapid double-submit fires handleSubmit twice before the state-based
    // `loading` re-render lands; without a synchronous ref guard the second
    // call proceeds and the curator gets a duplicate invite email.
    let resolveOnAdd: () => void = () => {}
    const onAdd = vi.fn().mockReturnValue(
      new Promise<void>(r => {
        resolveOnAdd = r
      }),
    )
    render(<AddCuratorForm collectionId={7} onAdd={onAdd} />)
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'c@d.com' } })
    const form = screen.getByRole('button', { name: /add curator/i }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form) // second submit before the first resolves
    expect(onAdd).toHaveBeenCalledTimes(1)
    resolveOnAdd()
    await waitFor(() => expect(screen.getByText(/invited c@d\.com/i)).toBeInTheDocument())
  })
})
