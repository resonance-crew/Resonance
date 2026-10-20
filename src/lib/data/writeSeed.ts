/**
 * Words handed from a page to the writer it opens: a note grown into a
 * resonance (the card page's 紙條 → 共振) carries its text into the new
 * card's story. Kept in this tab's sessionStorage, never in the address —
 * the address would put private words in the request (and the page's RSC
 * fetch) and in the history. Read once by the writer, then gone.
 */
const KEY = 'resonance:write-seed:';

/** Leaves `story` for the writer about to open on a resonance to `cardId`. */
export function leaveWriteSeed(cardId: string, story: string): void {
  try {
    sessionStorage.setItem(KEY + cardId, story);
  } catch {
    // Storage unavailable (a private window, blocked site data): the writer opens empty.
  }
}

/** The words left for a resonance to `cardId`, taken (a reload of the writer starts from its draft instead). */
export function takeWriteSeed(cardId: string): string | null {
  try {
    const story = sessionStorage.getItem(KEY + cardId);
    if (story != null) sessionStorage.removeItem(KEY + cardId);
    return story;
  } catch {
    return null;
  }
}
