import { NextResponse } from 'next/server';
import { getPublicAuthorCards } from '@/server/app/cardsRead';
import { serverCtx } from '@/server/ctx';

export const runtime = 'nodejs';

/** The same for every signed-out reader of a profile: the CDN keeps it briefly. */
const PUBLIC_LIST_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

/** A uid (the profile page has it from the pen name's reservation). */
const UID = /^[A-Za-z0-9_-]{1,128}$/;

/**
 * GET /api/cards/by-author?uid= — a person's named public cards, newest first (40), for a reader nobody is signed in
 * as (BE-9): what the profile read through the rules (40 whole cards, stories and all, for every visitor and
 * crawler), as summaries the CDN keeps a minute. Never an anonymous card. Someone with no profile has none, never kept.
 */
export async function GET(req: Request) {
  const uid = new URL(req.url).searchParams.get('uid')?.trim() ?? '';
  const body = UID.test(uid) ? await getPublicAuthorCards(serverCtx(), uid) : null;
  if (!body) return NextResponse.json({ cards: [] }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(body, { headers: { 'Cache-Control': PUBLIC_LIST_CACHE } });
}
