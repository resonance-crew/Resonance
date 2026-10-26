import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { convertToAvif, normalizeUpload, normalizeUploadWithThumb, UnsupportedImage } from './image';

describe('convertToAvif', () => {
  it('should convert a PNG buffer to an AVIF buffer', async () => {
    // Generate a 10x10 red PNG image buffer
    const pngBuffer = await sharp({
      create: {
        width: 10,
        height: 10,
        channels: 3,
        background: { r: 255, g: 0, b: 0 }
      }
    })
    .png()
    .toBuffer();

    // Convert to AVIF
    const avifBuffer = await convertToAvif(pngBuffer);

    // Verify it is a valid buffer and contains the ftypavif magic bytes
    expect(avifBuffer).toBeInstanceOf(Buffer);
    expect(avifBuffer.length).toBeGreaterThan(0);

    // AVIF container files have 'ftypavif' signature starting at offset 4
    const signature = avifBuffer.toString('ascii', 4, 12);
    expect(signature).toBe('ftypavif');
  });
});

// A chat picture in its two sizes (lib/api/v1/chatImageUpload), from one opening of the upload.
describe('normalizeUploadWithThumb', () => {
  const photo = () =>
    sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 200, g: 120, b: 80 } } })
      .jpeg()
      .withMetadata({ orientation: 6, exif: { IFD0: { Make: 'PhoneMaker' } } })
      .toBuffer();

  it('answers the kept size exactly as normalizeUpload does, and the thread’s size from the upload itself', async () => {
    const input = new Uint8Array(await photo());
    const { full, thumb } = await normalizeUploadWithThumb(input);
    const alone = await normalizeUpload(input, 'image');
    expect([full.width, full.height, full.animated, full.contentType]).toEqual([alone.width, alone.height, false, 'image/webp']);
    expect(full.data.equals(alone.data)).toBe(true);
    // Upright (a quarter turn), fitted into 960; no metadata on either.
    expect([thumb.width, thumb.height]).toEqual([640, 960]);
    for (const out of [full, thumb]) {
      const meta = await sharp(out.data).metadata();
      expect([meta.format, meta.exif, meta.orientation]).toEqual(['webp', undefined, undefined]);
    }
  });

  it('keeps an animation animated in both sizes', async () => {
    const frame = (r: number) => sharp({ create: { width: 1200, height: 800, channels: 4, background: { r, g: 0, b: 0, alpha: 1 } } }).png().toBuffer();
    const gif = await sharp([await frame(255), await frame(0)], { join: { animated: true } }).gif().toBuffer();
    const { full, thumb } = await normalizeUploadWithThumb(new Uint8Array(gif));
    expect([full.animated, full.width, full.height]).toEqual([true, 1200, 800]);
    expect([thumb.animated, thumb.width, thumb.height]).toEqual([true, 960, 640]);
    expect((await sharp(thumb.data, { animated: true }).metadata()).pages).toBe(2);
  });

  it('refuses what is not a picture we take, and a decompression bomb', async () => {
    await expect(normalizeUploadWithThumb(new TextEncoder().encode('<svg></svg>'))).rejects.toBeInstanceOf(UnsupportedImage);
    const bomb = await sharp({ create: { width: 10_000, height: 8_000, channels: 3, background: '#fff' } }).png({ compressionLevel: 9 }).toBuffer();
    await expect(normalizeUploadWithThumb(new Uint8Array(bomb))).rejects.toBeInstanceOf(UnsupportedImage);
  });
});
