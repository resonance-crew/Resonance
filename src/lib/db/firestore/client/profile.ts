'use client';

import type { Locale } from '@/lib/db/types';
import type { MeBody } from '@/lib/api/v1/schemas';
import { getFirebaseClientAuth } from '@/lib/auth/firebase/client';
import { ApiError, callApi } from './api';
import { forgetCachedUser } from './reads';

function requireUid(): string {
  const uid = getFirebaseClientAuth().currentUser?.uid;
  if (!uid) throw new Error('Not signed in');
  return uid;
}

/**
 * What a pen name may never contain: it is the /u/{handle} and
 * /messages/{handle} path segment (the server's `Handle` schema refuses the
 * same). Inputs strip these as they are typed, and the characters that show
 * nothing (format characters but the joiner inside an emoji: the server's
 * hasInvisible).
 */
export const HANDLE_FORBIDDEN = /[/?#\\\p{Cc}]|(?!\u200D)\p{Cf}/gu;

/** The signed-in account's pen name (GET /api/v1/me), or null: signed out, or no profile yet (404), or none chosen. */
export async function getCurrentUserHandle(): Promise<string | null> {
  if (!getFirebaseClientAuth().currentUser) return null;
  try {
    const me = await callApi<MeBody>('/api/v1/me');
    return me.handle ? me.handle : null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

/**
 * Whether a pen name is free — your own current one counts as free
 * (GET /api/v1/handles/{handle}, the apps' as-you-type check). A name the
 * server refuses outright (too short, a forbidden character) is not.
 */
export async function checkHandleAvailable(handle: string): Promise<boolean> {
  const trimmed = handle.trim();
  if (trimmed.length < 2) return false;
  try {
    const res = await callApi<{ available: boolean }>(`/api/v1/handles/${encodeURIComponent(trimmed)}`);
    return res.available;
  } catch (err) {
    if (err instanceof ApiError && err.status === 400) return false;
    throw err;
  }
}

/** The name was taken between checking and saving (the server's 409). */
export function isHandleTaken(err: unknown): boolean {
  return err instanceof ApiError && err.code === 'conflict';
}

/**
 * Save profile fields, all through the server (PATCH /api/v1/me), which
 * keeps pen names unique in the same transaction as the write — the avatar
 * (one of our stored pictures only) and the translation languages too, since
 * the decouple's Phase 2.
 */
export async function updateProfile(patch: {
  handle?: string;
  bio?: string;
  region?: string;
  primaryLocale?: Locale;
  autoTranslateTo?: Locale[];
  avatarUrl?: string;
}): Promise<void> {
  const uid = requireUid();
  try {
    if (Object.keys(patch).length) await callApi<MeBody>('/api/v1/me', { method: 'PATCH', body: patch });
  } finally {
    // Bylines across the site show the new name / avatar on their next read.
    forgetCachedUser(uid);
  }
}

/**
 * Onboarding: create the signed-in account's profile (POST /api/v1/me — the
 * same call the apps make). Idempotent: an account that already has a
 * profile gets it back unchanged. Throws an ApiError with code "conflict"
 * when the pen name was taken meanwhile (see isHandleTaken).
 */
export async function createCurrentUserProfile(input: {
  handle: string;
  region: string;
  primaryLocale: Locale;
}): Promise<MeBody> {
  const uid = requireUid();
  const me = await callApi<MeBody>('/api/v1/me', { method: 'POST', body: input });
  forgetCachedUser(uid);
  return me;
}
