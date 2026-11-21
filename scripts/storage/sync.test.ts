import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { memoryObjectStore } from '../../src/server/infra/memory/objects';
import { bucketFromSpec, dirBucket, storeBucket, type Bucket } from './buckets';
import { compareBuckets, copyBucket, identical, sha256Of } from './sync';

// The storage move's copy and compare (plan §3.8) on the memory store and
// folders: an idempotent copy (same size and hash: skipped), a manifest of
// streamed SHA-256s, conflicts never overwritten unasked, nothing deleted,
// and a compare that names only the missing, extra and mismatched keys.

const enc = (s: string) => new TextEncoder().encode(s);
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

let dirs: string[] = [];
const tmp = async () => {
  const d = await mkdtemp(join(tmpdir(), 'resonance-storage-'));
  dirs.push(d);
  return d;
};

beforeEach(() => {
  dirs = [];
});
afterEach(async () => {
  await Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true })));
});

async function seeded(): Promise<Bucket> {
  const store = memoryObjectStore(undefined, 2); // two keys a page: the listing pages
  await store.putObject('image/2026-10/a.webp', 'image/webp', enc('aaa'));
  await store.putObject('image/2026-11/b.webp', 'image/webp', enc('bbbb'));
  await store.putObject('image/2026-11/c-w960.webp', 'image/webp', enc('cc'));
  await store.putObject('avatar/d.webp', 'image/webp', enc('d'));
  return storeBucket('memory:public', store);
}

describe('copyBucket', () => {
  it('a dry run hashes and counts, writes nothing; --apply copies, and a second run copies nothing', async () => {
    const from = await seeded();
    const to = dirBucket(await tmp());
    const dry = await copyBucket(from, to);
    expect(dry).toMatchObject({ scanned: 4, same: 0, conflicting: [], failed: [] });
    expect(dry.copied).toHaveLength(4);
    expect((await to.list('')).objects).toEqual([]);
    expect(dry.manifest).toEqual([
      { key: 'avatar/d.webp', size: 1, sha256: sha('d') },
      { key: 'image/2026-10/a.webp', size: 3, sha256: sha('aaa') },
      { key: 'image/2026-11/b.webp', size: 4, sha256: sha('bbbb') },
      { key: 'image/2026-11/c-w960.webp', size: 2, sha256: sha('cc') },
    ]);

    const applied = await copyBucket(from, to, { apply: true });
    expect(applied.copied).toHaveLength(4);
    expect(identical(await compareBuckets(from, to))).toBe(true);
    const again = await copyBucket(from, to, { apply: true });
    expect(again).toMatchObject({ scanned: 4, same: 4, copied: [], conflicting: [] });
  });

  it('copies only under a prefix, and only what is new', async () => {
    const from = await seeded();
    const to = dirBucket(await tmp());
    expect((await copyBucket(from, to, { prefix: 'image/2026-11/', apply: true })).copied).toEqual(['image/2026-11/b.webp', 'image/2026-11/c-w960.webp']);
    expect((await copyBucket(from, to, { apply: true })).copied).toEqual(['avatar/d.webp', 'image/2026-10/a.webp']);
  });

  it('never overwrites other bytes unasked, and never deletes what only the target has', async () => {
    const from = await seeded();
    const root = await tmp();
    await mkdir(join(root, 'image/2026-10'), { recursive: true });
    await writeFile(join(root, 'image/2026-10/a.webp'), 'xyz'); // same size, other bytes
    await writeFile(join(root, 'only-here.webp'), 'kept');
    const to = dirBucket(root);
    const report = await copyBucket(from, to, { apply: true });
    expect(report.conflicting).toEqual(['image/2026-10/a.webp']);
    expect(await readFile(join(root, 'image/2026-10/a.webp'), 'utf8')).toBe('xyz');
    expect(await readFile(join(root, 'only-here.webp'), 'utf8')).toBe('kept');
    await copyBucket(from, to, { apply: true, overwrite: true });
    expect(await readFile(join(root, 'image/2026-10/a.webp'), 'utf8')).toBe('aaa');
  });

  it('copies back for a rollback: what the new bucket gained in the move returns to the old one', async () => {
    const old = await seeded();
    const fresh = dirBucket(await tmp());
    await copyBucket(old, fresh, { apply: true });
    await fresh.write('image/2026-12/during.webp', enc('new upload'), 'image/webp');
    const back = await copyBucket(fresh, old, { apply: true });
    expect(back.copied).toEqual(['image/2026-12/during.webp']);
    expect(identical(await compareBuckets(fresh, old))).toBe(true);
  });
});

describe('compareBuckets', () => {
  it('names only the missing, extra and mismatched keys — a mismatch of the same size found by its hash', async () => {
    const a = await seeded();
    const root = await tmp();
    const b = dirBucket(root);
    await copyBucket(a, b, { apply: true });
    await writeFile(join(root, 'image/2026-11/b.webp'), 'BBBB'); // same size
    await writeFile(join(root, 'avatar/d.webp'), 'dd'); // other size
    await rm(join(root, 'image/2026-10/a.webp'));
    await writeFile(join(root, 'extra.webp'), 'e');
    expect(await compareBuckets(a, b)).toEqual({
      missing: ['image/2026-10/a.webp'],
      extra: ['extra.webp'],
      mismatched: ['avatar/d.webp', 'image/2026-11/b.webp'],
      compared: 3,
    });
    // Sizes only: the same-size change goes unseen (a quick look, never the final check).
    expect((await compareBuckets(a, b, { sizesOnly: true })).mismatched).toEqual(['avatar/d.webp']);
  });

  it('hashes by streaming, not by ETag', async () => {
    const root = await tmp();
    const b = dirBucket(root);
    await b.write('k', enc('x'.repeat(100_000)), 'application/octet-stream');
    expect(await sha256Of(b, 'k')).toEqual({ sha256: sha('x'.repeat(100_000)), size: 100_000 });
    expect(await sha256Of(b, 'nope')).toBeNull();
  });
});

describe('bucketFromSpec', () => {
  it('names a folder, R2 and any S3 bucket from the environment, and refuses anything else', () => {
    expect(bucketFromSpec('dir:/tmp/x').name).toBe('dir:/tmp/x');
    const env = { R2_ENDPOINT: 'https://acct.r2.cloudflarestorage.com', R2_BUCKET: 'pub', R2_ACCESS_KEY_ID: 'k', R2_SECRET_ACCESS_KEY: 's', R2_CHAT_BUCKET: 'chat' };
    expect(bucketFromSpec('r2:public', env).name).toBe('s3:acct.r2.cloudflarestorage.com/pub');
    expect(bucketFromSpec('r2:chat', env).name).toBe('s3:acct.r2.cloudflarestorage.com/chat');
    expect(bucketFromSpec('s3:TARGET', { TARGET_ENDPOINT: 'https://s3.example.com', TARGET_BUCKET: 'copy', TARGET_ACCESS_KEY_ID: 'k', TARGET_SECRET_ACCESS_KEY: 's' }).name).toBe('s3:s3.example.com/copy');
    expect(() => bucketFromSpec('s3:TARGET', {})).toThrow(/TARGET_ENDPOINT/);
    expect(() => bucketFromSpec('gs://x', env)).toThrow(/Not a bucket/);
  });
});
