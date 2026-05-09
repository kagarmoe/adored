import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi, describe, it, expect, beforeEach } from 'vitest'
import { PhotoCard } from '@/components/operator/PhotoCard'

const mockToggle = vi.fn()
vi.mock('@/actions/photos', () => ({
  togglePhotoBackground: (...args: unknown[]) => mockToggle(...args),
}))

beforeEach(() => {
  mockToggle.mockReset()
  mockToggle.mockResolvedValue(undefined)
})

describe('PhotoCard', () => {
  it('shows the bg-removed image when bgRemoved=true', () => {
    render(
      <PhotoCard
        photo={{
          id: 1,
          blobKey: 'https://x/proc.png',
          originalBlobKey: 'https://x/orig.jpg',
          bgRemoved: true,
        }}
      />,
    )
    const img = document.querySelector('img') as HTMLImageElement
    expect(img.src).toContain(encodeURIComponent('https://x/proc.png'))
  })

  it('shows the original image when bgRemoved=false (blobKey == original)', () => {
    render(
      <PhotoCard
        photo={{
          id: 1,
          blobKey: 'https://x/orig.jpg',
          originalBlobKey: 'https://x/proc.png',
          bgRemoved: false,
        }}
      />,
    )
    const img = document.querySelector('img') as HTMLImageElement
    expect(img.src).toContain(encodeURIComponent('https://x/orig.jpg'))
  })

  it('renders no toggle when there is no processed version', () => {
    render(
      <PhotoCard
        photo={{
          id: 1,
          blobKey: 'https://x/orig.jpg',
          originalBlobKey: 'https://x/orig.jpg',
          bgRemoved: false,
        }}
      />,
    )
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders a toggle when a processed version exists', () => {
    render(
      <PhotoCard
        photo={{
          id: 1,
          blobKey: 'https://x/proc.png',
          originalBlobKey: 'https://x/orig.jpg',
          bgRemoved: true,
        }}
      />,
    )
    expect(screen.getByRole('button')).toBeInTheDocument()
  })

  it('calls togglePhotoBackground with the photo id when clicked', async () => {
    render(
      <PhotoCard
        photo={{
          id: 42,
          blobKey: 'https://x/proc.png',
          originalBlobKey: 'https://x/orig.jpg',
          bgRemoved: true,
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => expect(mockToggle).toHaveBeenCalledWith(42))
  })

  it('optimistically swaps the displayed image on click', async () => {
    render(
      <PhotoCard
        photo={{
          id: 1,
          blobKey: 'https://x/proc.png',
          originalBlobKey: 'https://x/orig.jpg',
          bgRemoved: true,
        }}
      />,
    )
    fireEvent.click(screen.getByRole('button'))
    await waitFor(() => {
      const img = document.querySelector('img') as HTMLImageElement
      expect(img.src).toContain(encodeURIComponent('https://x/orig.jpg'))
    })
  })
})
