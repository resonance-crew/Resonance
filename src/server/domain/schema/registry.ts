/**
 * Every collection the service keeps, and what an account deletion and an
 * account export do with each (plan section 3.7, CLAUDE.md zero-exception
 * #10). The purge plan (`purgePlan()`) and the export's sections
 * (`EXPORT_SECTIONS`) are derived from it; `registry.test.ts` holds it to
 * `firebase/firestore.rules` and to every collection the code names, so a
 * new collection that is not registered — or that stores a uid nobody
 * deletes — is a red test, not a reviewer's memory.
 *
 * Pure data: no I/O, no vendor. Each adapter (Firestore today, memory in the
 * unit tests, PostgreSQL later) turns the plan into its own queries.
 *
 * A person field (`uid`) is written as:
 * - `'$id'`     the document's id is the account's uid (`users/{uid}`);
 * - `'$parent'` the parent document's id is (`users/{uid}/bookmarks/*`): it goes with that tree;
 * - `'field'`   equality on the field (`where(field, '==', uid)`);
 * - `'field[]'` the field is an array holding uids (`where(field, 'array-contains', uid)`).
 */

import type { EntitySchema } from './fields';
import { SCHEMAS } from './entities';

export type PurgeKind =
  /** The document `{uid}` and everything under it, deleted last (the profile among them). */
  | 'root'
  /** Documents found by a person field, deleted with everything under them, first (cards, conversations). */
  | 'tree'
  /** Documents found by each person field (a collection group query for a subcollection), deleted one by one. */
  | 'rows'
  /** Lives under a parent's tree or root and goes with it. */
  | 'subtree'
  /** Written by the purge or kept by design; holds no uid. */
  | 'kept'
  /** The deletion request itself: removed at the very end, once everything else went. */
  | 'last'
  /** Holds no uid; the purge never touches it. */
  | 'none';

/**
 * The purge's explicit steps (code in the app service and the adapters,
 * named here so the registry says which entity needs which).
 */
export type PurgeStep =
  /** Their uploaded pictures' files go before the records listing them (`uploadedKeys`, `deleteStorageObjects`). */
  | 'uploadFiles'
  /** Chat pictures they sent or were sent: files then records, a page at a time (`deleteChatImageFiles`). */
  | 'chatPictureFiles'
  /** Records found through one of their cards go just before that card (`byCard`). */
  | 'byCard'
  /** A purged card's id stays dead (`cardTombstones`) and its slug retired (`retiredSlugs`). */
  | 'retireCard'
  /** The cached pages that showed the account: its published cards and its profile. */
  | 'pages'
  /** Their pen name is held for no one before its reservation goes (`handleHolds`). */
  | 'holdHandle'
  /** They are taken out of others' `resonance_tap` bell rows (`purgeTapRows`), a row left with no one goes. */
  | 'tapRows'
  /** Older uploads under `image/{uid}/` and `video/{uid}/` (`deleteStoragePrefix`). */
  | 'storagePrefixes'
  /** The sign-in account (`deleteAuthUser`). */
  | 'authUser';

/** The export's sections, in the file's order (lib/account/export AccountExport). */
export type ExportSectionKey =
  | 'profile'
  | 'cards'
  | 'bookmarks'
  | 'thoughtMap.nodes'
  | 'thoughtMap.edges'
  | 'thoughtMap.groups'
  | 'notesSent'
  | 'messagesSent'
  | 'cardsResonated'
  | 'reading';

export interface EntitySpec<Name extends string = string> {
  /** A subcollection's parent entity. */
  parent?: Name;
  /** The fields that name a person and go with the account (see the module's comment for `$id`, `$parent`, `[]`). */
  uid: readonly string[];
  /** Required when `uid` is empty: why the entity holds no uid of anyone. */
  note?: string;
  purge: PurgeKind;
  /** The field holding a card's id: the entity's records on the account's cards go just before the card (step `byCard`). */
  byCard?: string;
  /** Person fields the purge handles with a step instead of deleting the record (notifications' `payload.fromUserIds[]`). */
  special?: Readonly<Record<string, PurgeStep>>;
  /** Steps the entity needs beside its query. */
  steps?: readonly PurgeStep[];
  /** Person fields deliberately left behind, each with its reason. */
  kept?: Readonly<Record<string, string>>;
  /** The export section the entity feeds, or `'none'`. */
  export: ExportSectionKey | 'none';
  /** The canonical storage schema (entities.ts, plan §4.1). */
  schema: EntitySchema;
  /** Its version: what an export's rows carry as `_v` (equal to `schema.version`). */
  version: number;
}

const NO_UID = 'holds no uid';

/** An entry's canonical schema and its version (entities.ts; scripts/portability writes `_v` from it). */
const S = <N extends keyof typeof SCHEMAS>(name: N) => ({ schema: SCHEMAS[name], version: SCHEMAS[name].version });

export const ENTITIES = {
  // --- users ---
  users: { ...S('users'), uid: ['$id'], purge: 'root', steps: ['pages'], export: 'profile' },
  bookmarks: { ...S('bookmarks'),
    parent: 'users',
    uid: ['$parent'],
    purge: 'subtree',
    // Other people's bookmarks of the account's cards hold only the card's id (no uid): the card goes under a
    // tombstone and their shelf drops what no longer resolves — the bookmark is theirs, not this account's.
    export: 'bookmarks',
  },
  blocks: { ...S('blocks'),
    parent: 'users',
    // Their own blocks go with users/{uid}; others' blocks of them (users/{other}/blocks/{uid}) by `blockedUid`.
    uid: ['$parent', 'blockedUid'],
    purge: 'rows',
    export: 'none',
  },
  handles: { ...S('handles'), uid: ['uid'], purge: 'rows', steps: ['holdHandle'], export: 'none' },
  // The signal channel's counters (Phase 2, ports/realtime.ts): the account's own document goes with it. Others'
  // `threads.{pair}` keys name a conversation with it, which the purge takes whole (a stale counter refetches nothing).
  signals: { ...S('signals'), uid: ['$id'], purge: 'root', export: 'none' },
  handleHolds: { ...S('handleHolds'), uid: ['heldFor'], purge: 'rows', export: 'none' },

  // --- cards ---
  cards: { ...S('cards'), uid: ['authorId'], purge: 'tree', steps: ['byCard', 'retireCard', 'pages'], export: 'cards' },
  edits: { ...S('edits'),
    parent: 'cards',
    // Goes with its card's tree; one an older app's client-side delete left without its card is found by `authorId`.
    uid: ['authorId'],
    purge: 'rows',
    export: 'none',
  },
  translations: { ...S('translations'), parent: 'cards', uid: [], note: `${NO_UID}: the server's translation of a story, with its card's tree`, purge: 'subtree', export: 'none' },
  draftLog: { ...S('draftLog'),
    parent: 'cards',
    // A draft's applied autosaves, 7 days (TTL `expireAt`): with its card's tree, after a delete for good (deleteCard),
    // and by `authorId` when an older app deleted its draft from the client.
    uid: ['authorId'],
    purge: 'rows',
    export: 'none',
  },
  cardTombstones: { ...S('cardTombstones'), uid: [], note: `${NO_UID}: a purged card's id, kept dead for good (retireCard)`, purge: 'kept', export: 'none' },
  retiredSlugs: { ...S('retiredSlugs'), uid: [], note: `${NO_UID}: a purged card's slug, retired for good (retireCard)`, purge: 'kept', export: 'none' },
  cardLinks: { ...S('cardLinks'), uid: ['sourceAuthorId', 'targetAuthorId'], purge: 'rows', export: 'none' },

  // --- graph ---
  connections: { ...S('connections'), uid: ['userIds[]'], purge: 'rows', export: 'none' },
  connectionOrigins: { ...S('connectionOrigins'), uid: ['userIds[]'], purge: 'rows', export: 'none' },
  invites: { ...S('invites'), uid: ['fromUserId', 'toUserId'], purge: 'rows', export: 'none' },
  letters: { ...S('letters'), uid: ['from', 'to'], purge: 'rows', export: 'none' },
  resonances: { ...S('resonances'), uid: ['userId'], purge: 'rows', byCard: 'cardId', export: 'none' },
  notes: { ...S('notes'), uid: ['fromUserId', 'toUserId', 'withheldFor'], purge: 'rows', byCard: 'cardId', export: 'notesSent' },

  // --- conversations ---
  conversations: { ...S('conversations'), uid: ['participants[]'], purge: 'tree', export: 'none' },
  messages: { ...S('messages'),
    parent: 'conversations',
    // Every message is in a conversation of two, which goes whole with either of them.
    uid: ['senderId'],
    purge: 'subtree',
    export: 'messagesSent',
  },
  unsentMessages: { ...S('unsentMessages'), uid: ['senderId', 'to'], purge: 'rows', export: 'none' },
  privateShares: { ...S('privateShares'), uid: ['authorId'], purge: 'rows', export: 'none' },
  chatImages: { ...S('chatImages'), uid: ['senderId', 'to'], purge: 'rows', steps: ['chatPictureFiles'], export: 'none' },

  // --- taps, reading ---
  cardReads: { ...S('cardReads'), uid: ['userId'], purge: 'rows', byCard: 'cardId', export: 'none' },
  resonanceTaps: { ...S('resonanceTaps'), uid: ['userId'], purge: 'rows', byCard: 'cardId', export: 'cardsResonated' },
  readerSignals: { ...S('readerSignals'), uid: ['userId'], purge: 'rows', byCard: 'cardId', export: 'reading' },

  // --- bell ---
  notifications: { ...S('notifications'),
    uid: ['userId', 'payload.fromUserId', 'payload.fromUserIds[]'],
    purge: 'rows',
    special: { 'payload.fromUserIds[]': 'tapRows' },
    export: 'none',
  },

  // --- thought map ---
  thoughtMaps: { ...S('thoughtMaps'), uid: ['$id'], purge: 'root', export: 'none' },
  nodes: { ...S('nodes'), parent: 'thoughtMaps', uid: ['$parent'], purge: 'subtree', export: 'thoughtMap.nodes' },
  edges: { ...S('edges'), parent: 'thoughtMaps', uid: ['$parent'], purge: 'subtree', export: 'thoughtMap.edges' },
  groups: { ...S('groups'), parent: 'thoughtMaps', uid: ['$parent'], purge: 'subtree', export: 'thoughtMap.groups' },

  // --- safety ---
  reports: { ...S('reports'),
    uid: ['reporterId'],
    purge: 'rows',
    kept: {
      targetUserId: 'a report filed against the account is moderation history, kept',
      targetId: 'what a report filed against the account names (a user or a message), kept with it',
    },
    export: 'none',
  },
  // The copy of what was reported goes with either side: it is the reported person's writing.
  reportEvidence: { ...S('reportEvidence'), uid: ['reporterId', 'targetUserId'], purge: 'rows', export: 'none' },
  accountDeletions: { ...S('accountDeletions'), uid: ['$id'], purge: 'last', steps: ['storagePrefixes', 'authUser'], export: 'none' },

  // --- infra ---
  rateLimits: { ...S('rateLimits'), uid: ['userId'], purge: 'rows', export: 'none' },
  quotas: { ...S('quotas'), uid: ['userId'], purge: 'rows', export: 'none' },
  uploads: { ...S('uploads'), uid: ['ownerId'], purge: 'rows', steps: ['uploadFiles'], export: 'none' },
  config: { ...S('config'), uid: [], note: `${NO_UID}: the service's settings (storage, recommendPool)`, purge: 'none', export: 'none' },
  // The outbox (Phase 3, domain/outbox.ts): which row a transaction wrote, never its content. A row id may be or
  // hold a uid (`users/{uid}`, `resonanceTaps/{card}_{uid}`); the replicator needs it plain, so `userIds` lists the
  // id's segments and the account's entries go by it. Kept 7 days at most (TTL `expireAt`).
  changeLog: { ...S('changeLog'), uid: ['userIds[]'], purge: 'rows', export: 'none' },

  // --- sessions (Phase 3, ADR 0004: server-only) ---
  // Which provider's subject is which account (`firebase_<uid>` → the same uid), and the refresh tokens by their hash.
  identities: { ...S('identities'), uid: ['userId'], purge: 'rows', export: 'none' },
  refreshTokens: { ...S('refreshTokens'), uid: ['uid'], purge: 'rows', export: 'none' },

  // --- push ---
  devices: { ...S('devices'), uid: ['userId'], purge: 'rows', export: 'none' },
  notificationSettings: { ...S('notificationSettings'), uid: ['$id'], purge: 'root', export: 'none' },
  pickPushes: { ...S('pickPushes'), uid: ['$id'], purge: 'root', export: 'none' },
  connectionCardPushes: { ...S('connectionCardPushes'), uid: ['$id'], purge: 'root', export: 'none' },

  // --- recommend ---
  cardVectors: { ...S('cardVectors'), uid: ['authorId'], purge: 'rows', export: 'none' },
  cardSignatures: { ...S('cardSignatures'), uid: ['authorId'], purge: 'rows', export: 'none' },
  userProfiles: { ...S('userProfiles'), uid: ['$id'], purge: 'root', export: 'none' },
  recommendations: { ...S('recommendations'), uid: ['$id'], purge: 'root', export: 'none' },
} as const satisfies Record<string, EntitySpec>;

export type EntityName = keyof typeof ENTITIES;

/** The registry, typed as specs (the literal types above are for EntityName). */
export const SPECS: Readonly<Record<EntityName, EntitySpec<EntityName>>> = ENTITIES;

export const ENTITY_NAMES = Object.keys(ENTITIES) as EntityName[];

/** A person field as a query: the field and how it names the uid. */
export interface PersonQuery {
  entity: EntityName;
  field: string;
  op: '==' | 'array-contains';
  /** A subcollection's rows are found across every parent (a collection group query). */
  group: boolean;
}

export function personQuery(entity: EntityName, field: string): PersonQuery {
  const array = field.endsWith('[]');
  return {
    entity,
    field: array ? field.slice(0, -2) : field,
    op: array ? 'array-contains' : '==',
    group: SPECS[entity].parent !== undefined,
  };
}

/** Whether a `uid` entry is a field to query (rather than `$id` / `$parent`). */
export function isQueriedField(field: string): boolean {
  return !field.startsWith('$');
}

export interface PurgePlan {
  /** Collections whose document `{uid}` goes with everything under it, last. */
  roots: EntityName[];
  /** Documents found by a person field, deleted with what is under them, first. */
  trees: PersonQuery[];
  /** Single records found by a person field. */
  rows: PersonQuery[];
  /** Records found through the account's cards (`field in [card ids]`), deleted just before their card. */
  byCard: { entity: EntityName; field: string }[];
  /** The deletion request: removed at the very end. */
  last: EntityName[];
  /** Every explicit step some entity needs, and which entities need it. */
  steps: Map<PurgeStep, EntityName[]>;
}

/** The purge, derived from the registry (registration order). */
export function purgePlan(): PurgePlan {
  const plan: PurgePlan = { roots: [], trees: [], rows: [], byCard: [], last: [], steps: new Map() };
  const step = (s: PurgeStep, entity: EntityName) => plan.steps.set(s, [...(plan.steps.get(s) ?? []), entity]);
  for (const entity of ENTITY_NAMES) {
    const spec = SPECS[entity];
    const special = spec.special ?? {};
    for (const s of spec.steps ?? []) step(s, entity);
    for (const s of Object.values(special)) step(s, entity);
    if (spec.byCard) plan.byCard.push({ entity, field: spec.byCard });
    const fields = spec.uid.filter((f) => isQueriedField(f) && !(f in special));
    switch (spec.purge) {
      case 'root':
        plan.roots.push(entity);
        break;
      case 'last':
        plan.last.push(entity);
        break;
      case 'tree':
        plan.trees.push(...fields.map((f) => personQuery(entity, f)));
        break;
      case 'rows':
        plan.rows.push(...fields.map((f) => personQuery(entity, f)));
        break;
      default:
        break;
    }
  }
  return plan;
}

/** The export's sections, in the file's order: the entity each reads and how it finds the account's rows. */
export interface ExportSection {
  key: ExportSectionKey;
  entity: EntityName;
  /**
   * `doc` — the document `{uid}`; `under` — the subcollection of the document `{uid}` of its parent;
   * `where` — rows whose `field` is the uid; `inTrees` — rows of a subcollection under each of the
   * account's `parent` trees whose `field` is the uid (tagged with the tree's id as `tag`).
   */
  find:
    | { kind: 'doc' }
    | { kind: 'under' }
    | { kind: 'where'; field: string }
    | { kind: 'inTrees'; field: string; tag: string };
  /** Fields the section leaves out of each row. */
  omit?: readonly string[];
}

/**
 * What a note of yours keeps in your export: your words, the card you left
 * them on and when — never whom they reached, nor whether they were read.
 * Every note alike, so no difference between two of them says anything: a
 * note on an anonymous card names its author, one withheld across a block
 * reached no one (`withheldFor` names whom it was withheld from), and a card
 * named now may have been anonymous then.
 */
export const NOTE_OMIT = ['toUserId', 'readAt', 'withheldFor'] as const;
/** The account's reading records keep what was kept, without the daily counts. */
export const READING_OMIT = ['userId', 'reportDay', 'reportsToday', 'expireAt'] as const;

export const EXPORT_SECTIONS: readonly ExportSection[] = [
  { key: 'profile', entity: 'users', find: { kind: 'doc' } },
  { key: 'cards', entity: 'cards', find: { kind: 'where', field: 'authorId' } },
  { key: 'bookmarks', entity: 'bookmarks', find: { kind: 'under' } },
  { key: 'thoughtMap.nodes', entity: 'nodes', find: { kind: 'under' } },
  { key: 'thoughtMap.edges', entity: 'edges', find: { kind: 'under' } },
  { key: 'thoughtMap.groups', entity: 'groups', find: { kind: 'under' } },
  { key: 'notesSent', entity: 'notes', find: { kind: 'where', field: 'fromUserId' }, omit: NOTE_OMIT },
  { key: 'messagesSent', entity: 'messages', find: { kind: 'inTrees', field: 'senderId', tag: 'conversationId' } },
  { key: 'cardsResonated', entity: 'resonanceTaps', find: { kind: 'where', field: 'userId' } },
  { key: 'reading', entity: 'readerSignals', find: { kind: 'where', field: 'userId' }, omit: READING_OMIT },
];

export function exportSection(key: ExportSectionKey): ExportSection {
  const section = EXPORT_SECTIONS.find((s) => s.key === key);
  if (!section) throw new Error(`no export section ${key}`);
  return section;
}
