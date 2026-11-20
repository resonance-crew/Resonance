import type { StoredObject, UploadIntent } from '@/lib/storage/types';

/** One object of a listing. */
export interface ListedObject {
  key: string;
  /** Bytes. */
  size: number;
  /** The store's entity tag, without quotes ('' when it gives none). Not a content hash for multipart uploads. */
  etag: string;
}

/** A page of a listing, in key order; `cursor` asks for the next page, null after the last. */
export interface ObjectListing {
  objects: ListedObject[];
  cursor: string | null;
}

/** What `head` says of an object. */
export interface ObjectHead {
  size: number;
  etag: string;
  contentType: string;
}

/**
 * The public bucket (covers, avatars, illustrations) — src/lib/storage's
 * IStorageProvider without `getPublicUrl` (a URL is MediaUrlResolver's), so
 * every method is asynchronous and the adapter may load its SDK on first
 * use. `list` and `head` are for the storage move's checks (plan §3.8).
 */
export interface ObjectStore {
  /**
   * Server-side upload: the route reads the file bytes and we PUT them to the
   * bucket directly, so the browser never has to reach the storage host. This
   * is the path that sidesteps the production TLS failure browsers hit talking
   * to *.r2.cloudflarestorage.com.
   */
  uploadObject(intent: UploadIntent, body: Uint8Array): Promise<StoredObject>;
  /**
   * Server-side upload under a key the caller made (a cover's copy beside the
   * cover: lib/images/coverThumb), served as immutable as uploadObject's.
   */
  putObject(key: string, contentType: string, body: Uint8Array): Promise<StoredObject>;
  /**
   * An object's bytes, read through the storage API (not its public URL);
   * null when there is no such object. Throws past `maxBytes`.
   */
  getObject(key: string, maxBytes: number): Promise<Uint8Array | null>;
  deleteObject(key: string): Promise<void>;
  /**
   * Delete these objects, as many at a time as the store takes (R2: a
   * thousand a request); a key that isn't there is nothing. Throws when any
   * of them could not be deleted.
   */
  deleteObjects(keys: string[]): Promise<void>;
  /** Copy an object to a new key, its type and caching with it (scripts/backfills/rekeyImages). */
  copyObject(fromKey: string, toKey: string): Promise<void>;
  /** Delete every object under `prefix` (e.g. `image/{uid}/`); returns how many. */
  deletePrefix(prefix: string): Promise<number>;
  /** The objects under `prefix`, a page at a time (up to a thousand), from `cursor` (none: the first page). */
  list(prefix: string, cursor?: string | null): Promise<ObjectListing>;
  /** An object's size, entity tag and type, without its bytes; null when there is no such object. */
  head(key: string): Promise<ObjectHead | null>;
}

/**
 * The private bucket chat pictures live in (src/lib/storage/chatImages.ts
 * ChatImageStore, the same shape): no public address, read only through the
 * route that asks who is reading.
 */
export interface PrivateObjectStore {
  put(key: string, body: Uint8Array, contentType: string): Promise<void>;
  /** The object's bytes; null when there is no such object. */
  get(key: string): Promise<Uint8Array | null>;
  /**
   * The object's bytes as they arrive (B14: GET /chat-images/{id} hands them on without holding the whole
   * picture); null when there is no such object. Whoever opens it and doesn't read it cancels it.
   */
  stream?(key: string): Promise<ReadableStream<Uint8Array> | null>;
  /** Removes it (one already gone is no error). */
  delete(key: string): Promise<void>;
  /** Removes all of them, as few requests as the store allows (an account's pictures). */
  deleteMany(keys: string[]): Promise<void>;
}
