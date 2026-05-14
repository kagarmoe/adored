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
})
