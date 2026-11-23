'use client';

import type { BlockListBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth, sessionMarkUid } from '@/lib/auth/firebase/client';
import { callApi, ownSignalsOf } from './api';
import { rememberPeople } from './reads';
import { pokeOwn } from './signals';

/**
 * Blocking (封鎖). The block list lives at `users/{uid}/blocks/{blockedUid}`
 * and is private to its owner; the blocked person is never told.
 *
 * What a block does:
 *  - Firestore rules refuse every way of reaching across it, both directions:
 *    connecting, messaging, invites, notes, notifications, card links
 *    (`blockedBetween()` in firestore.rules).
 *  - Blocking ends the connection and withdraws pending invites between the
 *    two people, so the existing conversation freezes — one server
 *    transaction (PUT /api/v1/me/blocks/{uid}), which the browser no longer
 *    pieces together from three writes.
 *  - The blocker stops seeing the other person's cards and conversations
 *    (filtered client-side through {@link getMyBlockedIds}).
 * Unblocking removes the entry only — a connection is never restored.
 */

export interface BlockedUser {
  uid: string;
  createdAt: Date | null;
}

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

// One in-flight read of the viewer's block list, shared by every feed/list
// fetcher; keyed by uid so switching accounts never reuses another's list.
let cache: { uid: string; ids: Promise<Set<string>> } | null = null;

/**
 * The uids the signed-in viewer has blocked (empty when signed out).
 *
 * Waits for Auth to restore a returning reader first: until it has,
 * `currentUser` is null, and an empty list then would let a list that doesn't
 * itself wait for the viewer (the home feed, related cards) through unfiltered
 * — and cached that way. Read once (GET /api/v1/me/blocks) for every list
 * that asks: only the viewer's own block or unblock changes it.
 */
export async function getMyBlockedIds(cookieUid?: string): Promise<Set<string>> {
  const auth = getFirebaseClientAuth();
  // The card page (P0 #8): while Auth restores in a browser whose live session cookie was minted for `cookieUid`
  // (its mark), that cookie's own list, at once — callApi sends the cookie without an ID token (W10) — rather than
  // the SDK's restore and then this read one after the other. A read that fails is never an empty list here: it
  // falls back to the read below, after Auth (the page holds the card meanwhile).
  if (cookieUid && !auth.currentUser && sessionMarkUid() === cookieUid) {
    if (cache?.uid !== cookieUid) {
      const ids = readBlocks()
        .then((blocks) => new Set(blocks.map((b) => b.uid)))
        .catch(() => {
          if (cache?.ids === ids) cache = null;
          return getMyBlockedIds();
        });
      cache = { uid: cookieUid, ids };
    }
    return cache.ids;
  }
  await auth.authStateReady();
  const uid = auth.currentUser?.uid;
  if (!uid) return new Set();
  if (cache?.uid !== uid) {
    const ids = readBlocks()
      .then((blocks) => new Set(blocks.map((b) => b.uid)))
      .catch(() => {
        cache = null; // don't pin a transient failure
        return new Set<string>();
      });
    cache = { uid, ids };
  }
  return cache.ids;
}

/** Forget the cached block list (after a block/unblock, or sign-out). */
export function invalidateBlocks(): void {
  cache = null;
}

/** GET /api/v1/me/blocks, the people in it handed to the profile cache (the blocked list draws them). */
async function readBlocks(): Promise<BlockedUser[]> {
  const body = await callApi<BlockListBody>('/api/v1/me/blocks');
  rememberPeople(body.blocks.map((b) => b.person));
  return body.blocks.map((b) => ({ uid: b.userId, createdAt: b.blockedAt ? new Date(b.blockedAt) : null }));
}

/** Everyone the viewer blocked, the latest first. */
export async function listMyBlocks(): Promise<BlockedUser[]> {
  requireUid();
  return readBlocks();
}

/**
 * Block someone: one server transaction (PUT /api/v1/me/blocks/{uid}) blocks
 * them, ends a connection and withdraws pending invites both ways.
 */
export async function blockUser(otherUid: string): Promise<void> {
  const uid = requireUid();
  if (otherUid === uid) throw new Error('Cannot block yourself');
  let signals: Record<string, number> | null = null;
  try {
    await callApi(`/api/v1/me/blocks/${encodeURIComponent(otherUid)}`, { method: 'PUT', onHeaders: (h) => (signals = ownSignalsOf(h)) });
  } finally {
    invalidateBlocks();
  }
  // The blocker's own `graph` counter after the block: pulled once, now, and not again when the listener hears it.
  pokeOwn(['graph'], signals);
}

/** Unblock: the block goes, nothing else — a connection is never restored (DELETE /api/v1/me/blocks/{uid}). */
export async function unblockUser(otherUid: string): Promise<void> {
  requireUid();
  let signals: Record<string, number> | null = null;
  try {
    await callApi(`/api/v1/me/blocks/${encodeURIComponent(otherUid)}`, { method: 'DELETE', onHeaders: (h) => (signals = ownSignalsOf(h)) });
  } finally {
    invalidateBlocks();
  }
  pokeOwn(['graph'], signals);
}
