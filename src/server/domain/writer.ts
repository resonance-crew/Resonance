import type { MapOpInput } from '@/lib/api/v1/schemas';
import type { MapEdgeRow, MapGroupRow, MapItems, MapKeys, MapNodeRow, MapWrite } from '@/server/ports/repos/writer';

/**
 * The writer's pure policy (任務 #3 Phase 2, lane 2a-writer): what a batch of
 * thought-map ops does to the map, and the `rev` rule that orders a draft's
 * autosaves now that Firestore's own write order no longer does.
 */

/** How long an applied autosave stays in its draft's patch log (`expireAt`, Firestore's TTL deletes it). */
export const DRAFT_LOG_DAYS = 7;

export function draftLogExpiry(at: Date): Date {
  return new Date(at.getTime() + DRAFT_LOG_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Whether a save numbered `rev` applies over the stored count: only a higher
 * one. A save that arrives after a later one (or is sent twice) changes
 * nothing, so the words that land are always the newest the client sent.
 * A stored count that isn't a whole number counts as none (0).
 */
export function revApplies(stored: unknown, rev: number): boolean {
  return rev > storedRev(stored);
}

export function storedRev(stored: unknown): number {
  return typeof stored === 'number' && Number.isSafeInteger(stored) && stored > 0 ? stored : 0;
}

/** An arrow's id: `{source}_{target}` (the rules' edges/{edgeId}). */
export const edgeIdOf = (source: string, target: string) => `${source}_${target}`;

/** What the ops of a batch name, to be read before it applies: the items themselves, and what removals reach. */
export function mapReadsOf(ops: readonly MapOpInput[]): { keys: MapKeys; removedCards: string[]; removedGroups: string[] } {
  const nodes = new Set<string>();
  const edges = new Set<string>();
  const groups = new Set<string>();
  const removedCards = new Set<string>();
  const removedGroups = new Set<string>();
  for (const op of ops) {
    switch (op.op) {
      case 'addNode':
      case 'moveNode':
      case 'setNodeGroup':
        nodes.add(op.cardId);
        break;
      case 'removeNode':
        nodes.add(op.cardId);
        removedCards.add(op.cardId);
        break;
      case 'addEdge':
        edges.add(edgeIdOf(op.sourceCardId, op.targetCardId));
        break;
      case 'setEdgeLabel':
      case 'removeEdge':
        edges.add(op.id);
        break;
      case 'addGroup':
      case 'updateGroup':
        groups.add(op.groupId);
        break;
      case 'removeGroup':
        groups.add(op.groupId);
        removedGroups.add(op.groupId);
        break;
    }
  }
  return { keys: { nodes: [...nodes], edges: [...edges], groups: [...groups] }, removedCards: [...removedCards], removedGroups: [...removedGroups] };
}

/** A batch refused whole: one op asks what the map never takes (an arrow from a card to itself). */
export class MapOpRefused extends Error {
  constructor(
    readonly index: number,
    message: string,
  ) {
    super(message);
  }
}

type Kind = 'node' | 'edge' | 'group';
interface Tracked<T> {
  row: T | null;
  /** Written whole in this batch (and not deleted after). */
  created: boolean;
  changed: Set<string>;
  touched: boolean;
}

/**
 * Apply `ops` in order to the map as read (`items`: every item an op names,
 * every arrow touching a removed card, every node in a removed group) and
 * answer the documents to write — each touched one once, as the batch leaves
 * it — with the ops that changed something and those skipped (what they
 * change isn't there). Throws MapOpRefused for an op the map never takes.
 */
export function planMapOps(items: MapItems, ops: readonly MapOpInput[]): { writes: MapWrite[]; applied: number; skipped: number[] } {
  const tables: Record<Kind, Map<string, Tracked<MapNodeRow | MapEdgeRow | MapGroupRow>>> = { node: new Map(), edge: new Map(), group: new Map() };
  const seed = (kind: Kind, rows: { id: string }[]) => {
    for (const row of rows) tables[kind].set(row.id, { row: { ...row } as never, created: false, changed: new Set(), touched: false });
  };
  seed('node', items.nodes);
  seed('edge', items.edges);
  seed('group', items.groups);
  const slot = (kind: Kind, id: string) => {
    let t = tables[kind].get(id);
    if (!t) tables[kind].set(id, (t = { row: null, created: false, changed: new Set(), touched: false }));
    return t;
  };
  const create = (kind: Kind, id: string, row: MapNodeRow | MapEdgeRow | MapGroupRow) => {
    const t = slot(kind, id);
    Object.assign(t, { row, created: true, touched: true });
    t.changed.clear();
  };
  /** Change fields of a row that is there; false when it isn't. */
  const change = (kind: Kind, id: string, fields: Record<string, unknown>) => {
    const t = tables[kind].get(id);
    if (!t?.row) return false;
    Object.assign(t.row, fields);
    for (const k of Object.keys(fields)) t.changed.add(k);
    t.touched = true;
    return true;
  };
  const remove = (kind: Kind, id: string) => {
    const t = tables[kind].get(id);
    if (!t?.row) return false;
    Object.assign(t, { row: null, created: false, touched: true });
    t.changed.clear();
    return true;
  };

  let applied = 0;
  const skipped: number[] = [];
  ops.forEach((op, index) => {
    let did = false;
    switch (op.op) {
      case 'addNode':
        create('node', op.cardId, { id: op.cardId, cardId: op.cardId, x: op.x, y: op.y, groupId: null, createdAt: null, updatedAt: null });
        did = true;
        break;
      case 'moveNode':
        did = change('node', op.cardId, { x: op.x, y: op.y, ...(op.groupId !== undefined ? { groupId: op.groupId } : {}) });
        break;
      case 'setNodeGroup':
        did = change('node', op.cardId, { groupId: op.groupId ?? null });
        break;
      case 'removeNode': {
        did = remove('node', op.cardId);
        for (const [id, t] of tables.edge) {
          const e = t.row as MapEdgeRow | null;
          if (e && (e.sourceCardId === op.cardId || e.targetCardId === op.cardId)) did = remove('edge', id) || did;
        }
        break;
      }
      case 'addEdge': {
        if (op.sourceCardId === op.targetCardId) throw new MapOpRefused(index, 'An arrow joins two different cards.');
        const id = edgeIdOf(op.sourceCardId, op.targetCardId);
        create('edge', id, { id, sourceCardId: op.sourceCardId, targetCardId: op.targetCardId, label: op.label ?? '', createdAt: null });
        did = true;
        break;
      }
      case 'setEdgeLabel':
        did = change('edge', op.id, { label: op.label });
        break;
      case 'removeEdge':
        did = remove('edge', op.id);
        break;
      case 'addGroup': {
        const { groupId, title, hue, x, y, w, h } = op;
        create('group', groupId, { id: groupId, title, hue, x, y, w, h, createdAt: null });
        did = true;
        break;
      }
      case 'updateGroup': {
        const { op: _kind, groupId, ...fields } = op;
        did = change('group', groupId, fields);
        break;
      }
      case 'removeGroup': {
        did = remove('group', op.groupId);
        for (const [id, t] of tables.node) {
          if ((t.row as MapNodeRow | null)?.groupId === op.groupId) did = change('node', id, { groupId: null }) || did;
        }
        break;
      }
    }
    if (did) applied++;
    else skipped.push(index);
  });

  const writes: MapWrite[] = [];
  for (const kind of ['node', 'edge', 'group'] as const) {
    for (const [id, t] of tables[kind]) {
      if (!t.touched) continue;
      if (!t.row) writes.push({ kind, id, write: 'delete' });
      else if (t.created) writes.push(createWrite(kind, id, t.row));
      else if (t.changed.size) writes.push(changeWrite(kind, id, t.row, t.changed));
    }
  }
  return { writes, applied, skipped };
}

function createWrite(kind: Kind, id: string, row: MapNodeRow | MapEdgeRow | MapGroupRow): MapWrite {
  if (kind === 'node') {
    const n = row as MapNodeRow;
    return { kind, id, write: 'create', fields: { cardId: n.cardId, x: n.x, y: n.y, groupId: n.groupId } };
  }
  if (kind === 'edge') {
    const e = row as MapEdgeRow;
    return { kind, id, write: 'create', fields: { sourceCardId: e.sourceCardId, targetCardId: e.targetCardId, label: e.label } };
  }
  const g = row as MapGroupRow;
  return { kind, id, write: 'create', fields: { title: g.title, hue: g.hue, x: g.x, y: g.y, w: g.w, h: g.h } };
}

function changeWrite(kind: Kind, id: string, row: MapNodeRow | MapEdgeRow | MapGroupRow, changed: Set<string>): MapWrite {
  const fields = Object.fromEntries([...changed].map((k) => [k, (row as unknown as Record<string, unknown>)[k]]));
  return { kind, id, write: 'change', fields } as MapWrite;
}

/** A stored node, edge or group with the clients' defaults for what it lacks (client/thoughtMap.ts mapNode, …). */
export function nodeRowOf(id: string, data: Record<string, unknown>): MapNodeRow {
  return {
    id,
    cardId: typeof data.cardId === 'string' ? data.cardId : id,
    x: num(data.x, 0),
    y: num(data.y, 0),
    groupId: typeof data.groupId === 'string' ? data.groupId : null,
    createdAt: dateOf(data.createdAt),
    updatedAt: dateOf(data.updatedAt),
  };
}

export function edgeRowOf(id: string, data: Record<string, unknown>): MapEdgeRow {
  return {
    id,
    sourceCardId: typeof data.sourceCardId === 'string' ? data.sourceCardId : '',
    targetCardId: typeof data.targetCardId === 'string' ? data.targetCardId : '',
    label: typeof data.label === 'string' ? data.label : '',
    createdAt: dateOf(data.createdAt),
  };
}

export function groupRowOf(id: string, data: Record<string, unknown>): MapGroupRow {
  return {
    id,
    title: typeof data.title === 'string' ? data.title : '',
    hue: num(data.hue, 55),
    x: num(data.x, 0),
    y: num(data.y, 0),
    w: num(data.w, 320),
    h: num(data.h, 240),
    createdAt: dateOf(data.createdAt),
  };
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const dateOf = (v: unknown) => (v instanceof Date && !Number.isNaN(v.getTime()) ? v : null);
