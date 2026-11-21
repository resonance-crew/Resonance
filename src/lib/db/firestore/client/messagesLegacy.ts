'use client';

import { Timestamp, collection, doc, documentId, getDocs, limit, orderBy, query, startAfter, updateDoc } from './sdk';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { getClientDb } from './init';
import { listenLazily } from './listen';
import { mapMessageFields, type ThreadEntry } from './messages';

/*
 * The thread's reads and its read mark as they were before Phase 2 of the
 * middleware decouple: straight on Firestore. NOTHING in the app calls these
 * any more — the web reads its conversations through /api/v1 (./messages:
 * followThread, getMessagesBefore, readConversation) and listens to
 * signals/{uid} alone. They are kept, re-exported from ./messages under their
 * old names, only because test/emulator/clientSdk.emulator.test.ts — which
 * the decouple's red line keeps unchanged to the character — still drives
 * them against the emulator (and the rules they lean on stay for the apps'
 * old builds). Delete this module with that suite's cases.
 */

/** @deprecated A Firestore send time and id: the app's cursors are the API's opaque strings now. */
export interface MessageCursor {
  seconds: number;
  nanoseconds: number;
  id: string;
}

/** @deprecated One answer of the legacy listener. */
export interface LegacyThreadWindow {
  entries: ThreadEntry<MessageCursor>[];
  fromCache: boolean;
}

function cursorOf(id: string, data: Record<string, unknown>, sentAt: Date): MessageCursor {
  const ts = data.sentAt as { seconds?: unknown; nanoseconds?: unknown } | null | undefined;
  if (ts && typeof ts.seconds === 'number' && typeof ts.nanoseconds === 'number') {
    return { seconds: ts.seconds, nanoseconds: ts.nanoseconds, id };
  }
  const ms = sentAt.getTime();
  return { seconds: Math.floor(ms / 1000), nanoseconds: (((ms % 1000) + 1000) % 1000) * 1e6, id };
}

function entryOf(id: string, data: Record<string, unknown>): ThreadEntry<MessageCursor> {
  const message = mapMessageFields(id, data);
  return { message, cursor: cursorOf(id, data, message.sentAt) };
}

/** @deprecated The app follows a thread with ./messages' followThread. */
export function listenThread(
  pairId: string,
  onWindow: (window: LegacyThreadWindow) => void,
  onError?: (err: Error) => void,
  max = 50,
): () => void {
  return listenLazily(
    ({ listenNewest }) =>
      listenNewest(
        ['conversations', pairId, 'messages'],
        'sentAt',
        max,
        (docs, meta) => onWindow({ entries: docs.map((d) => entryOf(d.id, d.data)), fromCache: meta.fromCache }),
        (err) => onError?.(err),
      ),
    onError,
  );
}

/** @deprecated The app pages back with ./messages' getMessagesBefore. */
export async function getOlderMessages(pairId: string, before: MessageCursor, max: number): Promise<ThreadEntry<MessageCursor>[]> {
  const snap = await getDocs(
    query(
      collection(getClientDb(), 'conversations', pairId, 'messages'),
      orderBy('sentAt', 'desc'),
      orderBy(documentId(), 'desc'),
      startAfter(new Timestamp(before.seconds, before.nanoseconds), before.id),
      limit(max),
    ),
  );
  return snap.docs.map((d) => entryOf(d.id, d.data()));
}

/** @deprecated The app marks a conversation read with ./messages' readConversation (POST …/read). */
export async function markConversationRead(pairId: string): Promise<void> {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  await updateDoc(doc(getClientDb(), 'conversations', pairId), { [`unread.${uid}`]: 0 });
}
