import type { CardRow } from './cards';

/**
 * The `writer` aggregate's repositories (任務 #3 Phase 2, lane 2a-writer):
 * what the clients wrote straight to Firestore while someone writes — the
 * thought map (`thoughtMaps/{uid}/{nodes,edges,groups}`), a draft card's
 * creation and autosaves (`cards/{id}`, its patch log
 * `cards/{id}/draftLog/{rev}`), and a published card's pending edit
 * (`cards/{id}/edits/current`). The services are src/server/app/writer.ts;
 * the policy (limits, the `rev` rule, what an op does) src/server/domain/writer.ts.
 *
 * Methods take and answer domain types (`Date`, plain objects), never a
 * Firestore `DocumentData`, `Timestamp`, reference, snapshot, `Transaction`
 * or `FieldValue`. Writes take the service's `at`; Firestore stamps its own
 * server time instead.
 */

/** A node as stored: `{ cardId, x, y, groupId, createdAt, updatedAt }` (times as Date, absent when the doc has none). */
export interface MapNodeRow {
  id: string;
  cardId: string;
  x: number;
  y: number;
  groupId: string | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface MapEdgeRow {
  id: string;
  sourceCardId: string;
  targetCardId: string;
  label: string;
  createdAt: Date | null;
}

export interface MapGroupRow {
  id: string;
  title: string;
  hue: number;
  x: number;
  y: number;
  w: number;
  h: number;
  createdAt: Date | null;
}

/** A whole map, or the part of it a batch reads. */
export interface MapItems {
  nodes: MapNodeRow[];
  edges: MapEdgeRow[];
  groups: MapGroupRow[];
}

/** The ids a batch of ops names, by kind. */
export interface MapKeys {
  nodes: readonly string[];
  edges: readonly string[];
  groups: readonly string[];
}

/**
 * One document a batch writes: `create` writes it whole (stamped `createdAt` now, and a node's `updatedAt`),
 * `change` only the fields named (a node's `updatedAt` stamped now), `delete` removes it.
 */
export type MapWrite =
  | { kind: 'node'; id: string; write: 'create'; fields: { cardId: string; x: number; y: number; groupId: string | null } }
  | { kind: 'node'; id: string; write: 'change'; fields: Partial<Pick<MapNodeRow, 'x' | 'y' | 'groupId'>> }
  | { kind: 'edge'; id: string; write: 'create'; fields: { sourceCardId: string; targetCardId: string; label: string } }
  | { kind: 'edge'; id: string; write: 'change'; fields: { label: string } }
  | { kind: 'group'; id: string; write: 'create'; fields: Omit<MapGroupRow, 'id' | 'createdAt'> }
  | { kind: 'group'; id: string; write: 'change'; fields: Partial<Omit<MapGroupRow, 'id' | 'createdAt'>> }
  | { kind: 'node' | 'edge' | 'group'; id: string; write: 'delete' };

/** What answering a card (`referenceCardId`) depends on, read in the draft's transaction. */
export interface AnswerTarget {
  /** The original as stored (times as Date): `authorId`, `publishedAt`, `visibility`, `anonymous`, `trashedAt`. */
  card: CardRow;
  /** The writer and the original's author are connected. */
  connected: boolean;
  /** A block either way between the writer and the original's author. */
  blocked: boolean;
}

/** A new draft's stored fields (the rules' create: counters zeroed, unpublished, no translations). */
export interface NewDraft {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: string;
  anonymous: boolean;
  originalLocale?: string;
  media?: DraftCover;
  accentHue?: number | null;
  referenceCardId?: string;
}

/** A cover as a draft keeps it (the rules' validMedia). */
export interface DraftCover {
  type: string;
  url: string;
  /** The picture's storage key, kept beside the URL when it is that key on the current base (domain/media.ts mediaKeyFor). */
  key?: string;
  thumbUrl?: string;
  label?: string;
  frame?: { cx: number; cy: number; zoom: number; ar: number };
}

/** What an autosave changes: the fields sent (a cover replaced whole), and the fields it removes. */
export interface DraftPatch {
  set: Partial<{
    thoughtCore: string;
    story: string;
    tags: string[];
    visibility: string;
    anonymous: boolean;
    media: DraftCover;
    accentHue: number;
  }>;
  /** `media` is deleted; `accentHue` becomes null (as the clients' own writes leave it). */
  clear: readonly ('media' | 'accentHue')[];
}

/** A pending edit as written (beside its author): the whole working copy and its `rev`. */
export interface EditCopy {
  thoughtCore: string;
  story: string;
  tags: string[];
  visibility: string;
  anonymous: boolean;
  media?: DraftCover;
  accentHue: number | null;
  rev: number;
}

/** Inside `uow.run`: every read before any write (ports/uow.ts). */
export interface WriterTxRepo {
  /** The map items named in `keys`, those that are there. */
  getMapItems(uid: string, keys: MapKeys): Promise<MapItems>;
  /** Every arrow of `uid`'s map from or to one of `cardIds`. */
  edgesTouching(uid: string, cardIds: readonly string[]): Promise<MapEdgeRow[]>;
  /** Every node of `uid`'s map filed in one of `groupIds`. */
  nodesInGroups(uid: string, groupIds: readonly string[]): Promise<MapNodeRow[]>;
  /** Write a batch's documents (in order; the transaction lands them together). */
  writeMap(uid: string, writes: readonly MapWrite[], at: Date): void;

  /** The card as stored (times as Date), or null. */
  getCard(id: string): Promise<CardRow | null>;
  /**
   * The card without its words — only what an autosave asks of it (`DRAFT_HEAD_FIELDS`: whose it is, published or in
   * the trash, its draft's rev, its cover, its audience) — or null: a save every 1.5 s needn't read a story of up to
   * 200 000 characters to write it (the perf audit's BE-6).
   */
  getDraftHead(id: string): Promise<CardRow | null>;
  /** Whether `id` is a card deleted for good (`cardTombstones/{id}`). */
  isTombstoned(id: string): Promise<boolean>;
  /** The card `originalId` and the writer's ties to its author; null when there is no such card. */
  getAnswerTarget(uid: string, originalId: string): Promise<AnswerTarget | null>;
  /** Create the draft `id` (`createdAt`, `updatedAt` now; counters 0, `publishedAt` null, `translations` {}). */
  createDraft(id: string, author: string, draft: NewDraft, at: Date): void;
  /** Apply an autosave: the fields, `draftRev` = `rev`, `updatedAt` now. */
  patchDraft(id: string, patch: DraftPatch, rev: number, at: Date): void;
  /** Keep the autosave in the patch log `cards/{id}/draftLog/{rev}` until `expireAt`. */
  logDraftPatch(id: string, author: string, entry: { rev: number; patch: DraftPatch; expireAt: Date }, at: Date): void;

  /** The card's pending edit as stored (times as Date), or null. */
  getEdit(id: string): Promise<CardRow | null>;
  /** Replace the pending edit whole (`updatedAt` now). */
  putEdit(id: string, author: string, copy: EditCopy, at: Date): void;
  deleteEdit(id: string): void;
}

/** Outside a transaction. */
export interface WriterData {
  /** `uid`'s whole map (document-id order). */
  loadMap(uid: string): Promise<MapItems>;
  /** The card as stored (times as Date), or null. */
  getCard(id: string): Promise<CardRow | null>;
  /** The card's pending edit as stored (times as Date), or null. */
  getEdit(id: string): Promise<CardRow | null>;
  /** The card's patch log, by `rev` ascending (a test's and a rescue's read). */
  draftLog(id: string): Promise<{ rev: number; authorId: string; patch: DraftPatch; expireAt: Date | null }[]>;
  /** Delete the card's patch log (the card was deleted for good). */
  deleteDraftLog(id: string): Promise<void>;
}
