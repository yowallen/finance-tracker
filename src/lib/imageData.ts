/** Max dimension for goal thumbnails stored in Firestore. */
const MAX_EDGE = 320
/** Keep compressed payloads comfortably under Firestore's 1 MiB doc limit. */
const MAX_DATA_URL_CHARS = 700_000

/**
 * Resize + JPEG-compress a local image file into a data URL for Firestore storage.
 */
export async function fileToFirestoreImageDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose an image file.')
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.max(1, Math.round(bitmap.width * scale))
  const height = Math.max(1, Math.round(bitmap.height * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) {
    bitmap.close()
    throw new Error('Could not process this image.')
  }

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = 0.72
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_DATA_URL_CHARS && quality > 0.35) {
    quality -= 0.12
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  if (dataUrl.length > MAX_DATA_URL_CHARS) {
    throw new Error('Image is too large even after compression. Try a smaller photo.')
  }

  return dataUrl
}
