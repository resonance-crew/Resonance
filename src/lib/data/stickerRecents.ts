import { stickerOf, type StickerRef } from '@/lib/stickers/catalog';

/**
 * The stickers the viewer sent last (round 22 §4.1): the picker's 🕘 tab, kept
 * in this browser per account — the newest first, each once, at most
 * RECENT_MAX. Only stickers this build knows are kept (a later pack's is
 * drawn in the thread, not offered here). The apps keep theirs by the same
 * rule.
 */
const KEY = 'resonance:stickers:recent:';
export const RECENT_MAX = 8;

const same = (a: StickerRef, b: StickerRef) => a.pack === b.pack && a.id === b.id;

/** The viewer's recent stickers, newest first. */
export function readRecentStickers(uid: string): StickerRef[] {
  try {
    const raw = window.localStorage.getItem(KEY + uid);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    if (!Array.isArray(list)) return [];
    const out: StickerRef[] = [];
    for (const r of list) {
      const ref = r as Partial<StickerRef> | null;
      if (typeof ref?.pack !== 'string' || typeof ref.id !== 'string' || !stickerOf(ref.pack, ref.id)) continue;
      if (!out.some((x) => same(x, ref as StickerRef))) out.push({ pack: ref.pack, id: ref.id });
    }
    return out.slice(0, RECENT_MAX);
  } catch {
    return [];
  }
}

/** `ref` was just sent: it leads the recents. Answers the list as it now is. */
export function noteRecentSticker(uid: string, ref: StickerRef): StickerRef[] {
  const next = [{ pack: ref.pack, id: ref.id }, ...readRecentStickers(uid).filter((x) => !same(x, ref))].slice(0, RECENT_MAX);
  try {
    window.localStorage.setItem(KEY + uid, JSON.stringify(next));
  } catch {
    // Storage unavailable: the recents last as long as the page.
  }
  return next;
}
