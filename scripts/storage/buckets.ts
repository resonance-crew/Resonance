import { createReadStream } from 'node:fs';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative, sep } from 'node:path';
import type { ObjectHead, ObjectListing, ObjectStore } from '../../src/server/ports/objects';

/**
 * A bucket as the storage move's copy and compare see it (plan §3.8): list
 * a page of keys, say an object's size, read its bytes as they arrive, and
 * write one. Over the middle layer's ObjectStore (the public bucket: R2, the
 * emulators' folder, memory in tests), any S3-compatible bucket (the chat
 * bucket, a target on S3 / GCS's XML API / another R2 account), or a folder.
 */
export interface Bucket {
  /** What it is, for the report (never a secret). */
  readonly name: string;
  list(prefix: string, cursor?: string | null): Promise<ObjectListing>;
  head(key: string): Promise<ObjectHead | null>;
  /** The object's bytes as they arrive; null when there is no such object. */
  read(key: string): Promise<AsyncIterable<Uint8Array> | null>;
  /** Store an object (a public one as immutable as an upload: its key is never rewritten). */
  write(key: string, body: Uint8Array, contentType: string): Promise<void>;
}

/** The middle layer's public ObjectStore as a Bucket (reads whole: covers and avatars are a few MB at most). */
export function storeBucket(name: string, store: ObjectStore, maxBytes = 64 * 1024 * 1024): Bucket {
  return {
    name,
    list: (prefix, cursor) => store.list(prefix, cursor),
    head: (key) => store.head(key),
    async read(key) {
      const bytes = await store.getObject(key, maxBytes);
      return bytes ? (async function* () { yield bytes; })() : null;
    },
    async write(key, body, contentType) {
      await store.putObject(key, contentType, body);
    },
  };
}

/** A folder as a bucket (a rehearsal target, a local copy): keys are paths under `root`, in key order. */
export function dirBucket(root: string): Bucket {
  const keyOf = (path: string) => relative(root, path).split(sep).join('/');
  async function* walk(dir: string): AsyncGenerator<string> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const path = join(dir, e.name);
      if (e.isDirectory()) yield* walk(path);
      else if (e.isFile()) yield path;
    }
  }
  return {
    name: `dir:${root}`,
    async list(prefix, cursor) {
      const keys: string[] = [];
      for await (const path of walk(root)) {
        const key = keyOf(path);
        if (key.startsWith(prefix) && (!cursor || key > cursor)) keys.push(key);
      }
      keys.sort();
      const page = keys.slice(0, 1000);
      const objects = await Promise.all(page.map(async (key) => ({ key, size: (await stat(join(root, key))).size, etag: '' })));
      return { objects, cursor: keys.length > page.length ? page[page.length - 1] : null };
    },
    async head(key) {
      try {
        const s = await stat(join(root, key));
        return s.isFile() ? { size: s.size, etag: '', contentType: 'application/octet-stream' } : null;
      } catch {
        return null;
      }
    },
    async read(key) {
      const path = join(root, key);
      try {
        if (!(await stat(path)).isFile()) return null;
      } catch {
        return null;
      }
      return createReadStream(path) as AsyncIterable<Uint8Array>;
    },
    async write(key, body) {
      const path = join(root, key);
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, body);
    },
  };
}

export interface S3BucketConfig {
  endpoint: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  region?: string;
  /** Written objects' Cache-Control (the public bucket's: immutable for a year). */
  cacheControl?: string;
}

/** An S3-compatible bucket (R2, S3, GCS's XML API), loading the SDK on first use. */
export function s3Bucket(config: S3BucketConfig): Bucket {
  const sdk = import('@aws-sdk/client-s3');
  const client = sdk.then(
    ({ S3Client }) =>
      new S3Client({
        region: config.region ?? 'auto',
        endpoint: config.endpoint,
        forcePathStyle: true,
        requestChecksumCalculation: 'WHEN_REQUIRED',
        responseChecksumValidation: 'WHEN_REQUIRED',
        credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
      }),
  );
  const missing = (e: unknown) => (e as { name?: string }).name === 'NoSuchKey' || (e as { name?: string }).name === 'NotFound' || (e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404;
  return {
    name: `s3:${new URL(config.endpoint).host}/${config.bucket}`,
    async list(prefix, cursor) {
      const { ListObjectsV2Command } = await sdk;
      const res = await (await client).send(new ListObjectsV2Command({ Bucket: config.bucket, Prefix: prefix, ContinuationToken: cursor ?? undefined, MaxKeys: 1000 }));
      return {
        objects: (res.Contents ?? []).map((o) => ({ key: o.Key!, size: o.Size ?? 0, etag: (o.ETag ?? '').replace(/"/g, '') })),
        cursor: res.IsTruncated ? (res.NextContinuationToken ?? null) : null,
      };
    },
    async head(key) {
      const { HeadObjectCommand } = await sdk;
      try {
        const res = await (await client).send(new HeadObjectCommand({ Bucket: config.bucket, Key: key }));
        return { size: res.ContentLength ?? 0, etag: (res.ETag ?? '').replace(/"/g, ''), contentType: res.ContentType ?? 'application/octet-stream' };
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },
    async read(key) {
      const { GetObjectCommand } = await sdk;
      try {
        const res = await (await client).send(new GetObjectCommand({ Bucket: config.bucket, Key: key }));
        return res.Body ? (res.Body as unknown as AsyncIterable<Uint8Array>) : null;
      } catch (e) {
        if (missing(e)) return null;
        throw e;
      }
    },
    async write(key, body, contentType) {
      const { PutObjectCommand } = await sdk;
      await (await client).send(
        new PutObjectCommand({ Bucket: config.bucket, Key: key, Body: body, ContentType: contentType, ContentLength: body.byteLength, CacheControl: config.cacheControl }),
      );
    },
  };
}

const need = (env: Record<string, string | undefined>, name: string) => {
  const v = env[name];
  if (!v) throw new Error(`${name} is not set`);
  return v;
};

/**
 * A bucket named on the command line:
 * - `r2:public` — R2_BUCKET with the account's R2 keys (R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY);
 * - `r2:chat` — R2_CHAT_BUCKET, with R2_CHAT_ACCESS_KEY_ID / R2_CHAT_SECRET_ACCESS_KEY when set;
 * - `s3:<PREFIX>` — <PREFIX>_ENDPOINT, <PREFIX>_BUCKET, <PREFIX>_ACCESS_KEY_ID, <PREFIX>_SECRET_ACCESS_KEY
 *   (optional <PREFIX>_REGION), e.g. `s3:TARGET` for TARGET_ENDPOINT…;
 * - `dir:<path>` — a folder.
 */
export function bucketFromSpec(spec: string, env: Record<string, string | undefined> = process.env): Bucket {
  const [kind, rest] = [spec.slice(0, spec.indexOf(':')), spec.slice(spec.indexOf(':') + 1)];
  const immutable = 'public, max-age=31536000, immutable';
  if (kind === 'dir' && rest) return dirBucket(rest);
  if (spec === 'r2:public') {
    return s3Bucket({ endpoint: need(env, 'R2_ENDPOINT'), bucket: need(env, 'R2_BUCKET'), accessKeyId: need(env, 'R2_ACCESS_KEY_ID'), secretAccessKey: need(env, 'R2_SECRET_ACCESS_KEY'), cacheControl: immutable });
  }
  if (spec === 'r2:chat') {
    const own = env.R2_CHAT_ACCESS_KEY_ID && env.R2_CHAT_SECRET_ACCESS_KEY;
    return s3Bucket({
      endpoint: need(env, 'R2_ENDPOINT'),
      bucket: need(env, 'R2_CHAT_BUCKET'),
      accessKeyId: own ? env.R2_CHAT_ACCESS_KEY_ID! : need(env, 'R2_ACCESS_KEY_ID'),
      secretAccessKey: own ? env.R2_CHAT_SECRET_ACCESS_KEY! : need(env, 'R2_SECRET_ACCESS_KEY'),
    });
  }
  if (kind === 's3' && /^[A-Z][A-Z0-9_]*$/.test(rest)) {
    return s3Bucket({
      endpoint: need(env, `${rest}_ENDPOINT`),
      bucket: need(env, `${rest}_BUCKET`),
      accessKeyId: need(env, `${rest}_ACCESS_KEY_ID`),
      secretAccessKey: need(env, `${rest}_SECRET_ACCESS_KEY`),
      region: env[`${rest}_REGION`],
      cacheControl: env[`${rest}_CACHE_CONTROL`],
    });
  }
  throw new Error(`Not a bucket: ${spec} (r2:public | r2:chat | s3:<ENV PREFIX> | dir:<path>)`);
}
