import { compressImage, UnsupportedImage } from '@/lib/images/compress';
import { UPLOAD_MAX_FILE_BYTES } from '@/lib/images/limits';

export { UnsupportedImage };

/** A picture ready to send: what goes up, and its size (0 × 0 when the browser can't say: drawn square). */
export interface PreparedPicture {
  file: Blob;
  width: number;
  height: number;
}

/**
 * A picture the reader picked or pasted, made ready to send: scaled and
 * re-encoded on the device (compressImage: at most 2048 px, under the upload
 * limit, a format the server takes) — except an animated GIF under the limit,
 * which goes as it is (a canvas keeps one frame; the server keeps it moving).
 * Throws UnsupportedImage for what isn't a picture this browser can read.
 */
export async function preparePicture(file: File): Promise<PreparedPicture> {
  if (file.type && !file.type.startsWith('image/')) throw new UnsupportedImage();
  const ready = file.type === 'image/gif' && file.size <= UPLOAD_MAX_FILE_BYTES ? file : await compressImage(file);
  return { file: ready, ...(await pictureSize(ready)) };
}

async function pictureSize(blob: Blob): Promise<{ width: number; height: number }> {
  try {
    const bitmap = await createImageBitmap(blob);
    const size = { width: bitmap.width, height: bitmap.height };
    bitmap.close();
    return size;
  } catch {
    return { width: 0, height: 0 };
  }
}
