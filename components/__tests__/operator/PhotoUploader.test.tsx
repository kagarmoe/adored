import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { PhotoUploader } from '@/components/operator/PhotoUploader'

const mockUploadPhoto = vi.fn()
vi.mock('@/actions/photos', () => ({ uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args) }))

function makeFile(name = 'bag.jpg', type = 'image/jpeg') {
  return new File(['data'], name, { type })
}

beforeEach(() => {
  // jsdom doesn't implement createObjectURL
  if (!('createObjectURL' in URL)) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:preview', configurable: true })
  } else {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  }
})

describe('PhotoUploader', () => {
  beforeEach(() => { mockUploadPhoto.mockResolvedValue({ id: 1, blobKey: 'url', isHero: true }) })

  it('renders Take photo and Pick from library buttons', () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pick from library/i })).toBeInTheDocument()
  })

  it('shows "Uploading…" during upload', async () => {
    let resolve!: (value?: unknown) => void
    mockUploadPhoto.mockReturnValue(new Promise(r => { resolve = r }))
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)

    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)

    expect(await screen.findByText(/uploading/i)).toBeInTheDocument()
    resolve()
  })

  it('calls uploadPhoto with correct itemId', async () => {
    render(<PhotoUploader itemId={7} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalledWith(7, expect.any(FormData)))
  })

  it('calls onUploaded after upload completes', async () => {
    const onUploaded = vi.fn()
    render(<PhotoUploader itemId={1} onUploaded={onUploaded} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce())
  })

  it('uploads multiple files sequentially', async () => {
    const onUploaded = vi.fn()
    mockUploadPhoto.mockClear()
    render(<PhotoUploader itemId={1} onUploaded={onUploaded} />)
    const files = [makeFile('a.jpg'), makeFile('b.jpg'), makeFile('c.jpg')]
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: files, configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalledTimes(3))
  })

  it('handles drop event', async () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const dropZone = screen.getByRole('button', { name: /take photo/i }).closest('div')!.parentElement!
    fireEvent.drop(dropZone, {
      dataTransfer: { files: [makeFile()] },
    })
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled())
  })

  it('camera input has capture=environment for rear-camera capture on mobile', () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const cameraInput = screen.getByTestId('camera-input')
    expect(cameraInput).toHaveAttribute('capture', 'environment')
    expect(cameraInput).toHaveAttribute('accept', 'image/*')
    expect(cameraInput).toHaveAttribute('multiple')
  })

  it('library input is image-only with no capture attribute', () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const libraryInput = screen.getByTestId('library-input')
    expect(libraryInput).toHaveAttribute('accept', 'image/*')
    expect(libraryInput).toHaveAttribute('multiple')
    expect(libraryInput).not.toHaveAttribute('capture')
  })

  it('shows preview thumbnails for queued files', async () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile('a.jpg'), makeFile('b.jpg')], configurable: true })
    fireEvent.change(input)
    await waitFor(() => {
      const imgs = document.querySelectorAll('ul li img')
      expect(imgs.length).toBe(2)
    })
  })
})
