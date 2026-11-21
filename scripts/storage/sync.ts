import { createHash } from 'node:crypto';
import type { Bucket } from './buckets';

/**
 * The storage move's copy and compare (plan §3.8, docs/ops/storage-migration.md),
 * over two Buckets. Keys are UUIDs, never rewritten, so a copy is idempotent:
 * an object already at the target with the same size and the same SHA-256 is
 * skipped. The hash is computed by streaming the bytes — an R2 multipart
 * upload's ETag is not an MD5 of the object, so ETags never decide anything.
 * Nothing is ever deleted, at either end.
 */

export interface ManifestEntry {
  key: string;
  size: number;
  sha256: string;
}

/** Every key under `prefix`, in key order, a page at a time. */
export async function* allObjects(bucket: Bucket, prefix = ''): AsyncGenerator<{ key: string; size: number }> {
  let cursor: string | null = null;
  do {
    const page = await bucket.list(prefix, cursor);
    for (const o of page.objects) yield { key: o.key, size: o.size };
    cursor = page.cursor;
  } while (cursor);
}

/** An object's SHA-256 (hex) and byte count, read as it arrives; null when it is not there. */
export async function sha256Of(bucket: Bucket, key: string): Promise<{ sha256: string; size: number } | null> {
  const body = await bucket.read(key);
  if (!body) return null;
  const hash = createHash('sha256');
  let size = 0;
  for await (const chunk of body) {
    hash.update(chunk);
    size += chunk.byteLength;
  }
  return { sha256: hash.digest('hex'), size };
}

async function bytesOf(bucket: Bucket, key: string): Promise<{ bytes: Uint8Array; sha256: string } | null> {
  const body = await bucket.read(key);
  if (!body) return null;
  const hash = createHash('sha256');
  const chunks: Uint8Array[] = [];
  for await (const chunk of body) {
    hash.update(chunk);
    chunks.push(chunk);
  }
  return { bytes: Buffer.concat(chunks), sha256: hash.digest('hex') };
}

export interface CopyReport {
  /** Objects at the source under the prefix. */
  scanned: number;
  /** Already at the target, same size and SHA-256. */
  same: number;
  /** Copied (with `apply`), or that would be (a dry run). */
  copied: string[];
  /** At the target with other bytes: copied over only with `overwrite` (never needed for UUID keys). */
  conflicting: string[];
  /** Gone from the source while listed, or not the same bytes at the target after the copy: left for a second run. */
  failed: string[];
  /** The source's objects with their hashes, in key order. */
  manifest: ManifestEntry[];
}

/**
 * Copy every object under `prefix` from `from` to `to`. A dry run (no
 * `apply`) reads and hashes, writes nothing. An object at the target with
 * other bytes is a conflict, reported, and left — unless `overwrite`.
 */
export async function copyBucket(
  from: Bucket,
  to: Bucket,
  opts: { prefix?: string; apply?: boolean; overwrite?: boolean; log?: (line: string) => void } = {},
): Promise<CopyReport> {
  const report: CopyReport = { scanned: 0, same: 0, copied: [], conflicting: [], failed: [], manifest: [] };
  for await (const o of allObjects(from, opts.prefix ?? '')) {
    report.scanned++;
    const source = await bytesOf(from, o.key);
    if (!source) {
      report.failed.push(o.key);
      continue;
    }
    report.manifest.push({ key: o.key, size: source.bytes.byteLength, sha256: source.sha256 });
    const there = await to.head(o.key);
    if (there) {
      const theirs = there.size === source.bytes.byteLength ? await sha256Of(to, o.key) : null;
      if (theirs && theirs.sha256 === source.sha256) {
        report.same++;
        continue;
      }
      if (!opts.overwrite) {
        report.conflicting.push(o.key);
        continue;
      }
    }
    if (opts.apply) {
      const type = (await from.head(o.key))?.contentType ?? 'application/octet-stream';
      await to.write(o.key, source.bytes, type);
      const check = await sha256Of(to, o.key);
      if (!check || check.sha256 !== source.sha256) {
        report.failed.push(o.key);
        continue;
      }
    }
    report.copied.push(o.key);
  }
  opts.log?.(
    `${from.name} → ${to.name}${opts.prefix ? ` (${opts.prefix})` : ''}: ${report.scanned} object(s); ${report.same} already there; ` +
      `${report.copied.length} ${opts.apply ? 'copied' : 'to copy (dry run)'}; ${report.conflicting.length} conflicting; ${report.failed.length} failed`,
  );
  return report;
}

export interface CompareReport {
  /** At the source, not at the target. */
  missing: string[];
  /** At the target, not at the source. */
  extra: string[];
  /** At both, with another size or SHA-256. */
  mismatched: string[];
  /** Keys compared at both ends. */
  compared: number;
}

/**
 * The keys that differ between two buckets under `prefix`: missing at the
 * target, extra at the target, or with other bytes (size, then SHA-256 by
 * streaming — `sizesOnly` skips the hashes for a quick look). Reads only.
 */
export async function compareBuckets(a: Bucket, b: Bucket, opts: { prefix?: string; sizesOnly?: boolean } = {}): Promise<CompareReport> {
  const prefix = opts.prefix ?? '';
  const left = new Map<string, number>();
  for await (const o of allObjects(a, prefix)) left.set(o.key, o.size);
  const right = new Map<string, number>();
  for await (const o of allObjects(b, prefix)) right.set(o.key, o.size);
  const report: CompareReport = { missing: [], extra: [], mismatched: [], compared: 0 };
  for (const [key, size] of left) {
    const other = right.get(key);
    if (other === undefined) {
      report.missing.push(key);
      continue;
    }
    report.compared++;
    if (other !== size) {
      report.mismatched.push(key);
      continue;
    }
    if (opts.sizesOnly) continue;
    const [x, y] = await Promise.all([sha256Of(a, key), sha256Of(b, key)]);
    if (!x || !y || x.sha256 !== y.sha256) report.mismatched.push(key);
  }
  for (const key of right.keys()) if (!left.has(key)) report.extra.push(key);
  report.missing.sort();
  report.extra.sort();
  report.mismatched.sort();
  return report;
}

/** Whether two buckets hold the same objects (nothing missing, extra or mismatched). */
export const identical = (r: CompareReport) => !r.missing.length && !r.extra.length && !r.mismatched.length;
