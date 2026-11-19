/**
 * First-times hints (lib/hints.ts, the apps' HintService) in the captures: a hint shows for its first three displays,
 * counted on the device and mirrored to the account's `users/{uid}.hintsSeen`, and the next display takes the larger
 * of the two. Every platform of a run shares one seeded stack, so the captures before a hint's screen (the web phone's
 * three variants, the other devices beside it) spend its three showings and the later ones have none (run
 * 20261118-235458: card-note-open's privacy line on the web phone only, of the web and Android). A screen naming its
 * hints (`hints` in screens.ts) starts every capture with them unspent: the account's synced count is taken away on the
 * stack just before it, and the device's own is 0 — the web's storage (`webStorageOf`), Android's from `pm clear`
 * (each variant starts from one, and no other screen claims the hint). iOS and the Mac show card-note-open's line
 * under their launch argument (`-visualNote open`, NoteInPlace.swift) without claiming it; the reset is theirs too.
 */
import { EMULATOR_PROJECT_ID } from '../emulator-env.mjs';
import type { Screen } from './screens';
import type { CaptureContext } from './util';

/** The device's count of a hint (the web's localStorage key, the apps' `hint:{key}`). */
export const hintKey = (key: string) => `hint:${key}`;

/** What the web keeps in localStorage for `screen` before its page opens: its own `web.storage`, and each of its hints at 0. */
export function webStorageOf(screen: Pick<Screen, 'web' | 'hints'>): Record<string, string> {
  return { ...screen.web?.storage, ...Object.fromEntries((screen.hints ?? []).map((key) => [hintKey(key), '0'])) };
}

/**
 * The Firestore emulator's REST request taking `keys` out of `uid`'s `hintsSeen` (a field in the mask and not in the
 * body is deleted; the emulator's `owner` token passes the rules). A key with characters a field path can't hold bare
 * (`note-privacy`'s hyphen) is quoted in backticks. The seeded accounts' uids are their names (seed-emulator.ts).
 */
export function unspendRequest(firestorePort: number, uid: string, keys: string[]): { url: string; init: RequestInit } {
  const doc = `http://127.0.0.1:${firestorePort}/v1/projects/${EMULATOR_PROJECT_ID}/databases/(default)/documents/users/${uid}`;
  const quote = (key: string) => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? key : `\`${key.replace(/([`\\])/g, '\\$1')}\``);
  const mask = keys.map((key) => `updateMask.fieldPaths=${encodeURIComponent(`hintsSeen.${quote(key)}`)}`).join('&');
  return {
    url: `${doc}?${mask}&currentDocument.exists=true`,
    init: { method: 'PATCH', headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' }, body: JSON.stringify({ fields: {} }) },
  };
}

/**
 * Just before a capture of `screen`: its hints unspent for its account on the run's stack (nothing for a screen without
 * hints, or signed out). A reset that fails is said in the log and the capture goes on (its picture shows what happened).
 */
export async function unspendHints(ctx: Pick<CaptureContext, 'ports' | 'log'>, screen: Pick<Screen, 'id' | 'as' | 'hints'>, fetchImpl: typeof fetch = fetch) {
  if (!screen.hints?.length || !screen.as) return;
  const { url, init } = unspendRequest(ctx.ports.firestore, screen.as, screen.hints);
  try {
    const res = await fetchImpl(url, init);
    if (!res.ok) ctx.log(`  ${screen.id}: ${screen.as}'s ${screen.hints.join(', ')} not reset (${res.status} ${(await res.text()).slice(0, 200)})`);
  } catch (error) {
    ctx.log(`  ${screen.id}: ${screen.as}'s ${screen.hints.join(', ')} not reset (${String(error)})`);
  }
}
