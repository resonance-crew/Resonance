import type { FilmToday } from '@/server/ports/repos/cards';

const RELATIONS = new Set(['resonance', 'kin', 'alone']);

/** A kept `config/landingFilmToday` read back, or null when it isn't one (an older or a damaged shape). */
export function filmTodayOf(raw: unknown): FilmToday | null {
  if (!raw || typeof raw !== 'object') return null;
  const d = raw as Record<string, unknown>;
  const ids = (v: unknown) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.length > 0);
  if (typeof d.day !== 'number' || typeof d.v !== 'number' || typeof d.pin !== 'string') return null;
  if (typeof d.written !== 'string' || !d.written) return null;
  if (d.answer !== null && (typeof d.answer !== 'string' || !d.answer)) return null;
  if (typeof d.relation !== 'string' || !RELATIONS.has(d.relation) || typeof d.pinned !== 'boolean' || !ids(d.picks)) return null;
  return {
    day: d.day,
    v: d.v,
    pin: d.pin,
    written: d.written,
    answer: d.answer as string | null,
    relation: d.relation as FilmToday['relation'],
    pinned: d.pinned,
    picks: d.picks as string[],
  };
}
