import { createHash } from 'node:crypto';
import type { RealtimePublisher, RealtimeTopic } from '@/server/ports/realtime';
import { counterOf } from '@/server/ports/realtime';
import { OWN, VARY, cacheControl, etagOf } from './cache';

/**
 * An early 304 for the lists the signal channel covers (GET /conversations:
 * `inbox`; GET /me/bell: `bell`), before the list is read at all.
 *
 * The body's own ETag (cache.ts) can only be compared once the list has been
 * read — 50 conversations and their people's profiles, every time a client
 * asks whether anything changed. Here the ETag also carries a validator: the
 * viewer's counter for the list's topic when the answer was made, and when it
 * was made (`"<body hash>.<seconds>.<mac>"`, the mac a hash of the viewer, the
 * request's path and query, the counter and the time). A request naming one
 * whose counter still stands costs one read — `signals/{uid}` — and a 304.
 *
 * Why not on the counter alone: the answers also hold what no signal tells
 * of — the people's names and faces as their profiles are now, and (rarely)
 * a write whose touch failed (touches are best effort). So a validator is
 * believed for {@link EARLY_MAX_AGE_S} only: past that the list is read again
 * whole, and an unchanged body still answers 304 (the old way), under a new
 * validator. A renamed person shows on the list at most ten minutes late —
 * the client pulled the whole list again every minute before, every five now
 * (client/signals SAFETY_PULL_MS), so every other safety pull is answered
 * early.
 *
 * The counter is read before the list: a write committed between the two
 * reads is in the body under the older counter, so the next request finds the
 * counter moved and reads again — never the other way round (a body older
 * than the counter it is tagged with would stay for the whole max age).
 *
 * The mac has no secret: a client forging one only gets a 304 for itself, for
 * a counter of its own it can read anyway (firestore.rules signals/{uid}).
 */

/** How long a validator is believed without reading the list. */
export const EARLY_MAX_AGE_S = 600;

const TAG = /^(?:W\/)?"([A-Za-z0-9_-]{27})(?:\.(\d{1,12})\.([A-Za-z0-9_-]{16}))?"$/;

function mac(uid: string, key: string, counter: number, issued: number): string {
  return createHash('sha256').update(`signal-tag/1\n${uid}\n${key}\n${counter}\n${issued}`).digest('base64url').slice(0, 16);
}

interface Named {
  hash: string;
  issued: number | null;
  mac: string | null;
  tag: string;
}

function namedTags(ifNoneMatch: string | null): Named[] {
  if (!ifNoneMatch) return [];
  const out: Named[] = [];
  for (const raw of ifNoneMatch.split(',')) {
    const m = TAG.exec(raw.trim());
    if (m) out.push({ hash: m[1], issued: m[2] ? Number(m[2]) : null, mac: m[3] ?? null, tag: raw.trim().replace(/^W\//, '') });
  }
  return out;
}

export interface SignalledRead {
  uid: string;
  topic: RealtimeTopic;
  realtime: RealtimePublisher;
  /** The server's time, in ms. */
  now: number;
}

function notModified(req: Request, etag: string): Response {
  return new Response(null, { status: 304, headers: { 'Cache-Control': cacheControl(req, OWN), Vary: VARY, ETag: etag } });
}

/**
 * A v1 list's answer (OWN freshness), or a 304 — early when the request
 * names a validator its counter still stands for, otherwise after `read`
 * when the body is the one named. Without a signal store that reads, `read`
 * every time, as cachedJson.
 */
export async function signalledJson(req: Request, s: SignalledRead, read: () => Promise<unknown>): Promise<Response> {
  const url = new URL(req.url);
  const key = `${url.pathname}?${url.searchParams.toString()}`;
  const seconds = Math.floor(s.now / 1000);
  // A failed counter read is no reason to fail the list: it is read whole.
  const counter = s.realtime.read ? await s.realtime.read(s.uid).then((d) => counterOf(d, s.topic), () => null) : null;
  const named = namedTags(req.headers.get('If-None-Match'));

  if (counter !== null) {
    for (const t of named) {
      if (t.issued === null || t.mac === null) continue;
      const age = seconds - t.issued;
      if (age < 0 || age >= EARLY_MAX_AGE_S) continue;
      if (t.mac === mac(s.uid, key, counter, t.issued)) return notModified(req, t.tag);
    }
  }

  const json = JSON.stringify(await read());
  const hash = etagOf(json).slice(1, -1);
  const etag = counter === null ? `"${hash}"` : `"${hash}.${seconds}.${mac(s.uid, key, counter, seconds)}"`;
  if (named.some((t) => t.hash === hash) || req.headers.get('If-None-Match')?.trim() === '*') return notModified(req, etag);
  return new Response(json, {
    status: 200,
    headers: { 'Cache-Control': cacheControl(req, OWN), Vary: VARY, ETag: etag, 'Content-Type': 'application/json' },
  });
}
