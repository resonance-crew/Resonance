import {
  CopyObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { IStorageProvider } from '@/lib/storage/interfaces';
import { currentPublicBaseSetting } from '@/lib/storage/publicUrl';
import type { StoredObject, UploadIntent } from '@/lib/storage/types';
import type { ObjectHead, ObjectListing, PrivateObjectStore } from '@/server/ports/objects';
import { assertMediaConfig } from '../env/media';
import { bareEtag, IMMUTABLE, objectKey, PAGE_KEYS } from './keys';

// R2 through its S3 API: the only place the AWS SDK is used. src/lib/storage/r2
// re-exports what scripts and routes import from there.

function env(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required for R2 storage`);
  return value;
}

/**
 * The S3 clients made so far, one per endpoint and key pair: a client holds
 * its own connection pool and signer, so every request that reaches R2 (a
 * chat picture read is one per picture drawn) shares one rather than making
 * its own.
 */
const clients = new Map<string, S3Client>();

/** An S3 client for R2, with the account's keys unless others are given (a bucket a key of its own reaches); one per configuration. */
export function r2Client(credentials?: { accessKeyId: string; secretAccessKey: string }): S3Client {
  const endpoint = env('R2_ENDPOINT');
  const keys = credentials ?? { accessKeyId: env('R2_ACCESS_KEY_ID'), secretAccessKey: env('R2_SECRET_ACCESS_KEY') };
  const id = JSON.stringify([endpoint, keys.accessKeyId, keys.secretAccessKey]);
  let client = clients.get(id);
  if (!client) clients.set(id, (client = makeClient(endpoint, keys)));
  return client;
}

function makeClient(endpoint: string, credentials: { accessKeyId: string; secretAccessKey: string }): S3Client {
  return new S3Client({
    region: 'auto',
    endpoint,
    forcePathStyle: true,
    // R2 does not support the AWS SDK v3 default flexible-checksum trailer; left
    // on, the SDK embeds a bogus crc32 (computed over an empty body at presign
    // time) and rejects/garbles uploads. Only send a checksum when required.
    requestChecksumCalculation: 'WHEN_REQUIRED',
    responseChecksumValidation: 'WHEN_REQUIRED',
    credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey },
  });
}

/** Whether the SDK's error means there is no such object. */
const missing = (e: unknown) =>
  (e as { name?: string }).name === 'NoSuchKey' ||
  (e as { name?: string }).name === 'NotFound' ||
  (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;

/** The public bucket on R2: R2_BUCKET, served at MEDIA_PUBLIC_BASE (alias R2_PUBLIC_BASE). */
export class R2StorageProvider implements IStorageProvider {
  private client = r2Client();

  private bucket = env('R2_BUCKET');
  private publicBase = (currentPublicBaseSetting() ?? env('R2_PUBLIC_BASE')).replace(/\/$/, '');

  constructor() {
    // On a deployment, a base the apps wouldn't draw story pictures from fails every upload, loudly (ADR 0005).
    if (process.env.VERCEL_ENV) assertMediaConfig();
  }

  async uploadObject(intent: UploadIntent, body: Uint8Array): Promise<StoredObject> {
    return this.putObject(objectKey(intent), intent.contentType, body);
  }

  async putObject(key: string, contentType: string, body: Uint8Array): Promise<StoredObject> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
        ContentLength: body.byteLength,
        // Every key is a fresh UUID and an object is never rewritten: browsers
        // and the CDN may keep it for good.
        CacheControl: IMMUTABLE,
      })
    );
    return { key, publicUrl: this.getPublicUrl(key) };
  }

  getPublicUrl(key: string): string {
    return `${this.publicBase}/${key}`;
  }

  async getObject(key: string, maxBytes: number): Promise<Uint8Array | null> {
    let res;
    try {
      res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (e) {
      if ((e as { name?: string }).name === 'NoSuchKey' || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) {
        return null;
      }
      throw e;
    }
    if (!res.Body) return null;
    if ((res.ContentLength ?? 0) > maxBytes) throw new Error(`Object ${key} is larger than ${maxBytes} bytes`);
    const bytes = await res.Body.transformToByteArray();
    if (bytes.byteLength > maxBytes) throw new Error(`Object ${key} is larger than ${maxBytes} bytes`);
    return bytes;
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deleteObjects(keys: string[]): Promise<void> {
    let failed = 0;
    // R2 takes a thousand keys a request.
    for (let i = 0; i < keys.length; i += PAGE_KEYS) {
      const Objects = keys.slice(i, i + PAGE_KEYS).map((Key) => ({ Key }));
      const res = await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects, Quiet: true } }));
      failed += res.Errors?.length ?? 0;
    }
    if (failed) throw new Error(`${failed} of ${keys.length} objects were not deleted`);
  }

  async copyObject(fromKey: string, toKey: string): Promise<void> {
    // The object's metadata (type, Cache-Control) is copied along by default.
    await this.client.send(
      new CopyObjectCommand({ Bucket: this.bucket, Key: toKey, CopySource: `${this.bucket}/${encodeURIComponent(fromKey).replace(/%2F/g, '/')}` }),
    );
  }

  async deletePrefix(prefix: string): Promise<number> {
    let deleted = 0;
    let token: string | undefined;
    do {
      const page = await this.client.send(
        new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, ContinuationToken: token }),
      );
      const keys = (page.Contents ?? []).flatMap((o) => (o.Key ? [{ Key: o.Key }] : []));
      if (keys.length > 0) {
        await this.client.send(
          new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: keys, Quiet: true } }),
        );
        deleted += keys.length;
      }
      token = page.IsTruncated ? page.NextContinuationToken : undefined;
    } while (token);
    return deleted;
  }

  async list(prefix: string, cursor?: string | null): Promise<ObjectListing> {
    const page = await this.client.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: prefix, MaxKeys: PAGE_KEYS, ...(cursor ? { ContinuationToken: cursor } : {}) }),
    );
    return {
      objects: (page.Contents ?? []).flatMap((o) => (o.Key ? [{ key: o.Key, size: o.Size ?? 0, etag: bareEtag(o.ETag) }] : [])),
      cursor: page.IsTruncated && page.NextContinuationToken ? page.NextContinuationToken : null,
    };
  }

  async head(key: string): Promise<ObjectHead | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return { size: res.ContentLength ?? 0, etag: bareEtag(res.ETag), contentType: res.ContentType ?? 'application/octet-stream' };
    } catch (e) {
      if (missing(e)) return null;
      throw e;
    }
  }
}

/** The chat pictures' private bucket on R2 (src/lib/storage/chatImages getChatImageStore). */
export class R2ChatImages implements PrivateObjectStore {
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

  async stream(key: string): Promise<ReadableStream<Uint8Array> | null> {
    try {
      const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
      return res.Body ? (res.Body.transformToWebStream() as ReadableStream<Uint8Array>) : null;
    } catch (e) {
      const status = (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode;
      if ((e as { name?: string }).name === 'NoSuchKey' || status === 404) return null;
      throw e;
    }
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  async deleteMany(keys: string[]): Promise<void> {
    // R2 takes a thousand keys a request.
    for (let i = 0; i < keys.length; i += PAGE_KEYS) {
      const Objects = keys.slice(i, i + PAGE_KEYS).map((Key) => ({ Key }));
      await this.client.send(new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects, Quiet: true } }));
    }
  }
}
