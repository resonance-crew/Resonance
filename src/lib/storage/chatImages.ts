import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, type S3Client } from '@aws-sdk/client-s3';
import { r2Client } from './r2';

/**
 * Where pictures sent in chat are kept. Unlike covers and avatars — public
 * files on the image host — a chat picture is only ever read through GET
 * /api/v1/chat-images/{id}, which asks who is reading: so they live in a
 * bucket of their own with no public address (R2_CHAT_BUCKET), under keys no
 * client is told. The bucket may have keys of its own
 * (R2_CHAT_ACCESS_KEY_ID / R2_CHAT_SECRET_ACCESS_KEY); otherwise the
 * account's R2 keys must reach it.
 *
 * Against the emulators nothing real is touched: pictures go to a folder on
 * this machine (EMULATOR_CHAT_IMAGES_DIR, else one in the temp dir).
 */
export interface ChatImageStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The object's bytes; null when there is no such object. */
  get(key: string): Promise<Uint8Array | null>;
  /** Removes it (one already gone is no error). */
  delete(key: string): Promise<void>;
}

/** `chat/{yyyy-mm}/{uuid}.webp` and its `-thumb` — a fresh name that says nothing of who sent it, or to whom. */
export function chatImageKeys(now = new Date()): { key: string; thumbKey: string } {
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  const name = `chat/${month}/${crypto.randomUUID()}`;
  return { key: `${name}.webp`, thumbKey: `${name}-thumb.webp` };
}

class R2ChatImages implements ChatImageStore {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
  ) {}

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.byteLength }),
    );
  }

  async get(key: string): Promise<Uint8Array | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body ? await res.Body.transformToByteArray() : null;
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if ((e as { name?: string }).name === 'NoSuchKey' || status === 404) return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

/** A folder standing in for the bucket (emulator builds, tests): `chat/…` keys become paths inside it. */
export class LocalChatImages implements ChatImageStore {
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

  async delete(key: string): Promise<void> {
    await rm(this.path(key), { force: true });
  }
}

const againstEmulators = () => !!process.env.FIRESTORE_EMULATOR_HOST || process.env.NEXT_PUBLIC_FIREBASE_EMULATOR === 'true';

/**
 * The store pictures go to, or null when none is set up (production without
 * R2_CHAT_BUCKET: pictures can't be sent, and the routes say so).
 */
export function getChatImageStore(): ChatImageStore | null {
  const bucket = process.env.R2_CHAT_BUCKET;
  if (bucket && process.env.R2_ENDPOINT) {
    const id = process.env.R2_CHAT_ACCESS_KEY_ID;
    const secret = process.env.R2_CHAT_SECRET_ACCESS_KEY;
    return new R2ChatImages(r2Client(id && secret ? { accessKeyId: id, secretAccessKey: secret } : undefined), bucket);
  }
  if (againstEmulators()) {
    return new LocalChatImages(process.env.EMULATOR_CHAT_IMAGES_DIR || join(tmpdir(), 'resonance-emulator-chat-images'));
  }
  return null;
}
