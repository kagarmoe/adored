import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { PhotoUploader } from '@/components/operator/PhotoUploader'

const mockUploadPhoto = vi.fn()
vi.mock('@/actions/photos', () => ({ uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args) }))

function makeFile(name = 'bag.jpg', type = 'image/jpeg') {
  return new File(['data'], name, { type })
}

describe('PhotoUploader', () => {
  beforeEach(() => { mockUploadPhoto.mockResolvedValue({ id: 1, blobKey: 'url', isHero: true }) })

  it('renders drop zone text', () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    expect(screen.getByText(/drop photos here or click to browse/i)).toBeInTheDocument()
  })

  it('shows "Uploading…" during upload', async () => {
    let resolve!: () => void
    mockUploadPhoto.mockReturnValue(new Promise(r => { resolve = r }))
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)

    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)

    expect(await screen.findByText(/uploading/i)).toBeInTheDocument()
    resolve()
  })

  it('calls uploadPhoto with correct itemId', async () => {
    render(<PhotoUploader itemId={7} onUploaded={vi.fn()} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalledWith(7, expect.any(FormData)))
  })

  it('calls onUploaded after upload completes', async () => {
    const onUploaded = vi.fn()
    render(<PhotoUploader itemId={1} onUploaded={onUploaded} />)
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce())
  })

  it('uploads multiple files sequentially', async () => {
    const onUploaded = vi.fn()
    mockUploadPhoto.mockClear()
    render(<PhotoUploader itemId={1} onUploaded={onUploaded} />)
    const files = [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]
    const input = document.querySelector('input[type="file"]') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalledTimes(3))
  })

  it('handles drop event', async () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const dropZone = screen.getByText(/drop photos/i).closest('div')!
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [makeFile()] },
    })
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled())
  })

  it('has hidden file input accepting images', () => {
    const { container } = render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const input = container.querySelector('input[type="file"]')
    expect(input).toHaveAttribute('accept', 'image/*')
    expect(input).toHaveAttribute('multiple')
  })
})
