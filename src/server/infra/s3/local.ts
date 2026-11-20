import { createHash } from 'node:crypto';
import { copyFile, mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { IStorageProvider } from '@/lib/storage/interfaces';
import { currentPublicBaseSetting } from '@/lib/storage/publicUrl';
import type { StoredObject, UploadIntent } from '@/lib/storage/types';
import type { ObjectHead, ObjectListing, PrivateObjectStore } from '@/server/ports/objects';
import { objectKey, PAGE_KEYS } from './keys';

// The buckets' stand-ins against the emulators: folders on this machine.
// src/lib/storage/local and chatImages re-export them.

/** This server runs against the Firebase emulators (`npm run dev:emulator`, the emulator test suites). */
export const againstEmulators = () =>
  !!process.env.FIRESTORE_EMULATOR_HOST || process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';

/** The path the dev server serves the stand-in's pictures under (`src/app/api/emulator-storage`). */
export const LOCAL_STORAGE_PATH = '/api/emulator-storage';

/** The folder standing in for the bucket: EMULATOR_STORAGE_DIR, else one in the temp dir. */
export const localStorageRoot = () =>
  process.env.EMULATOR_STORAGE_DIR || join(tmpdir(), 'resonance-emulator-storage');

const TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
};

/** The type a stored key is served as, by its extension (the encoder chose it); null for one we never store. */
export const localContentType = (key: string): string | null => TYPES[extname(key).toLowerCase()] ?? null;

/** Every file under `root`, as keys (`/`-separated), sorted; none when the folder isn't there. */
async function keysUnder(root: string): Promise<string[]> {
  let entries;
  try {
    entries = await readdir(root, { recursive: true, withFileTypes: true });
  } catch (e) {
    if ((e as { code?: string }).code === 'ENOENT') return [];
    throw e;
  }
  return entries
    .filter((entry) => entry.isFile())
    .map((entry) => relative(root, join(entry.parentPath, entry.name)).split(sep).join('/'))
    .sort();
}

/**
 * Against the emulators, covers, avatars and story pictures go to a folder on
 * this machine instead of R2 — nothing real is touched — and the dev server
 * serves them at R2_PUBLIC_BASE (`npm run dev:emulator` sets it to
 * `http://localhost:<port>/api/emulator-storage`), so every check that asks
 * "is this a picture we stored" (`publicBases`) holds as in production.
 */
export class LocalStorageProvider implements IStorageProvider {
  private readonly publicBase: string;

  constructor(
    private readonly root: string = localStorageRoot(),
    publicBase: string | undefined = currentPublicBaseSetting(),
    /** How many keys a listing page holds (tests make it small). */
    private readonly pageKeys: number = PAGE_KEYS,
  ) {
    if (!publicBase) throw new Error('R2_PUBLIC_BASE is required for the emulators’ storage (npm run dev:emulator sets it)');
    this.publicBase = publicBase.replace(/\/+$/, '');
  }

  private path(key: string): string {
    const path = resolve(this.root, key);
    // A key is ours (objectKey), but nothing outside the folder is ever touched whatever it says.
    if (!path.startsWith(resolve(this.root) + sep)) throw new Error(`Not a storage key: ${key}`);
    return path;
  }

  async uploadObject(intent: UploadIntent, body: Uint8Array): Promise<StoredObject> {
    return this.putObject(objectKey(intent), intent.contentType, body);
  }

  async putObject(key: string, _contentType: string, body: Uint8Array): Promise<StoredObject> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, publicUrl: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async getObject(key: string, maxBytes: number): Promise<Uint8Array | null> {
    let bytes;
    try {
      bytes = new Uint8Array(await readFile(this.path(key)));
    } catch (e) {
      if ((e as { code?: string }).code === 'ENOENT') return null;
      throw e;
    }
    if (bytes.byteLength > maxBytes) throw new Error(`Object ${key} is larger than ${maxBytes} bytes`);
    return bytes;
  }

  async deleteObject(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async deleteObjects(keys: string[]): Promise<void> {
    for (const key of keys) await this.deleteObject(key);
  }

  async copyObject(fromKey: string, toKey: string): Promise<void> {
    const to = this.path(toKey);
    await mkdir(dirname(to), { recursive: true });
    await copyFile(this.path(fromKey), to);
  }

  async deletePrefix(prefix: string): Promise<number> {
    const keys = (await keysUnder(this.root)).filter((key) => key.startsWith(prefix));
    for (const key of keys) await this.deleteObject(key);
    return keys.length;
  }

  /** A page of keys after `cursor` (the last key of the page before), with each file's size and MD5 as its tag (S3's, for a single-part upload). */
  async list(prefix: string, cursor?: string | null): Promise<ObjectListing> {
    const keys = (await keysUnder(this.root)).filter((key) => key.startsWith(prefix) && (!cursor || key > cursor));
    const page = keys.slice(0, this.pageKeys);
    const objects = await Promise.all(
      page.map(async (key) => {
        const bytes = await readFile(this.path(key));
        return { key, size: bytes.byteLength, etag: createHash('md5').update(bytes).digest('hex') };
      }),
    );
    return { objects, cursor: keys.length > this.pageKeys ? page[page.length - 1] : null };
  }

  /** The file's size, MD5 and the type its extension is served as. */
  async head(key: string): Promise<ObjectHead | null> {
    try {
      const path = this.path(key);
      if (!(await stat(path)).isFile()) return null;
      const bytes = await readFile(path);
      return {
        size: bytes.byteLength,
        etag: createHash('md5').update(bytes).digest('hex'),
        contentType: localContentType(key) ?? 'application/octet-stream',
      };
    } catch (e) {
      if ((e as { code?: string }).code === 'ENOENT') return null;
      throw e;
    }
  }
}

/** A folder standing in for the chat bucket (emulator builds, tests): `chat/…` keys become paths inside it. */
export class LocalChatImages implements PrivateObjectStore {
  constructor(private readonly root: string) {}

  private path(key: string): string {
    const path = resolve(this.root, key);
    // A key is ours (chatImageKeys), but nothing outside the folder is ever touched whatever it says.
    if (!path.startsWith(resolve(this.root) + sep)) throw new Error(`Not a chat image key: ${key}`);
    return path;
  }

  async put(key: string, body: Uint8Array): Promise<void> {
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      return new Uint8Array(await readFile(this.path(key)));
    } catch (e) {
      if ((e as { code?: string }).code === 'ENOENT') return null;
      throw e;
    }
  }

  async stream(key: string): Promise<ReadableStream<Uint8Array> | null> {
    const bytes = await this.get(key);
    if (!bytes) return null;
    return new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }

  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) await this.delete(key);
  }
}
