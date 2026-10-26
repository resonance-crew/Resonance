import { mkdir, readdir, readFile, rm, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import type { IStorageProvider } from './interfaces';
import { objectKey } from './r2';
import type { PresignedUpload, StoredObject, UploadIntent } from './types';

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
    publicBase: string | undefined = process.env.R2_PUBLIC_BASE,
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
    const key = objectKey(intent);
    const path = this.path(key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, body);
    return { key, publicUrl: this.getPublicUrl(key) };
  }

  async createPresignedUpload(): Promise<PresignedUpload> {
    throw new Error('The emulators’ storage takes server-side uploads only');
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
    let entries;
    try {
      entries = await readdir(this.root, { recursive: true, withFileTypes: true });
    } catch (e) {
      if ((e as { code?: string }).code === 'ENOENT') return 0;
      throw e;
    }
    const keys = entries
      .filter((entry) => entry.isFile())
      .map((entry) => relative(this.root, join(entry.parentPath, entry.name)).split(sep).join('/'))
      .filter((key) => key.startsWith(prefix));
    for (const key of keys) await this.deleteObject(key);
    return keys.length;
  }
}
