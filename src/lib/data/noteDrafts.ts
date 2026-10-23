/**
 * A note's unsent words (小紙條), kept in this browser per account and card:
 * closing the composer — its 取消, the backdrop, Escape, leaving the page or
 * the browser — never throws away what was typed, and opening it again on
 * that card brings the words back. Gone once the note is sent, or emptied, and
 * all of them on signing out. The apps keep theirs by the same rule.
 *
 * localStorage, under one key per account: `{ [cardId]: { text, at } }`. At
 * most MAX_DRAFTS (the oldest go first) and none older than DRAFT_DAYS.
 */
const KEY = 'resonance:note-drafts:';
export const MAX_DRAFTS = 50;
export const DRAFT_DAYS = 30;
const DAY_MS = 86_400_000;

type Drafts = Record<string, { text: string; at: number }>;

function read(uid: string, now: number): Drafts {
  try {
    const raw = window.localStorage.getItem(KEY + uid);
    const all = raw ? (JSON.parse(raw) as Drafts) : {};
    const kept: Drafts = {};
    for (const [cardId, d] of Object.entries(all))
      if (typeof d?.text === 'string' && typeof d.at === 'number' && now - d.at < DRAFT_DAYS * DAY_MS) kept[cardId] = d;
    return kept;
  } catch {
    return {};
  }
}

function write(uid: string, drafts: Drafts): void {
  try {
    const entries = Object.entries(drafts).sort(([, a], [, b]) => b.at - a.at).slice(0, MAX_DRAFTS);
    if (entries.length) window.localStorage.setItem(KEY + uid, JSON.stringify(Object.fromEntries(entries)));
    else window.localStorage.removeItem(KEY + uid);
  } catch {
    // Storage unavailable (a private window, blocked site data): the words live as long as the composer.
  }
}

/** The words left unsent on `cardId`, or null. */
export function readNoteDraft(uid: string, cardId: string, now = Date.now()): string | null {
  return read(uid, now)[cardId]?.text ?? null;
}

/** Keep `text` as the unsent note on `cardId` (blank: forget it). */
export function keepNoteDraft(uid: string, cardId: string, text: string, now = Date.now()): void {
  const drafts = read(uid, now);
  if (text.trim()) drafts[cardId] = { text, at: now };
  else delete drafts[cardId];
  write(uid, drafts);
}

/** The note on `cardId` went (sent, or carried into a card): nothing left to keep. */
export function forgetNoteDraft(uid: string, cardId: string, now = Date.now()): void {
  keepNoteDraft(uid, cardId, '', now);
}

/** Signing out: every account's unsent notes leave this browser. */
export function forgetAllNoteDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(KEY)) keys.push(key);
    }
    keys.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    // nothing to clear
  }
}
