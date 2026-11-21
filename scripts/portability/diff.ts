/**
 * The parity check (plan §4.4), its first two layers: rows per entity, then
 * the 256 id-hash buckets' hash of hashes, then — only in the buckets that
 * differ — row by row. What it reports never holds a value, nor an id (an
 * id can hold a uid: `resonanceTaps/{card}_{uid}`), nor a map key the schema
 * doesn't name (`unread.{uid}`): an entity, an id's hash, and field paths
 * with every undeclared key hashed. So it can't print who wrote an anonymous
 * card. The third layer (shadow reads) is the PostgreSQL lane's.
 */
import { bucketOf, canonicalJson, compareIds, idHash, sha256, type CanonicalRow } from '@/server/domain/schema/canonical';
import type { Field } from '@/server/domain/schema/fields';
import { ENTITY_NAMES, SPECS, type EntityName } from '@/server/domain/schema/registry';
import type { EntitySource } from '@/server/ports/portability';

export interface RowDiff {
  idHash: string;
  kind: 'only-a' | 'only-b' | 'changed';
  /** Changed field paths (`changed` only), undeclared keys as `#<hash>`. */
  paths: string[];
}

export interface EntityParity {
  entity: EntityName;
  rowsA: number;
  rowsB: number;
  /** Buckets whose hash of hashes differ. */
  buckets: number;
  diffs: RowDiff[];
}

export interface ParityReport {
  entities: EntityParity[];
  /** Whether every entity matched. */
  same: boolean;
}

const keyHash = (key: string) => `#${sha256(key).slice(0, 8)}`;

type Shape = { fields: Readonly<Record<string, Field>> } | Field | null;

function sub(shape: Shape, key: string): { shape: Shape; name: string } {
  const fields = shape && 'fields' in shape ? shape.fields : null;
  if (fields && fields[key]) return { shape: fields[key], name: key };
  if (shape && 'kind' in shape && shape.kind === 'map') return { shape: shape.of, name: keyHash(key) };
  return { shape: null, name: keyHash(key) };
}

/** Field paths where two canonical values differ. */
export function diffPaths(a: unknown, b: unknown, shape: Shape, path = '', top = true): string[] {
  if (canonicalJson(a ?? null) === canonicalJson(b ?? null)) return [];
  const isObj = (v: unknown) => !!v && typeof v === 'object' && !Array.isArray(v);
  if (isObj(a) && isObj(b)) {
    const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])].sort();
    return keys.flatMap((k) => {
      // Top-level field names are the code's own; deeper undeclared keys may be anyone's id.
      const { shape: s, name } = top
        ? {
            shape: (shape && 'fields' in shape ? shape.fields[k] : null) ?? null,
            name: k,
          }
        : sub(shape, k);
      return diffPaths((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], s, path ? `${path}.${name}` : name, false);
    });
  }
  if (Array.isArray(a) && Array.isArray(b) && a.length === b.length) {
    const of = shape && 'kind' in shape && shape.kind === 'list' ? shape.of : null;
    return a.flatMap((v, i) => diffPaths(v, b[i], of, `${path}[${i}]`, false));
  }
  return [path || '(row)'];
}

interface Indexed {
  rows: Map<string, string>;
  buckets: Map<string, string[]>;
}

async function index(source: EntitySource, entity: EntityName): Promise<Indexed> {
  const rows = new Map<string, string>();
  for await (const read of source.read(entity)) rows.set(String(read.row._id), canonicalJson(read.row));
  const buckets = new Map<string, string[]>();
  for (const id of [...rows.keys()].sort(compareIds)) {
    const b = bucketOf(id);
    buckets.set(b, [...(buckets.get(b) ?? []), sha256(rows.get(id)!)]);
  }
  return { rows, buckets };
}

export async function parity(a: EntitySource, b: EntitySource, entities: readonly EntityName[] = ENTITY_NAMES): Promise<ParityReport> {
  const out: EntityParity[] = [];
  for (const entity of entities) {
    const [ia, ib] = [await index(a, entity), await index(b, entity)];
    const differ = new Set<string>();
    for (const bucket of new Set([...ia.buckets.keys(), ...ib.buckets.keys()])) {
      if ((ia.buckets.get(bucket) ?? []).join() !== (ib.buckets.get(bucket) ?? []).join()) differ.add(bucket);
    }
    const diffs: RowDiff[] = [];
    const ids = [...new Set([...ia.rows.keys(), ...ib.rows.keys()])].filter((id) => differ.has(bucketOf(id))).sort(compareIds);
    for (const id of ids) {
      const [ra, rb] = [ia.rows.get(id), ib.rows.get(id)];
      if (ra === rb) continue;
      if (ra === undefined) diffs.push({ idHash: idHash(id), kind: 'only-b', paths: [] });
      else if (rb === undefined) diffs.push({ idHash: idHash(id), kind: 'only-a', paths: [] });
      else
        diffs.push({
          idHash: idHash(id),
          kind: 'changed',
          paths: diffPaths(JSON.parse(ra) as CanonicalRow, JSON.parse(rb) as CanonicalRow, SPECS[entity].schema),
        });
    }
    out.push({
      entity,
      rowsA: ia.rows.size,
      rowsB: ib.rows.size,
      buckets: differ.size,
      diffs,
    });
  }
  return {
    entities: out,
    same: out.every((e) => e.rowsA === e.rowsB && e.buckets === 0),
  };
}

/** The report as lines: entity, counts, then each differing row's id hash and paths. Never a value. */
export function formatParity(report: ParityReport): string[] {
  const lines: string[] = [];
  for (const e of report.entities) {
    if (e.rowsA === e.rowsB && e.buckets === 0) continue;
    lines.push(`${e.entity}\trows ${e.rowsA} / ${e.rowsB}\tbuckets differing ${e.buckets}`);
    for (const d of e.diffs) lines.push(`${e.entity}\t${d.idHash}\t${d.kind}${d.paths.length ? `\t${d.paths.join(',')}` : ''}`);
  }
  lines.push(report.same ? 'parity: same' : `parity: ${report.entities.filter((e) => e.rowsA !== e.rowsB || e.buckets).length} entities differ`);
  return lines;
}
