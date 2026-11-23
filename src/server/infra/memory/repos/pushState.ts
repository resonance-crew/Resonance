import type { Card } from '@/lib/db/types';
import type { StoredRecommendations } from '@/lib/recommend/stored';
import { deviceLocale, onePerToken } from '@/server/domain/push/devices';
import { CONSENT_AT, readNotificationSettings, type PickLog } from '@/server/domain/push/settings';
import type { PushConnection, PushDevice, PushProfile, PushStateData, PushStateTxRepo, PushTap } from '@/server/ports/repos/pushState';
import { instantMillis, type Instant } from '@/server/ports/time';
import type { MemoryState, Row } from '../state';
import type { MemoryTx } from '../uow';

/**
 * `pushState` over memory. Tables named after the collections: `devices`,
 * `notificationSettings`, `pickPushes`, `connectionCardPushes`, and the
 * facts a push reads of others — `users`, `blocks` (id `{by}/{whom}`),
 * `connections`, `notes`, `resonanceTaps` (id `{cardId}_{uid}`), `cards`,
 * `messages` (id `{conversationId}/{messageId}`), `conversations`. Times are
 * epoch ms (`updatedAt`, `rangAt`, `createdAt`), a message's `sentAt` an
 * Instant. `recommendations` rows are the stored picks as read.
 */

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Server time for memory writes: never the same ms twice, so "the latest" is always one record. */
let lastWrite = 0;
const serverNow = () => (lastWrite = Math.max(Date.now(), lastWrite + 1));

type Reader = { get<T extends Row = Row>(table: string, id: string): T | null; rows<T extends Row = Row>(table: string, where?: (row: T, id: string) => boolean): { id: string; row: T }[] };

/** A `cards` row as the domain's Card (memory keeps cards as Cards, with `Date`s; `blank` / `unlisted` / `unlistedForStrangers` flag what lib/cards/blank and lib/recommend/collections would read from the story). */
const cardOf = (id: string, row: Row) => ({ ...row, id }) as unknown as Card;

function profileOf(row: Row | null): PushProfile {
  return {
    exists: !!row,
    handle: str(row?.handle),
    avatarUrl: str(row?.avatarUrl),
    initials: str(row?.initials),
    accentColor: str(row?.accentColor),
  };
}

function connectionOf(row: Row | null): PushConnection {
  return {
    exists: !!row,
    userIds: Array.isArray(row?.userIds) ? row.userIds : [],
    mutedBy: Array.isArray(row?.muted) ? row.muted.flatMap((m: unknown) => (m && typeof m === 'object' && typeof (m as { by?: unknown }).by === 'string' ? [(m as { by: string }).by] : [])) : [],
  };
}

function tapOf(row: Row | null): PushTap | null {
  if (!row) return null;
  return { on: row.on === true, rang: row.rangAt != null, rangAtMs: num(row.rangAt) };
}

function pickLogOf(row: Row | null): PickLog {
  const recent = Array.isArray(row?.recent) ? (row.recent as { cardId?: unknown; at?: unknown }[]).flatMap((r) => (typeof r?.cardId === 'string' && num(r.at) !== null ? [{ cardId: r.cardId, at: num(r.at)! }] : [])) : [];
  const sentAt = Array.isArray(row?.sentAt) ? (row.sentAt as unknown[]).map(num).filter((v): v is number => v !== null) : [];
  return { recent, sentAt };
}

const deviceRows = (db: Reader, uid: string) => db.rows('devices', (row) => row.userId === uid);

function reads(db: Reader) {
  return {
    async isBlocked(by: string, whom: string) {
      return db.get('blocks', `${by}/${whom}`) !== null;
    },
    async getProfile(uid: string) {
      return profileOf(db.get('users', uid));
    },
  };
}

export function pushStateTx(tx: MemoryTx): PushStateTxRepo {
  return {
    ...reads(tx),
    async getDeviceOwner(installationId) {
      return strOrNull(tx.get('devices', installationId)?.userId);
    },
    deleteDevice(installationId) {
      tx.delete('devices', installationId);
    },
    async getSettingsRecord(uid) {
      const row = tx.get('notificationSettings', uid);
      return { exists: !!row, settings: readNotificationSettings(row) };
    },
    putSettings(uid, settings, { consent, created }) {
      const at = serverNow();
      const write: Row = {};
      for (const key of consent) write[CONSENT_AT[key]!] = at;
      tx.merge('notificationSettings', uid, { ...settings, ...(created ? { picksConsentAt: null, connectionCardsConsentAt: null } : {}), ...write, updatedAt: at });
    },
    async getPickLog(uid) {
      return pickLogOf(tx.get('pickPushes', uid));
    },
    putPickLog(uid, log) {
      tx.put('pickPushes', uid, { recent: log.recent, sentAt: log.sentAt, updatedAt: serverNow() });
    },
    async getCardClaims(uid) {
      const row = tx.get('connectionCardPushes', uid);
      return { day: strOrNull(row?.day), cards: Array.isArray(row?.cards) ? row.cards.filter((c: unknown): c is string => typeof c === 'string') : [] };
    },
    putCardClaims(uid, day, cards) {
      tx.put('connectionCardPushes', uid, { day, cards, updatedAt: serverNow() });
    },
    async getTap(cardId, uid) {
      return tapOf(tx.get('resonanceTaps', `${cardId}_${uid}`));
    },
    async getRingCard(cardId) {
      const row = tx.get('cards', cardId);
      return row ? cardOf(cardId, row) : null;
    },
    async connectionExists(pair) {
      return tx.get('connections', pair) !== null;
    },
    markTapRang(cardId, uid, atMs) {
      tx.merge('resonanceTaps', `${cardId}_${uid}`, { rangAt: atMs });
    },
  };
}

export function pushStateData(state: MemoryState): PushStateData {
  return {
    ...reads(state),
    async putDevice(installationId, record) {
      state.put('devices', installationId, { ...record, updatedAt: serverNow() });
    },
    async listDeviceAges(uid) {
      return deviceRows(state, uid).map(({ id, row }) => ({ id, updatedAtMs: num(row.updatedAt) ?? 0 }));
    },
    async listDevices(uid) {
      const records = deviceRows(state, uid).flatMap(({ id, row }) => {
        const token = str(row.token);
        if (!token) return [];
        const capabilities = Array.isArray(row.capabilities) ? row.capabilities.filter((c: unknown): c is string => typeof c === 'string') : [];
        const device: PushDevice = { id, token, locale: deviceLocale(row.locale), platform: str(row.platform), capabilities };
        return [{ device, token, updatedAtMs: num(row.updatedAt) ?? 0 }];
      });
      return onePerToken(records).map((r) => r.device);
    },
    async listDevicesWithToken(token) {
      return token ? state.rows('devices', (row) => row.token === token).map(({ id }) => id) : [];
    },
    async listDeviceCapabilities(uid) {
      return deviceRows(state, uid).map(({ row }) => (Array.isArray(row.capabilities) ? row.capabilities : null));
    },
    async deleteDevices(installationIds) {
      for (const id of installationIds) state.delete('devices', id);
    },
    async getSettings(uid) {
      return readNotificationSettings(state.get('notificationSettings', uid));
    },
    async getManySettings(uids) {
      return uids.map((uid) => readNotificationSettings(state.get('notificationSettings', uid)));
    },
    async listOptedIn(key, { after, upTo, limit }) {
      return state
        .rows('notificationSettings', (row, id) => row[key] === true && (after === null || id > after) && (upTo === null || id <= upTo))
        .slice(0, limit)
        .map((r) => r.id);
    },
    async getPickLog(uid) {
      return pickLogOf(state.get('pickPushes', uid));
    },
    async getStoredPicks(uid) {
      // Stored as the picks read (StoredRecommendations), not as Firestore keeps them.
      return (state.get('recommendations', uid) as StoredRecommendations | null) ?? null;
    },
    async getPickCandidates(ids) {
      return ids.flatMap((id) => {
        const row = state.get('cards', id);
        return row ? [{ card: cardOf(id, row), blank: row.blank === true, unlisted: row.unlisted === true }] : [];
      });
    },
    async listBlocked(uid) {
      return new Set(state.rows('blocks', (_row, id) => id.startsWith(`${uid}/`)).map((r) => r.id.slice(uid.length + 1)));
    },
    async unlistedForStrangers(ids) {
      return new Set(ids.filter((id) => state.get('cards', id)?.unlistedForStrangers === true));
    },
    async answeredWithPublished(uid, cardId) {
      return state.rows('cards', (row) => row.referenceCardId === cardId && row.authorId === uid && row.publishedAt != null).length > 0;
    },
    async connected(a, b) {
      return a !== b && state.get('connections', a < b ? `${a}_${b}` : `${b}_${a}`) !== null;
    },
    async getAnnounceCard(cardId) {
      const row = state.get('cards', cardId);
      return {
        exists: !!row,
        published: row?.publishedAt != null,
        visibility: row?.visibility,
        anonymous: row?.anonymous,
        blank: row?.blank === true,
        unlisted: row?.unlisted === true,
        authorId: strOrNull(row?.authorId),
        referenceCardId: str(row?.referenceCardId),
        thoughtCore: str(row?.thoughtCore),
        slug: row?.slug,
      };
    },
    async getCardAuthor(cardId) {
      return str(state.get('cards', cardId)?.authorId);
    },
    async listConnectionsOf(uid) {
      return state.rows('connections', (row) => Array.isArray(row.userIds) && row.userIds.includes(uid)).map(({ row }) => connectionOf(row));
    },
    async getNote(noteId) {
      const note = state.get('notes', noteId);
      return note ? { fromUserId: strOrNull(note.fromUserId), toUserId: strOrNull(note.toUserId), text: str(note.text) } : null;
    },
    async getTapRangAtMs(cardId, uid) {
      return num(state.get('resonanceTaps', `${cardId}_${uid}`)?.rangAt);
    },
    async listNoteTimes(cardId, from) {
      return state.rows('notes', (row) => row.cardId === cardId && row.fromUserId === from).map(({ row }) => num(row.createdAt));
    },
    async getChatMessage(conversationId, messageId) {
      const m = state.get('messages', `${conversationId}/${messageId}`);
      if (!m) return null;
      return {
        senderId: strOrNull(m.senderId),
        text: str(m.text),
        kind: strOrNull(m.kind),
        unsent: m.unsentAt != null,
        album: m.album,
        sticker: m.sticker,
        hasImage: m.image != null,
        cardRef: str(m.cardRef),
        sentAt: (strOrNull(m.sentAt) as Instant | null) ?? null,
      };
    },
    async getConversationLast(conversationId) {
      const last = state.get('conversations', conversationId)?.lastMessage as { senderId?: unknown; sentAt?: unknown; unsent?: unknown } | null | undefined;
      return last ? { senderId: strOrNull(last.senderId), unsent: last.unsent === true, sentAt: strOrNull(last.sentAt) } : null;
    },
    async listMessagesBetween(conversationId, { afterMs, before, limit }) {
      return state
        .rows('messages', (row, id) => id.startsWith(`${conversationId}/`) && typeof row.sentAt === 'string' && row.sentAt < before && instantMillis(row.sentAt) > afterMs)
        .sort((a, b) => (String(a.row.sentAt) < String(b.row.sentAt) ? 1 : -1))
        .slice(0, limit)
        .map(({ id, row }) => ({ id: id.slice(conversationId.length + 1), senderId: strOrNull(row.senderId), sticker: row.sticker, sentAtMs: instantMillis(String(row.sentAt)) }));
    },
    async getConnection(pair) {
      return connectionOf(state.get('connections', pair));
    },
  };
}
