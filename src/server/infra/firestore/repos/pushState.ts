import { FieldPath, FieldValue, Timestamp, type DocumentData, type DocumentSnapshot, type Transaction } from 'firebase-admin/firestore';
import { CARD_VISIBILITY_FIELDS, blockedByViewer, connected } from '@/lib/api/v1/present';
import { blankBySummary, LISTING_FIELDS, SUMMARY_FIELDS } from '@/lib/api/v1/summary';
import { tapRef } from '@/lib/api/v1/taps';
import { unlistedCard } from '@/lib/cards/blank';
import { mapCard } from '@/lib/db/firestore/mapper';
import { unlistedForStrangers } from '@/lib/recommend/collections';
import { RECOMMENDATIONS, readStored } from '@/lib/recommend/stored';
import { deviceLocale } from '@/server/domain/push/devices';
import { CONSENT_AT, readNotificationSettings, type PickLog } from '@/server/domain/push/settings';
import type {
  AnnounceCard,
  PushChatMessage,
  PushConnection,
  PushConversationLast,
  PushDevice,
  PushProfile,
  PushStateData,
  PushStateTxRepo,
  PushTap,
} from '@/server/ports/repos/pushState';
import { instantFromParts, instantParts, type Instant } from '@/server/ports/time';
import type { AdminDb } from '../db';

// The Firestore code of src/lib/push, moved (the queries, masks and writes as they were).

export const DEVICES = 'devices';
export const NOTIFICATION_SETTINGS = 'notificationSettings';
export const PICK_PUSHES = 'pickPushes';
export const CONNECTION_CARD_PUSHES = 'connectionCardPushes';

/** A batch holds 500 writes, as a multicast holds 500 tokens. */
const BATCH_MAX = 500;
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const strOrNull = (v: unknown) => (typeof v === 'string' ? v : null);
const millisOf = (v: unknown): number | null => (v instanceof Timestamp ? v.toMillis() : null);
const instantOf = (v: unknown): Instant | null => (v instanceof Timestamp ? instantFromParts(v.seconds, v.nanoseconds) : null);
const timestampOf = (at: Instant) => {
  const { seconds, nanos } = instantParts(at);
  return new Timestamp(seconds, nanos);
};

const ms = (v: unknown) => (v instanceof Timestamp ? v.toMillis() : typeof v === 'number' && Number.isFinite(v) ? v : null);

/** `pickPushes/{uid}`, read defensively (a missing document is an empty log). */
export function readPickLog(data: DocumentData | undefined): PickLog {
  const recent = Array.isArray(data?.recent)
    ? (data.recent as unknown[]).flatMap((r) => {
        const cardId = (r as { cardId?: unknown } | null)?.cardId;
        const at = ms((r as { at?: unknown } | null)?.at);
        return typeof cardId === 'string' && at !== null ? [{ cardId, at }] : [];
      })
    : [];
  const sentAt = Array.isArray(data?.sentAt) ? (data.sentAt as unknown[]).map(ms).filter((v): v is number => v !== null) : [];
  return { recent, sentAt };
}

function profileOf(snap: DocumentSnapshot): PushProfile {
  return {
    exists: snap.exists,
    handle: snap.exists ? str(snap.get('handle')) : '',
    avatarUrl: str(snap.get('avatarUrl')),
    initials: str(snap.get('initials')),
    accentColor: str(snap.get('accentColor')),
  };
}

function connectionOf(snap: Pick<DocumentSnapshot, 'exists' | 'get'>): PushConnection {
  const muted: unknown = snap.get('muted');
  const pair: unknown = snap.get('userIds');
  return {
    exists: snap.exists,
    userIds: Array.isArray(pair) ? pair : [],
    mutedBy: Array.isArray(muted)
      ? muted.flatMap((m) => (m && typeof m === 'object' && typeof (m as { by?: unknown }).by === 'string' ? [(m as { by: string }).by] : []))
      : [],
  };
}

function tapOf(snap: DocumentSnapshot): PushTap | null {
  if (!snap.exists) return null;
  const rangAt = snap.get('rangAt');
  return { on: snap.get('on') === true, rang: rangAt != null, rangAtMs: millisOf(rangAt) };
}

function deviceOf(d: DocumentSnapshot): PushDevice | null {
  const token = str(d.get('token'));
  if (!token) return null;
  const capabilities = d.get('capabilities');
  return {
    id: d.id,
    token,
    locale: deviceLocale(d.get('locale')),
    platform: str(d.get('platform')),
    capabilities: Array.isArray(capabilities) ? capabilities.filter((c): c is string => typeof c === 'string') : [],
  };
}

/** What announcing reads of the card (never its story: its stored summary says whether it is blank). */
const ANNOUNCE_FIELDS = ['authorId', 'publishedAt', 'visibility', 'anonymous', 'slug', 'referenceCardId', ...SUMMARY_FIELDS, ...LISTING_FIELDS] as const;
/** The fields a candidate for tonight's card is judged and pushed by. */
const PICK_FIELDS = ['authorId', 'visibility', 'anonymous', 'publishedAt', 'slug', ...SUMMARY_FIELDS, ...LISTING_FIELDS];

export function pushStateTx(db: AdminDb, tx: Transaction): PushStateTxRepo {
  return {
    async getDeviceOwner(installationId) {
      const snap = await tx.get(db.doc(`${DEVICES}/${installationId}`));
      return snap.exists ? strOrNull(snap.get('userId')) : null;
    },
    deleteDevice(installationId) {
      tx.delete(db.doc(`${DEVICES}/${installationId}`));
    },

    async getSettingsRecord(uid) {
      const snap = await tx.get(db.doc(`${NOTIFICATION_SETTINGS}/${uid}`));
      return { exists: snap.exists, settings: readNotificationSettings(snap.data()) };
    },
    putSettings(uid, settings, { consent, created }) {
      const write: Record<string, unknown> = {};
      for (const key of consent) write[CONSENT_AT[key]!] = FieldValue.serverTimestamp();
      tx.set(
        db.doc(`${NOTIFICATION_SETTINGS}/${uid}`),
        {
          ...settings,
          // A new document says "never consented" out loud rather than by absence.
          ...(created ? { picksConsentAt: null, connectionCardsConsentAt: null } : {}),
          ...write,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    },

    async getPickLog(uid) {
      return readPickLog((await tx.get(db.doc(`${PICK_PUSHES}/${uid}`))).data());
    },
    putPickLog(uid, log) {
      tx.set(db.doc(`${PICK_PUSHES}/${uid}`), {
        recent: log.recent.map((r) => ({ cardId: r.cardId, at: Timestamp.fromMillis(r.at) })),
        sentAt: log.sentAt.map((at) => Timestamp.fromMillis(at)),
        updatedAt: FieldValue.serverTimestamp(),
      });
    },

    async getCardClaims(uid) {
      const snap = await tx.get(db.doc(`${CONNECTION_CARD_PUSHES}/${uid}`));
      const cards = snap.get('cards');
      return { day: strOrNull(snap.get('day')), cards: Array.isArray(cards) ? cards.filter((c): c is string => typeof c === 'string') : [] };
    },
    putCardClaims(uid, day, cards) {
      tx.set(db.doc(`${CONNECTION_CARD_PUSHES}/${uid}`), { day, cards, updatedAt: FieldValue.serverTimestamp() });
    },

    async getTap(cardId, uid) {
      return tapOf(await tx.get(tapRef(db, cardId, uid)));
    },
    async getRingCard(cardId) {
      const [card] = await tx.getAll(db.doc(`cards/${cardId}`), { fieldMask: [...CARD_VISIBILITY_FIELDS] });
      return card.exists ? mapCard(card.id, card.data()!) : null;
    },
    async getProfile(uid) {
      return profileOf(await tx.get(db.doc(`users/${uid}`)));
    },
    async isBlocked(by, whom) {
      return (await tx.get(db.doc(`users/${by}/blocks/${whom}`))).exists;
    },
    async connectionExists(pair) {
      return (await tx.get(db.doc(`connections/${pair}`))).exists;
    },
    markTapRang(cardId, uid, atMs) {
      tx.update(tapRef(db, cardId, uid), { rangAt: Timestamp.fromMillis(atMs) });
    },
  };
}

export function pushStateData(db: AdminDb): PushStateData {
  const devicesOf = (uid: string) => db.collection(DEVICES).where('userId', '==', uid);
  return {
    async putDevice(installationId, record) {
      await db.doc(`${DEVICES}/${installationId}`).set({ ...record, updatedAt: FieldValue.serverTimestamp() });
    },
    async listDeviceAges(uid) {
      const mine = await devicesOf(uid).select('updatedAt').get();
      return mine.docs.map((d) => {
        const v = d.get('updatedAt') as { toMillis?: () => number } | undefined;
        return { id: d.id, updatedAtMs: typeof v?.toMillis === 'function' ? v.toMillis() : 0 };
      });
    },
    async listDevices(uid) {
      const devices = await devicesOf(uid).get();
      return devices.docs.flatMap((d) => deviceOf(d) ?? []);
    },
    async listDeviceCapabilities(uid) {
      const devices = await devicesOf(uid).select('capabilities').get();
      return devices.docs.map((d) => {
        const caps = d.get('capabilities');
        return Array.isArray(caps) ? caps : null;
      });
    },
    async deleteDevices(installationIds) {
      for (let start = 0; start < installationIds.length; start += BATCH_MAX) {
        const batch = db.batch();
        installationIds.slice(start, start + BATCH_MAX).forEach((id) => batch.delete(db.doc(`${DEVICES}/${id}`)));
        await batch.commit();
      }
    },

    async getSettings(uid) {
      return readNotificationSettings((await db.doc(`${NOTIFICATION_SETTINGS}/${uid}`).get()).data());
    },
    async getManySettings(uids) {
      if (!uids.length) return [];
      const snaps = await db.getAll(...uids.map((uid) => db.doc(`${NOTIFICATION_SETTINGS}/${uid}`)));
      return snaps.map((s) => readNotificationSettings(s.data()));
    },
    async listOptedIn(key, { after, upTo, limit }) {
      let q = db.collection(NOTIFICATION_SETTINGS).where(key, '==', true).orderBy(FieldPath.documentId()).select().limit(limit);
      if (after !== null) q = q.startAfter(after);
      if (upTo !== null) q = q.endAt(upTo);
      return (await q.get()).docs.map((d) => d.id);
    },

    async getPickLog(uid) {
      return readPickLog((await db.doc(`${PICK_PUSHES}/${uid}`).get()).data());
    },
    async getStoredPicks(uid) {
      return readStored((await db.doc(`${RECOMMENDATIONS}/${uid}`).get()).data());
    },
    async getPickCandidates(ids) {
      if (!ids.length) return [];
      const snaps = await db.getAll(...ids.map((id) => db.doc(`cards/${id}`)), { fieldMask: PICK_FIELDS });
      return snaps.filter((s) => s.exists).map((s) => ({ card: mapCard(s.id, s.data()!), blank: blankBySummary(s.data()), unlisted: unlistedCard(s.data()!) }));
    },
    listBlocked: (uid) => blockedByViewer(db, uid),
    unlistedForStrangers: (ids) => unlistedForStrangers(db, ids),
    async answeredWithPublished(uid, cardId) {
      // Two equality filters: served by merging the single-field indexes.
      const mine = await db.collection('cards').where('referenceCardId', '==', cardId).where('authorId', '==', uid).select('publishedAt').get();
      return mine.docs.some((d) => d.get('publishedAt') != null);
    },
    connected: (a, b) => connected(db, a, b),

    async getAnnounceCard(cardId): Promise<AnnounceCard> {
      const [card] = await db.getAll(db.doc(`cards/${cardId}`), { fieldMask: [...ANNOUNCE_FIELDS] });
      const data = card.data();
      return {
        exists: !!data,
        published: data?.publishedAt != null,
        visibility: data?.visibility,
        anonymous: data?.anonymous,
        blank: !!data && blankBySummary(data),
        unlisted: !!data && unlistedCard(data),
        authorId: strOrNull(card.get('authorId')),
        referenceCardId: str(card.get('referenceCardId')),
        thoughtCore: str(card.get('thoughtCore')),
        slug: card.get('slug'),
      };
    },
    async getCardAuthor(cardId) {
      const [card] = await db.getAll(db.doc(`cards/${cardId}`), { fieldMask: ['authorId'] });
      return card.exists ? str(card.get('authorId')) : '';
    },
    async listConnectionsOf(uid) {
      const connections = await db.collection('connections').where('userIds', 'array-contains', uid).get();
      return connections.docs.map(connectionOf);
    },

    async isBlocked(by, whom) {
      return (await db.doc(`users/${by}/blocks/${whom}`).get()).exists;
    },
    async getProfile(uid) {
      return profileOf(await db.doc(`users/${uid}`).get());
    },
    async getNote(noteId) {
      const note = await db.doc(`notes/${noteId}`).get();
      return note.exists ? { fromUserId: strOrNull(note.get('fromUserId')), toUserId: strOrNull(note.get('toUserId')), text: str(note.get('text')) } : null;
    },
    async getTapRangAtMs(cardId, uid) {
      return millisOf((await tapRef(db, cardId, uid).get()).get('rangAt'));
    },
    async listNoteTimes(cardId, from) {
      const notes = await db.collection('notes').where('cardId', '==', cardId).where('fromUserId', '==', from).select('createdAt').get();
      return notes.docs.map((d) => millisOf(d.get('createdAt')));
    },
    async getChatMessage(conversationId, messageId): Promise<PushChatMessage | null> {
      const m = await db.doc(`conversations/${conversationId}/messages/${messageId}`).get();
      if (!m.exists) return null;
      return {
        senderId: strOrNull(m.get('senderId')),
        text: str(m.get('text')),
        kind: strOrNull(m.get('kind')),
        unsent: m.get('unsentAt') != null,
        album: m.get('album'),
        sticker: m.get('sticker'),
        hasImage: m.get('image') != null,
        cardRef: str(m.get('cardRef')),
        sentAt: instantOf(m.get('sentAt')),
      };
    },
    async getConversationLast(conversationId): Promise<PushConversationLast | null> {
      const convo = await db.doc(`conversations/${conversationId}`).get();
      const last = convo.get('lastMessage') as { senderId?: unknown; sentAt?: unknown; unsent?: unknown } | null | undefined;
      return last ? { senderId: strOrNull(last.senderId), unsent: last.unsent === true, sentAt: instantOf(last.sentAt) } : null;
    },
    async listMessagesBetween(conversationId, { afterMs, before, limit }) {
      const window = await db
        .collection(`conversations/${conversationId}/messages`)
        .where('sentAt', '<', timestampOf(before))
        .where('sentAt', '>', Timestamp.fromMillis(afterMs))
        .orderBy('sentAt', 'desc')
        .limit(limit)
        .get();
      return window.docs.map((d) => ({ id: d.id, senderId: strOrNull(d.get('senderId')), sticker: d.get('sticker'), sentAtMs: millisOf(d.get('sentAt')) }));
    },
    async getConnection(pair) {
      return connectionOf(await db.doc(`connections/${pair}`).get());
    },
  };
}
