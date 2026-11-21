import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DeleteObjectsCommand, GetObjectCommand, HeadObjectCommand, ListObjectsV2Command, PutObjectCommand } from '@aws-sdk/client-s3';

const send = vi.fn();
vi.mock('@aws-sdk/client-s3', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@aws-sdk/client-s3')>()),
  S3Client: class {
    send = send;
  },
}));

const { IMMUTABLE, R2StorageProvider } = await import('./r2');

// What /api/upload and /api/generate-image store: both go through uploadObject.

beforeAll(() => {
  vi.stubEnv('R2_ENDPOINT', 'https://r2.example');
  vi.stubEnv('R2_ACCESS_KEY_ID', 'id');
  vi.stubEnv('R2_SECRET_ACCESS_KEY', 'secret');
  vi.stubEnv('R2_BUCKET', 'bucket');
  vi.stubEnv('R2_PUBLIC_BASE', 'https://img.example/');
});

afterAll(() => {
  vi.unstubAllEnvs();
});

describe('R2StorageProvider.uploadObject', () => {
  it('stores each image under a fresh key that names no one, cacheable for good', async () => {
    send.mockResolvedValue({});
    const bytes = new Uint8Array([1, 2, 3]);
    const stored = await new R2StorageProvider().uploadObject(
      { filename: 'generated.avif', contentType: 'image/avif', size: 3, ownerId: 'alice', kind: 'image' },
      bytes,
    );

    const input = (send.mock.calls[0][0] as PutObjectCommand).input;
    expect(input).toMatchObject({ Bucket: 'bucket', ContentType: 'image/avif', ContentLength: 3, CacheControl: IMMUTABLE });
    expect(IMMUTABLE).toBe('public, max-age=31536000, immutable');
    // The key is in the picture's public URL — an anonymous card's cover too —
    // so it never carries the owner (uploads/{uuid} records whose it is).
    expect(input.Key).toMatch(/^image\/\d{4}-\d{2}\/[0-9a-f-]{36}\.avif$/);
    expect(input.Key).not.toContain('alice');
    expect(stored.publicUrl).toBe(`https://img.example/${input.Key}`);
  });
});

// What the share images (/api/og) read: an object by key through the S3 API.
describe('R2StorageProvider.getObject', () => {
  const body = (bytes: Uint8Array) => ({ transformToByteArray: async () => bytes });

  it('reads an object by key, null when there is none, and refuses one past the limit', async () => {
    const r2 = new R2StorageProvider();
    send.mockResolvedValueOnce({ Body: body(new Uint8Array([7, 8])), ContentLength: 2 });
    expect(await r2.getObject('image/alice/2026-10/a.avif', 10)).toEqual(new Uint8Array([7, 8]));
    expect((send.mock.calls.at(-1)![0] as GetObjectCommand).input).toEqual({ Bucket: 'bucket', Key: 'image/alice/2026-10/a.avif' });

    send.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'NoSuchKey' }));
    expect(await r2.getObject('image/alice/2026-10/gone.avif', 10)).toBeNull();

    send.mockResolvedValueOnce({ Body: body(new Uint8Array(11)), ContentLength: 11 });
    await expect(r2.getObject('image/alice/2026-10/big.avif', 10)).rejects.toThrow('larger than 10 bytes');
  });
});

// The account purge hands the store a person's pictures in batches (lib/account/deletion).
describe('R2StorageProvider.deleteObjects', () => {
  it('deletes a thousand keys a request, quietly, and throws when any could not be deleted', async () => {
    send.mockReset().mockResolvedValue({});
    const keys = Array.from({ length: 1_001 }, (_, i) => `image/2026-10/${i}.webp`);
    await new R2StorageProvider().deleteObjects(keys);
    const inputs = send.mock.calls.map(([c]) => (c as DeleteObjectsCommand).input);
    expect(inputs.map((i) => [i.Bucket, i.Delete?.Objects?.length, i.Delete?.Quiet])).toEqual([
      ['bucket', 1000, true],
      ['bucket', 1, true],
    ]);
    expect(inputs[1].Delete?.Objects).toEqual([{ Key: 'image/2026-10/1000.webp' }]);

    send.mockReset().mockResolvedValue({ Errors: [{ Key: 'image/2026-10/0.webp', Code: 'InternalError' }] });
    await expect(new R2StorageProvider().deleteObjects(['image/2026-10/0.webp'])).rejects.toThrow('1 of 1 objects were not deleted');
  });
});

// The storage move's checks (plan §3.8): a listing a page at a time, and an object's size and tag without its bytes.
describe('R2StorageProvider.list and head', () => {
  it('lists a prefix a thousand keys a page, handing on the continuation token, tags without quotes', async () => {
    send.mockReset().mockResolvedValueOnce({
      Contents: [{ Key: 'image/2026-11/a.webp', Size: 3, ETag: '"abc"' }, { Size: 1 }],
      IsTruncated: true,
      NextContinuationToken: 'next-page',
    });
    const r2 = new R2StorageProvider();
    expect(await r2.list('image/')).toEqual({ objects: [{ key: 'image/2026-11/a.webp', size: 3, etag: 'abc' }], cursor: 'next-page' });
    expect((send.mock.calls[0][0] as ListObjectsV2Command).input).toEqual({ Bucket: 'bucket', Prefix: 'image/', MaxKeys: 1000 });

    send.mockResolvedValueOnce({ Contents: [], IsTruncated: false });
    expect(await r2.list('image/', 'next-page')).toEqual({ objects: [], cursor: null });
    expect((send.mock.calls[1][0] as ListObjectsV2Command).input).toMatchObject({ ContinuationToken: 'next-page' });
  });

  it('heads an object, null when there is none', async () => {
    send.mockReset().mockResolvedValueOnce({ ContentLength: 12, ETag: '"d41d8"', ContentType: 'image/avif' });
    const r2 = new R2StorageProvider();
    expect(await r2.head('image/2026-11/a.avif')).toEqual({ size: 12, etag: 'd41d8', contentType: 'image/avif' });
    expect((send.mock.calls[0][0] as HeadObjectCommand).input).toEqual({ Bucket: 'bucket', Key: 'image/2026-11/a.avif' });

    send.mockRejectedValueOnce(Object.assign(new Error('nope'), { name: 'NotFound', $metadata: { httpStatusCode: 404 } }));
    expect(await r2.head('image/2026-11/gone.avif')).toBeNull();
    send.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'AccessDenied', $metadata: { httpStatusCode: 403 } }));
    await expect(r2.head('image/2026-11/x.avif')).rejects.toThrow('denied');
  });

  it('serves URLs at MEDIA_PUBLIC_BASE when it is set, before its alias R2_PUBLIC_BASE', () => {
    vi.stubEnv('MEDIA_PUBLIC_BASE', 'https://media.example/');
    expect(new R2StorageProvider().getPublicUrl('image/k.webp')).toBe('https://media.example/image/k.webp');
    vi.stubEnv('MEDIA_PUBLIC_BASE', '');
    expect(new R2StorageProvider().getPublicUrl('image/k.webp')).toBe('https://img.example/image/k.webp');
  });
});
