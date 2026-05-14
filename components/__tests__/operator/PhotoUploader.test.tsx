import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { PhotoUploader } from '@/components/operator/PhotoUploader'

const mockUploadPhoto = vi.fn()
vi.mock('@/actions/photos', () => ({ uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args) }))

const mockRemovePhotoBackground = vi.fn()
vi.mock('@/lib/bg-remove', () => ({
  removePhotoBackground: (...args: unknown[]) => mockRemovePhotoBackground(...args),
}))

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
  beforeEach(() => {
    mockUploadPhoto.mockReset()
    mockUploadPhoto.mockResolvedValue({ id: 1, blobKey: 'url', isHero: true })
    mockRemovePhotoBackground.mockReset()
    mockRemovePhotoBackground.mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  })

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

  it('runs background removal on the selected file before upload', async () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockRemovePhotoBackground).toHaveBeenCalledTimes(1))
  })

  it('appends a "processed" PNG to FormData when bg removal succeeds', async () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile('bag.jpg')], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled())
    const fd = mockUploadPhoto.mock.calls[0][1] as FormData
    const processed = fd.get('processed') as File | null
    expect(processed).toBeInstanceOf(File)
    expect(processed?.type).toBe('image/png')
    expect(processed?.name).toMatch(/\.png$/)
  })

  it('falls back to upload-without-processed when bg removal throws', async () => {
    mockRemovePhotoBackground.mockRejectedValue(new Error('lib failed'))
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled())
    const fd = mockUploadPhoto.mock.calls[0][1] as FormData
    expect(fd.get('processed')).toBeNull()
    expect(fd.get('file')).toBeInstanceOf(File)
  })

  it('shows "Processing…" while bg-removal is in flight (before upload)', async () => {
    let resolveBg!: (value: Blob) => void
    mockRemovePhotoBackground.mockReturnValue(new Promise<Blob>(r => { resolveBg = r }))
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    expect(await screen.findByRole('button', { name: /processing/i })).toBeInTheDocument()
    resolveBg(new Blob(['png'], { type: 'image/png' }))
  })

  it('does not call onUploaded if every file fails to upload', async () => {
    const onUploaded = vi.fn()
    mockUploadPhoto.mockRejectedValue(new Error('upload failed'))
    render(<PhotoUploader itemId={1} onUploaded={onUploaded} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile('a.jpg'), makeFile('b.jpg')], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalledTimes(2))
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('calls onUploaded if at least one file succeeds (mixed)', async () => {
    const onUploaded = vi.fn()
    mockUploadPhoto
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ id: 1 })
    render(<PhotoUploader itemId={1} onUploaded={onUploaded} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile('a.jpg'), makeFile('b.jpg')], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(onUploaded).toHaveBeenCalledOnce())
  })

  it('resolves a function itemId once per batch and uploads to the resolved id', async () => {
    const resolveItemId = vi.fn().mockResolvedValue(42)
    render(<PhotoUploader itemId={resolveItemId} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', {
      value: [makeFile('a.jpg'), makeFile('b.jpg')],
      configurable: true,
    })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalledTimes(2))
    expect(resolveItemId).toHaveBeenCalledTimes(1)
    expect(mockUploadPhoto).toHaveBeenCalledWith(42, expect.any(FormData))
  })

  it('marks files as errored and skips upload when the itemId resolver throws', async () => {
    const resolveItemId = vi.fn().mockRejectedValue(new Error('create failed'))
    render(<PhotoUploader itemId={resolveItemId} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(resolveItemId).toHaveBeenCalled())
    expect(mockUploadPhoto).not.toHaveBeenCalled()
    await waitFor(() => {
      expect(document.querySelector('ul li .bg-accent\\/70')).toBeTruthy()
    })
  })

  it('always sends the original file under "file"', async () => {
    render(<PhotoUploader itemId={1} onUploaded={vi.fn()} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile('original.jpg')], configurable: true })
    fireEvent.change(input)
    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled())
    const fd = mockUploadPhoto.mock.calls[0][1] as FormData
    const file = fd.get('file') as File
    expect(file.name).toBe('original.jpg')
    expect(file.type).toBe('image/jpeg')
  })
})
