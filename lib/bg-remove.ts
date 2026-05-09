import { removeBackground } from '@imgly/background-removal'

export const MAX_DIMENSION = 2048

async function getDimensions(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap !== 'function') return null
  try {
    const bitmap = await createImageBitmap(file)
    const dims = { width: bitmap.width, height: bitmap.height }
    bitmap.close?.()
    return dims
  } catch {
    return null
  }
}

export async function downscaleImage(file: File, max = MAX_DIMENSION): Promise<File> {
  const dims = await getDimensions(file)
  if (!dims) return file
  const { width, height } = dims
  const longest = Math.max(width, height)
  if (longest <= max) return file

  const scale = max / longest
  const w = Math.round(width * scale)
  const h = Math.round(height * scale)

  const bitmap = await createImageBitmap(file)
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h })
  const ctx = (canvas as HTMLCanvasElement | OffscreenCanvas).getContext('2d') as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null
  if (!ctx) return file
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close?.()

  const blob =
    canvas instanceof OffscreenCanvas
      ? await canvas.convertToBlob({ type: file.type || 'image/jpeg', quality: 0.92 })
      : await new Promise<Blob>((resolve, reject) =>
          (canvas as HTMLCanvasElement).toBlob(
            b => (b ? resolve(b) : reject(new Error('toBlob failed'))),
            file.type || 'image/jpeg',
            0.92,
          ),
        )

  return new File([blob], file.name, { type: blob.type })
}

export async function removePhotoBackground(file: File): Promise<Blob> {
  const source = await downscaleImage(file)
  return removeBackground(source, {
    output: { format: 'image/png' },
  })
}
