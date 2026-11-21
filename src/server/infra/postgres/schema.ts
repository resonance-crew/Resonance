/**
 * How each entity (src/server/domain/schema/registry.ts, plus the adapter's
 * own tables) lies in PostgreSQL: its table, its primary key read out of the
 * document id, and the fields that have a typed column of their own. Every
 * other field of a document goes, losslessly, into the table's `extra jsonb`
 * (Dates tagged as `{ "$t": iso }`), so a row read back is the document that
 * was written — what the replicator and the shadow reads rely on — while what
 * is queried, indexed, unique or checked is a real column
 * (migrations/0001_init.sql; `schema.test.ts` holds the two together).
 *
 * A value a typed column can't hold (a malformed `expiresAt` string, a
 * fractional `count`) is kept in `extra` under its field instead, the column
 * left null: the row still reads back as it was written.
 */

export type ColType = 'text' | 'int' | 'bigint' | 'real' | 'bool' | 'ts' | 'jsonb' | 'text[]' | 'vector';

/** A typed column: the field's column and its type; `pair` spreads a two-uid array (`userIds`) over two columns. */
export type ColSpec = { col: string; type: ColType } | { pair: [string, string] };

export interface KeyPart {
  col: string;
  /** An integer key part (`cardVectors.part`); text otherwise. */
  int?: boolean;
  /** The document field the key part also is (`resonanceTaps.cardId`): read back from the key. */
  field?: string;
}

export interface TableSpec {
  table: string;
  /** The primary key, in order; the document id is its parts joined by `sep`. */
  key: KeyPart[];
  /** `_` by default; `/` for a subcollection under its parent; `__` for the vector parts. */
  sep?: string;
  /** Which separator splits the id when a part may itself hold it: `first` (default) or `last` (`{pair}_{id}`). */
  split?: 'first' | 'last';
  cols: Record<string, ColSpec>;
}

const c = (col: string, type: ColType): ColSpec => ({ col, type });
const pk = (col: string, field?: string, int?: boolean): KeyPart => ({ col, ...(field ? { field } : {}), ...(int ? { int } : {}) });

/** Entity name (as the memory tables and the registry name them) → its table. */
export const PG_TABLES = {
  // --- users ---
  users: {
    table: 'users',
    key: [pk('id')],
    cols: {
      handle: c('handle', 'text'),
      handleLower: c('handle_lower', 'text'),
      bio: c('bio', 'text'),
      region: c('region', 'text'),
      primaryLocale: c('primary_locale', 'text'),
      autoTranslateTo: c('auto_translate_to', 'text'),
      avatarKey: c('avatar_key', 'text'),
      avatarUrl: c('avatar_url', 'text'),
      avatarSeed: c('avatar_seed', 'text'),
      initials: c('initials', 'text'),
      accentColor: c('accent_color', 'text'),
      hintsSeen: c('hints_seen', 'jsonb'),
      joinedAt: c('joined_at', 'ts'),
      updatedAt: c('updated_at', 'ts'),
    },
  },
  bookmarks: { table: 'bookmarks', key: [pk('user_id'), pk('card_id', 'cardId')], sep: '/', cols: { createdAt: c('created_at', 'ts') } },
  blocks: { table: 'blocks', key: [pk('owner_id'), pk('blocked_id', 'blockedUid')], sep: '/', cols: { createdAt: c('created_at', 'ts') } },
  handles: { table: 'handles', key: [pk('handle_lower')], cols: { uid: c('user_id', 'text'), handle: c('handle', 'text') } },
  signals: {
    table: 'signals',
    key: [pk('user_id')],
    cols: {
      v: c('v', 'int'),
      inbox: c('inbox', 'bigint'),
      bell: c('bell', 'bigint'),
      graph: c('graph', 'bigint'),
      map: c('map', 'bigint'),
      drafts: c('drafts', 'bigint'),
      threads: c('threads', 'jsonb'),
      at: c('at', 'ts'),
    },
  },
  handleHolds: { table: 'handle_holds', key: [pk('name')], cols: { heldFor: c('held_for', 'text'), until: c('until', 'ts') } },

  // --- cards ---
  cards: {
    table: 'cards',
    key: [pk('id')],
    cols: {
      authorId: c('author_id', 'text'),
      slug: c('slug', 'text'),
      title: c('title', 'text'),
      thoughtCore: c('thought_core', 'text'),
      story: c('story', 'text'),
      storyType: c('story_type', 'text'),
      visibility: c('visibility', 'text'),
      anonymous: c('anonymous', 'bool'),
      referenceCardId: c('reference_card_id', 'text'),
      publishedAt: c('published_at', 'ts'),
      createdAt: c('created_at', 'ts'),
      updatedAt: c('updated_at', 'ts'),
      excerpt: c('excerpt', 'text'),
      readMinutes: c('read_minutes', 'int'),
      readCount: c('read_count', 'int'),
      media: c('media', 'jsonb'),
      tags: c('tags', 'text[]'),
      signature: c('signature', 'jsonb'),
      indexPendingAt: c('index_pending_at', 'ts'),
      trashedAt: c('trashed_at', 'ts'),
      trashedFrom: c('trashed_from', 'jsonb'),
    },
  },
  edits: { table: 'card_edits', key: [pk('card_id'), pk('edit_id')], sep: '/', cols: { authorId: c('author_id', 'text'), updatedAt: c('updated_at', 'ts') } },
  translations: { table: 'card_translations', key: [pk('card_id'), pk('locale')], sep: '/', cols: { updatedAt: c('updated_at', 'ts') } },
  draftLog: { table: 'card_draft_log', key: [pk('card_id'), pk('rev')], sep: '/', cols: { authorId: c('author_id', 'text'), expireAt: c('expire_at', 'ts') } },
  cardTombstones: { table: 'card_tombstones', key: [pk('card_id')], cols: { at: c('at', 'ts') } },
  retiredSlugs: { table: 'retired_slugs', key: [pk('slug')], cols: { at: c('at', 'ts') } },
  cardLinks: {
    table: 'card_links',
    key: [pk('id')],
    cols: {
      sourceCardId: c('source_card_id', 'text'),
      targetCardId: c('target_card_id', 'text'),
      sourceAuthorId: c('source_author_id', 'text'),
      targetAuthorId: c('target_author_id', 'text'),
      createdAt: c('created_at', 'ts'),
    },
  },

  // --- graph ---
  connections: { table: 'connections', key: [pk('pair_id')], cols: { userIds: { pair: ['user_a', 'user_b'] }, establishedAt: c('established_at', 'ts') } },
  connectionOrigins: {
    table: 'connection_origins',
    key: [pk('pair_id')],
    cols: { userIds: { pair: ['user_a', 'user_b'] }, reasons: c('reasons', 'jsonb'), resonanceCards: c('resonance_cards', 'text[]') },
  },
  invites: {
    table: 'invites',
    key: [pk('id')],
    cols: {
      fromUserId: c('from_user_id', 'text'),
      toUserId: c('to_user_id', 'text'),
      status: c('status', 'text'),
      referenceCardId: c('reference_card_id', 'text'),
      createdAt: c('created_at', 'ts'),
      expiresAt: c('expires_at', 'ts'),
    },
  },
  letters: { table: 'letters', key: [pk('from_id', 'from'), pk('to_id', 'to')], cols: { count: c('count', 'int'), updatedAt: c('updated_at', 'ts') } },
  resonances: { table: 'legacy_resonances', key: [pk('id')], cols: { cardId: c('card_id', 'text'), userId: c('user_id', 'text'), createdAt: c('created_at', 'ts') } },
  notes: {
    table: 'notes',
    key: [pk('id')],
    cols: {
      cardId: c('card_id', 'text'),
      fromUserId: c('from_user_id', 'text'),
      toUserId: c('to_user_id', 'text'),
      withheldFor: c('withheld_for', 'text'),
      text: c('text', 'text'),
      createdAt: c('created_at', 'ts'),
      readAt: c('read_at', 'ts'),
    },
  },

  // --- conversations ---
  conversations: {
    table: 'conversations',
    key: [pk('pair_id')],
    cols: { participants: { pair: ['user_a', 'user_b'] }, lastMessage: c('last_message', 'jsonb'), request: c('request', 'jsonb'), updatedAt: c('updated_at', 'ts') },
  },
  messages: {
    table: 'messages',
    key: [pk('pair_id'), pk('id')],
    sep: '/',
    cols: { senderId: c('sender_id', 'text'), sentAt: c('sent_at', 'ts'), text: c('text', 'text'), kind: c('kind', 'text'), unsentAt: c('unsent_at', 'ts') },
  },
  unsentMessages: {
    table: 'unsent_messages',
    key: [pk('pair_id'), pk('message_id')],
    split: 'last',
    cols: { senderId: c('sender_id', 'text'), to: c('to_id', 'text'), unsentAt: c('unsent_at', 'ts') },
  },
  privateShares: { table: 'private_shares', key: [pk('card_id')], cols: { authorId: c('author_id', 'text') } },
  chatImages: {
    table: 'chat_images',
    key: [pk('id')],
    cols: { senderId: c('sender_id', 'text'), to: c('to_id', 'text'), key: c('key', 'text'), unsentAt: c('unsent_at', 'ts'), createdAt: c('created_at', 'ts') },
  },

  // --- taps, reading ---
  cardReads: { table: 'card_reads', key: [pk('user_id', 'userId'), pk('card_id', 'cardId')], cols: { day: c('day', 'text'), expireAt: c('expire_at', 'ts') } },
  resonanceTaps: {
    table: 'resonance_taps',
    key: [pk('card_id', 'cardId'), pk('user_id', 'userId')],
    cols: { on: c('on', 'bool'), at: c('at', 'ts'), rangAt: c('rang_at', 'ts') },
  },
  readerSignals: {
    table: 'reader_signals',
    key: [pk('user_id', 'userId'), pk('card_id', 'cardId')],
    cols: { expireAt: c('expire_at', 'ts'), expectedSeconds: c('expected_seconds', 'int'), reportDay: c('report_day', 'text'), reportsToday: c('reports_today', 'int') },
  },

  // --- bell ---
  notifications: {
    table: 'notifications',
    key: [pk('id')],
    cols: { userId: c('user_id', 'text'), type: c('type', 'text'), payload: c('payload', 'jsonb'), readAt: c('read_at', 'ts'), createdAt: c('created_at', 'ts') },
  },

  // --- thought map ---
  thoughtMaps: { table: 'thought_maps', key: [pk('user_id')], cols: { updatedAt: c('updated_at', 'ts') } },
  nodes: { table: 'map_nodes', key: [pk('user_id'), pk('id')], sep: '/', cols: { updatedAt: c('updated_at', 'ts') } },
  edges: { table: 'map_edges', key: [pk('user_id'), pk('id')], sep: '/', cols: { updatedAt: c('updated_at', 'ts') } },
  groups: { table: 'map_groups', key: [pk('user_id'), pk('id')], sep: '/', cols: { updatedAt: c('updated_at', 'ts') } },

  // --- safety ---
  reports: {
    table: 'reports',
    key: [pk('id')],
    cols: { reporterId: c('reporter_id', 'text'), targetUserId: c('target_user_id', 'text'), targetId: c('target_id', 'text'), status: c('status', 'text'), createdAt: c('created_at', 'ts') },
  },
  reportEvidence: { table: 'report_evidence', key: [pk('report_id')], cols: { reporterId: c('reporter_id', 'text'), targetUserId: c('target_user_id', 'text') } },
  accountDeletions: { table: 'account_deletions', key: [pk('user_id')], cols: { purgeAfter: c('purge_after', 'ts'), requestedAt: c('requested_at', 'ts') } },

  // --- infra ---
  rateLimits: {
    table: 'rate_limits',
    key: [pk('user_id', 'userId'), pk('bucket', 'bucket')],
    cols: { windowStart: c('window_start', 'bigint'), used: c('used', 'int') },
  },
  quotas: { table: 'legacy_quotas', key: [pk('id')], cols: { userId: c('user_id', 'text') } },
  uploads: { table: 'uploads', key: [pk('id')], cols: { ownerId: c('owner_id', 'text'), key: c('key', 'text'), createdAt: c('created_at', 'ts') } },
  config: { table: 'config', key: [pk('key')], cols: {} },

  // --- push ---
  devices: {
    table: 'devices',
    key: [pk('installation_id')],
    cols: { userId: c('user_id', 'text'), platform: c('platform', 'text'), locale: c('locale', 'text'), token: c('token', 'text'), updatedAt: c('updated_at', 'ts') },
  },
  notificationSettings: { table: 'notification_settings', key: [pk('user_id')], cols: {} },
  pickPushes: { table: 'pick_pushes', key: [pk('user_id')], cols: {} },
  connectionCardPushes: { table: 'connection_card_pushes', key: [pk('user_id')], cols: {} },

  // --- recommend ---
  cardVectors: {
    table: 'card_vectors',
    key: [pk('card_id', 'cardId'), pk('channel', 'channel'), pk('part', 'part', true)],
    sep: '__',
    cols: { authorId: c('author_id', 'text'), visibility: c('visibility', 'text'), vector: c('vector', 'vector'), embedModel: c('embed_model', 'text') },
  },
  cardSignatures: { table: 'card_signatures', key: [pk('card_id')], cols: { authorId: c('author_id', 'text') } },
  userProfiles: { table: 'user_profiles', key: [pk('user_id')], cols: {} },
  recommendations: { table: 'recommendations', key: [pk('user_id')], cols: { date: c('date', 'text') } },

  // --- outbox (Phase 3) ---
  // Phase 3 sessions (0002_sessions.sql): `identities/{provider}_{subject}` — a provider name holds no `_`.
  identities: {
    table: 'identities',
    key: [pk('provider', 'provider'), pk('subject', 'subject')],
    cols: { userId: c('user_id', 'text'), createdAt: c('created_at', 'ts') },
  },
  refreshTokens: {
    table: 'refresh_tokens',
    key: [pk('id')],
    cols: {
      uid: c('uid', 'text'),
      family: c('family', 'text'),
      authTime: c('auth_time', 'bigint'),
      createdAt: c('created_at', 'ts'),
      expiresAt: c('expires_at', 'ts'),
      usedAt: c('used_at', 'ts'),
    },
  },
  changeLog: {
    table: 'change_log',
    key: [pk('id')],
    cols: { entity: c('entity', 'text'), id: c('row_id', 'text'), op: c('op', 'text'), version: c('version', 'bigint'), at: c('at', 'ts'), done: c('done', 'bool'), expireAt: c('expire_at', 'ts'), userIds: c('user_ids', 'text[]') },
  },

  // --- the adapter's own ---
  /** The UnitOfWork contract's test-only table (src/server/contract/probe.ts). */
  probe: { table: 'probe', key: [pk('key')], cols: { n: c('n', 'bigint') } },
} as const satisfies Record<string, TableSpec>;

export type PgEntity = keyof typeof PG_TABLES;

export const PG_SPECS: Readonly<Record<string, TableSpec>> = PG_TABLES;

/** Tables of the adapter's own, not entities of the registry. */
export const ADAPTER_TABLES = ['probe', 'leases', 'replica_versions', 'schema_migrations'] as const;

/**
 * An entity and a row id from a memory-style table name: `cards` → (`cards`, id);
 * a subcollection named by its path, `users/{uid}/blocks` → (`blocks`, `{uid}/{id}`).
 */
export function resolveEntity(table: string, id: string): { entity: string; id: string } {
  const parts = table.split('/');
  if (parts.length === 1) return { entity: table, id };
  if (parts.length === 3) return { entity: parts[2], id: `${parts[1]}/${id}` };
  throw new Error(`Not a table name: ${table}`);
}

/** The key parts of a row id, or null when the id doesn't split into them. */
export function keyOf(spec: TableSpec, id: string): string[] | null {
  const n = spec.key.length;
  if (n === 1) return id ? [id] : null;
  const sep = spec.sep ?? '_';
  const parts: string[] = [];
  let rest = id;
  if ((spec.split ?? 'first') === 'first') {
    for (let i = 0; i < n - 1; i++) {
      const at = rest.indexOf(sep);
      if (at <= 0) return null;
      parts.push(rest.slice(0, at));
      rest = rest.slice(at + sep.length);
    }
    parts.push(rest);
  } else {
    const tail: string[] = [];
    for (let i = 0; i < n - 1; i++) {
      const at = rest.lastIndexOf(sep);
      if (at <= 0) return null;
      tail.unshift(rest.slice(at + sep.length));
      rest = rest.slice(0, at);
    }
    parts.push(rest, ...tail);
  }
  return parts.every((p) => p.length > 0) ? parts : null;
}

/** The row id of key parts (keyOf's inverse). */
export function idOf(spec: TableSpec, parts: readonly string[]): string {
  return parts.join(spec.sep ?? '_');
}

export function specOf(entity: string): TableSpec {
  const spec = PG_SPECS[entity];
  if (!spec) throw new Error(`No PostgreSQL table for the entity ${entity}`);
  return spec;
}
