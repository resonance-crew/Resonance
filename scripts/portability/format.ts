/**
 * The export's format (plan §4.2), format version 1:
 *
 *   export-<UTC>-<source>/
 *     manifest.json
 *     entities/<entity>/000001.ndjson.zst   (`.ndjson` with --no-zstd: the manifest's `compression`)
 *     objects/public.ndjson                 { contentType, etag, key, size }
 *     objects/chat.ndjson                   (when the chat store can list)
 *
 * Each line is one canonical row `{ _e, _id, _v, …fields }` (domain/schema/canonical.ts), keys sorted, no
 * spaces; rows sorted by `_id` (UTF-8 bytes), at most 100 000 to a file. A row's hash is the sha256 of its
 * line; a file's, the hash of its rows' hashes; an entity's, the hash of its files' hashes — all in the
 * manifest, so two exports compare by their manifests and a file is checked as it is read. zstd comes
 * with Node (≥ 22.15) — no dependency; where it is missing the files are plain `.ndjson`.
 *
 * An export holds the whole database — every anonymous card's author, every private message, every
 * report's evidence. It is written outside the repository (default `$TMPDIR/resonance-exports`), never
 * committed (`.gitignore`, `repoCheck.ts` in CI), never a CI artifact, and kept only on the owner's
 * encrypted storage (docs/ops/backup.md).
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve, sep } from 'node:path';
import * as zlib from 'node:zlib';
import { canonicalJson, compareIds, hashOfHashes, idHash, sha256, type CanonicalRow } from '@/server/domain/schema/canonical';
import { ENTITY_NAMES, SPECS, type EntityName } from '@/server/domain/schema/registry';
import type { CanonicalRead, EntitySource } from '@/server/ports/portability';

export const FORMAT = 'resonance-export';
export const FORMAT_VERSION = 1;
export const MAX_ROWS_PER_FILE = 100_000;
/** Where exports go unless `--out` says otherwise: outside any checkout. */
export const DEFAULT_OUT = join(tmpdir(), 'resonance-exports');
/** The repository: an export is never written inside it. */
export const REPO_ROOT = resolve(__dirname, '..', '..');

export interface FileEntry {
  name: string;
  rows: number;
  sha256: string;
}

export interface EntityEntry {
  rows: number;
  sha256: string;
  files: FileEntry[];
  /** Field paths read off their kind (a lenient export), and how many rows had each. */
  offSchema: Record<string, number>;
  /** Top-level fields the schema doesn't name (a complete entity's drift), names only. */
  extras: string[];
}

export type ObjectsEntry = { listed: true; file: string; objects: number; sha256: string } | { listed: false; reason: string };

export interface Manifest {
  format: typeof FORMAT;
  formatVersion: number;
  source: string;
  project: string | null;
  startedAt: string;
  finishedAt: string;
  compression: 'zstd' | 'none';
  schemaVersions: Record<string, number>;
  entities: Record<string, EntityEntry>;
  objects: { public: ObjectsEntry; chat: ObjectsEntry };
  /** Collections the source holds that no registered entity is (names only; their rows are not exported). */
  unregistered: string[];
}

/** One object of a bucket listing as the export writes it. */
export interface ObjectLine {
  key: string;
  size: number;
  etag: string;
  contentType: string;
}

/** A bucket that can be listed: ObjectStore's `list` and `head` (ports/objects.ts). */
export interface ListableStore {
  list(
    prefix: string,
    cursor?: string | null,
  ): Promise<{
    objects: { key: string; size: number; etag: string }[];
    cursor: string | null;
  }>;
  head(key: string): Promise<{ size: number; etag: string; contentType: string } | null>;
}

export const zstdAvailable = () => typeof (zlib as { zstdCompressSync?: unknown }).zstdCompressSync === 'function';

const compress = (text: string) => (zlib as unknown as { zstdCompressSync(b: Buffer): Buffer }).zstdCompressSync(Buffer.from(text, 'utf8'));
const decompress = (bytes: Buffer) => (zlib as unknown as { zstdDecompressSync(b: Buffer): Buffer }).zstdDecompressSync(bytes).toString('utf8');

/** `20261121T030405Z` */
const stamp = (at: Date) =>
  at
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, 'Z');

/** Refuses a directory inside the repository (an export is never one `git add` away from a commit). */
export function assertOutsideRepo(dir: string, repo = REPO_ROOT): void {
  const rel = relative(resolve(repo), resolve(dir));
  if (rel === '' || (!rel.startsWith('..') && !rel.startsWith(sep) && !/^[A-Za-z]:/.test(rel))) {
    throw new Error(`Refusing to write an export inside the repository (${rel || '.'}): pass --out a directory outside it`);
  }
}

export interface WriteOptions {
  source: EntitySource;
  /** The export's root (a new `export-<UTC>-<source>` directory is made in it). */
  out?: string;
  project?: string | null;
  objects?: {
    public?: ListableStore | null;
    chat?: ListableStore | object | null;
  };
  zstd?: boolean;
  maxRowsPerFile?: number;
  now?: () => Date;
}

const fileName = (n: number, zstd: boolean) => `${String(n).padStart(6, '0')}.ndjson${zstd ? '.zst' : ''}`;

async function writeLines(path: string, lines: string[], zstd: boolean): Promise<void> {
  const text = lines.length ? `${lines.join('\n')}\n` : '';
  await writeFile(path, zstd ? compress(text) : text);
}

async function listObjects(store: ListableStore): Promise<ObjectLine[]> {
  const out: ObjectLine[] = [];
  let cursor: string | null = null;
  do {
    const page = await store.list('', cursor);
    for (const o of page.objects) {
      const head = await store.head(o.key);
      out.push({
        key: o.key,
        size: o.size,
        etag: o.etag,
        contentType: head?.contentType ?? '',
      });
    }
    cursor = page.cursor;
  } while (cursor);
  return out.sort((a, b) => compareIds(a.key, b.key));
}

const listable = (store: unknown): store is ListableStore =>
  !!store && typeof (store as ListableStore).list === 'function' && typeof (store as ListableStore).head === 'function';

async function writeObjects(dir: string, name: 'public' | 'chat', store: unknown): Promise<ObjectsEntry> {
  if (!store) return { listed: false, reason: 'no store given' };
  if (!listable(store)) return { listed: false, reason: 'the store cannot list its objects' };
  const lines = (await listObjects(store)).map((o) => canonicalJson(o));
  await mkdir(join(dir, 'objects'), { recursive: true });
  const file = `objects/${name}.ndjson`;
  await writeLines(join(dir, file), lines, false);
  return {
    listed: true,
    file,
    objects: lines.length,
    sha256: hashOfHashes(lines.map((l) => sha256(l))),
  };
}

/** Writes an export of everything the source holds; returns its directory. */
export async function writeExport(options: WriteOptions): Promise<{ dir: string; manifest: Manifest }> {
  const now = options.now ?? (() => new Date());
  const zstd = (options.zstd ?? true) && zstdAvailable();
  const maxRows = options.maxRowsPerFile ?? MAX_ROWS_PER_FILE;
  const root = options.out ?? DEFAULT_OUT;
  assertOutsideRepo(root);
  const startedAt = now();
  const dir = join(root, `export-${stamp(startedAt)}-${options.source.kind}`);
  await mkdir(root, { recursive: true });
  // Never into an export already there.
  await mkdir(dir);

  const entities: Record<string, EntityEntry> = {};
  for (const entity of ENTITY_NAMES) {
    const rows: { id: string; line: string }[] = [];
    const offSchema: Record<string, number> = {};
    const extras = new Set<string>();
    for await (const read of options.source.read(entity)) {
      rows.push({ id: String(read.row._id), line: canonicalJson(read.row) });
      for (const path of read.offSchema) offSchema[path] = (offSchema[path] ?? 0) + 1;
      if (SPECS[entity].schema.complete) for (const extra of read.extras) extras.add(extra);
    }
    rows.sort((a, b) => compareIds(a.id, b.id));
    for (let i = 1; i < rows.length; i++) if (rows[i].id === rows[i - 1].id) throw new Error(`${entity}: two rows with the id ${idHash(rows[i].id)}`);
    const files: FileEntry[] = [];
    if (rows.length) await mkdir(join(dir, 'entities', entity), { recursive: true });
    for (let start = 0, n = 1; start < rows.length; start += maxRows, n++) {
      const chunk = rows.slice(start, start + maxRows).map((r) => r.line);
      const name = fileName(n, zstd);
      await writeLines(join(dir, 'entities', entity, name), chunk, zstd);
      files.push({
        name,
        rows: chunk.length,
        sha256: hashOfHashes(chunk.map((l) => sha256(l))),
      });
    }
    entities[entity] = {
      rows: rows.length,
      sha256: hashOfHashes(files.map((f) => f.sha256)),
      files,
      offSchema: sortKeys(offSchema),
      extras: [...extras].sort(),
    };
  }

  const objects = {
    public: await writeObjects(dir, 'public', options.objects?.public),
    chat: await writeObjects(dir, 'chat', options.objects?.chat),
  };
  const manifest: Manifest = {
    format: FORMAT,
    formatVersion: FORMAT_VERSION,
    source: options.source.kind,
    project: options.project ?? null,
    startedAt: startedAt.toISOString(),
    finishedAt: now().toISOString(),
    compression: zstd ? 'zstd' : 'none',
    schemaVersions: Object.fromEntries(ENTITY_NAMES.map((e) => [e, SPECS[e].schema.version])),
    entities,
    objects,
    unregistered: await options.source.unregistered(),
  };
  await writeFile(join(dir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  return { dir, manifest };
}

const sortKeys = <T>(o: Record<string, T>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

export async function readManifest(dir: string): Promise<Manifest> {
  const manifest = JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')) as Manifest;
  if (manifest.format !== FORMAT) throw new Error(`${dir} is not an export`);
  if (manifest.formatVersion !== FORMAT_VERSION) throw new Error(`Export format ${manifest.formatVersion}; this tool reads ${FORMAT_VERSION}`);
  return manifest;
}

/** The rows of one entity of an export, each file checked against its manifest hash as it is read. */
export async function* exportRows(dir: string, manifest: Manifest, entity: EntityName): AsyncIterable<CanonicalRow> {
  const entry = manifest.entities[entity];
  if (!entry) return;
  if (manifest.schemaVersions[entity] !== SPECS[entity].schema.version) {
    throw new Error(`${entity}: the export's schema version ${manifest.schemaVersions[entity]} is not this tool's ${SPECS[entity].schema.version}`);
  }
  for (const file of entry.files) {
    const bytes = await readFile(join(dir, 'entities', entity, file.name));
    const text = file.name.endsWith('.zst') ? decompress(bytes) : bytes.toString('utf8');
    const lines = text ? text.replace(/\n$/, '').split('\n') : [];
    if (lines.length !== file.rows || hashOfHashes(lines.map((l) => sha256(l))) !== file.sha256) {
      throw new Error(`${entity}/${file.name} does not match its manifest hash`);
    }
    for (const line of lines) yield JSON.parse(line) as CanonicalRow;
  }
}

/** An export read back as a source (the import and the parity check read it like a store). */
export async function exportSource(dir: string): Promise<EntitySource & { manifest: Manifest }> {
  const manifest = await readManifest(dir);
  return {
    kind: 'export',
    manifest,
    async *read(entity): AsyncIterable<CanonicalRead> {
      for await (const row of exportRows(dir, manifest, entity)) yield { row, offSchema: [], extras: [] };
    },
    unregistered: async () => manifest.unregistered,
  };
}

/** Every file of an export, relative to it, sorted (the round trip compares them byte for byte). */
export async function exportFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { recursive: true, withFileTypes: true });
  return entries
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)).split(sep).join('/'))
    .sort();
}
