import { gunzipSync, gzipSync } from 'node:zlib';
import type { PrivateObjectStore } from '@/server/ports/objects';
import type { VectorRecord } from '@/server/ports/vectors';

/**
 * The public pool packed into one private object (P0 #7): every public part
 * of the current model, its lines and its vector quantized to int8 (one scale
 * a vector), gzipped — ~1–3 MB in place of 900–1800 Firestore documents of
 * 12 KB each, read by every instance every POOL_MEMO_MS. Written by the
 * warm-up cron (refreshPoolStatsIn) right after it reads the pool whole.
 *
 * It holds author ids, so it lives where nothing is public: the private
 * bucket the chat pictures use (ServerCtx.chatObjects, R2_CHAT_BUCKET; no
 * public address, keys no client is told), under `recommend/`. What a reader
 * is served is checked again as before — the build drops the reader's own and
 * held cards, `present()` / `stillPublic` refuse a card made private, trashed
 * or deleted since — and every change since the pack was made is read from
 * `cardVectors` (`updatedAt` after it: publish, a new reading, a visibility
 * change) and laid over it, so a card published or hidden since joins or
 * leaves the pool on the next read as before. A deleted card's parts leave
 * no trace to read; it stays in the pack until the next one (a day) and is
 * refused when served.
 *
 * Anything off — no store, no object, another model, a format this code
 * doesn't know, a pack older than PACK_MAX_AGE_MS, bytes that don't add up —
 * and the pool is read from Firestore whole, as before the pack.
 */

export const PACK_VERSION = 1;
/** A pack older than this is not used (the cron writes one a day): the pool is read whole. */
export const PACK_MAX_AGE_MS = 48 * 60 * 60 * 1000;
/**
 * How far before the pack's time the changes are read from: the pack's `at` is taken before the pool was read, and
 * this covers the store's clock (serverTimestamp) against the instance's.
 */
export const PACK_SKEW_MS = 5 * 60_000;
const MAGIC = 'RPK1';

/** The object's key for a model (a model's name is letters, digits, dots and dashes). */
export const packKey = (embedModel: string) => `recommend/pool/${encodeURIComponent(embedModel)}.bin`;

type Meta = Omit<VectorRecord, 'vector'>;

interface Header {
  v: number;
  embedModel: string;
  /** When the pool was read (ms): changes from (at − PACK_SKEW_MS) on are read over it. */
  at: number;
  dims: number;
  records: Meta[];
}

export interface PoolPack {
  embedModel: string;
  at: number;
  records: VectorRecord[];
}

const metaOf = ({ vector: _vector, ...meta }: VectorRecord): Meta => meta;

/** int8 per vector: q = round(x / scale), scale = max|x| / 127. */
export function encodePack(embedModel: string, at: number, records: VectorRecord[]): Uint8Array {
  const dims = records[0]?.vector.length ?? 0;
  const kept = records.filter((r) => r.vector.length === dims && dims > 0);
  const header: Header = { v: PACK_VERSION, embedModel, at, dims, records: kept.map(metaOf) };
  const head = Buffer.from(JSON.stringify(header), 'utf8');
  const scales = new Float32Array(kept.length);
  const q = new Int8Array(kept.length * dims);
  kept.forEach((r, i) => {
    let max = 0;
    for (const x of r.vector) max = Math.max(max, Math.abs(x));
    const scale = max > 0 ? max / 127 : 1;
    scales[i] = scale;
    for (let d = 0; d < dims; d++) q[i * dims + d] = Math.max(-127, Math.min(127, Math.round(r.vector[d] / scale)));
  });
  const lead = Buffer.alloc(8);
  lead.write(MAGIC, 0, 'ascii');
  lead.writeUInt32LE(head.length, 4);
  const body = Buffer.concat([lead, head, Buffer.from(scales.buffer), Buffer.from(q.buffer)]);
  return new Uint8Array(gzipSync(body, { level: 6 }));
}

/** The pack's records, each vector unit length again; null for bytes that aren't a pack of this format. */
export function decodePack(bytes: Uint8Array): PoolPack | null {
  try {
    const body = gunzipSync(bytes);
    if (body.toString('ascii', 0, 4) !== MAGIC) return null;
    const headLen = body.readUInt32LE(4);
    const header = JSON.parse(body.toString('utf8', 8, 8 + headLen)) as Header;
    if (header.v !== PACK_VERSION || !Array.isArray(header.records) || !Number.isInteger(header.dims) || header.dims <= 0) return null;
    const n = header.records.length;
    const dims = header.dims;
    const start = 8 + headLen;
    if (body.length !== start + n * 4 + n * dims) return null;
    // Copied out: the Buffer's offset need not be aligned for a Float32Array.
    const scales = new Float32Array(new Uint8Array(body.subarray(start, start + n * 4)).buffer);
    const q = new Int8Array(new Uint8Array(body.subarray(start + n * 4)).buffer);
    const records = header.records.map((meta, i): VectorRecord => {
      const vector = new Array<number>(dims);
      let norm = 0;
      for (let d = 0; d < dims; d++) {
        const x = q[i * dims + d] * scales[i];
        vector[d] = x;
        norm += x * x;
      }
      const len = Math.sqrt(norm) || 1;
      for (let d = 0; d < dims; d++) vector[d] /= len;
      return { ...meta, vector };
    });
    return { embedModel: header.embedModel, at: header.at, records };
  } catch {
    return null;
  }
}

/**
 * The pack with the changes since laid over it: every card a change names takes exactly its changed parts that are
 * public and of the model (none, when it was made private or trashed); every other card keeps the pack's.
 */
export function overlay(pack: VectorRecord[], changed: VectorRecord[], embedModel: string, modelOf: (r: VectorRecord) => string): VectorRecord[] {
  if (!changed.length) return pack;
  const touched = new Set(changed.map((r) => r.cardId));
  return [
    ...pack.filter((r) => !touched.has(r.cardId)),
    ...changed.filter((r) => r.visibility === 'public' && modelOf(r) === embedModel && r.vector.length > 0),
  ];
}

/** Write the pack (the warm-up cron); a store that fails is logged by the caller and changes nothing else. */
export async function writePack(store: PrivateObjectStore, embedModel: string, at: number, records: VectorRecord[]): Promise<number> {
  const bytes = encodePack(embedModel, at, records);
  await store.put(packKey(embedModel), bytes, 'application/octet-stream');
  return bytes.length;
}

/** The pack for this model if there is a usable one (fresh enough, this format, this model); null otherwise. */
export async function readPack(store: PrivateObjectStore, embedModel: string, now: number): Promise<PoolPack | null> {
  const bytes = await store.get(packKey(embedModel));
  if (!bytes) return null;
  const pack = decodePack(bytes);
  if (!pack || pack.embedModel !== embedModel || !(now - pack.at < PACK_MAX_AGE_MS) || pack.at > now + PACK_SKEW_MS) return null;
  return pack;
}
