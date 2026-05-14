import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { NewItemUploader } from '@/components/operator/NewItemUploader'

const mockCreateItem = vi.fn()
vi.mock('@/actions/items', () => ({ createItem: (...args: unknown[]) => mockCreateItem(...args) }))

const mockUploadPhoto = vi.fn()
vi.mock('@/actions/photos', () => ({ uploadPhoto: (...args: unknown[]) => mockUploadPhoto(...args) }))

const mockRemovePhotoBackground = vi.fn()
vi.mock('@/lib/bg-remove', () => ({
  removePhotoBackground: (...args: unknown[]) => mockRemovePhotoBackground(...args),
}))

const mockRefresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: mockRefresh }) }))

function makeFile(name = 'bag.jpg', type = 'image/jpeg') {
  return new File(['data'], name, { type })
}

beforeEach(() => {
  if (!('createObjectURL' in URL)) {
    Object.defineProperty(URL, 'createObjectURL', { value: () => 'blob:preview', configurable: true })
  } else {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:preview')
  }
  mockCreateItem.mockReset().mockResolvedValue({ id: 99, collectionId: 3 })
  mockUploadPhoto.mockReset().mockResolvedValue({ id: 1 })
  mockRemovePhotoBackground.mockReset().mockResolvedValue(new Blob(['png'], { type: 'image/png' }))
  mockRefresh.mockReset()
})

describe('NewItemUploader', () => {
  it('renders prominent Take photo / Pick from library buttons', () => {
    render(<NewItemUploader collectionId={3} />)
    expect(screen.getByRole('button', { name: /take photo/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /pick from library/i })).toBeInTheDocument()
  })

  it('creates an item in the collection then uploads the selected photo to it', async () => {
    render(<NewItemUploader collectionId={3} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)

    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalled())
    expect(mockCreateItem).toHaveBeenCalledWith(3, {})
    expect(mockUploadPhoto).toHaveBeenCalledWith(99, expect.any(FormData))
  })

  it('creates only one item for a multi-photo batch', async () => {
    render(<NewItemUploader collectionId={3} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', {
      value: [makeFile('a.jpg'), makeFile('b.jpg')],
      configurable: true,
    })
    fireEvent.change(input)

    await waitFor(() => expect(mockUploadPhoto).toHaveBeenCalledTimes(2))
    expect(mockCreateItem).toHaveBeenCalledTimes(1)
  })

  it('refreshes the page after a successful upload', async () => {
    render(<NewItemUploader collectionId={3} />)
    const input = screen.getByTestId('library-input') as HTMLInputElement
    Object.defineProperty(input, 'files', { value: [makeFile()], configurable: true })
    fireEvent.change(input)

    await waitFor(() => expect(mockRefresh).toHaveBeenCalled())
  })
})
