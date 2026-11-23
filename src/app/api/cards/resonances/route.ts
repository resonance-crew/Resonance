import { NextResponse } from 'next/server';
import { getPublicResonances } from '@/server/app/cardsRead';
import { serverCtx } from '@/server/ctx';

export const runtime = 'nodejs';

/** The same for every signed-out reader of a card, as its page's own ISR: the CDN keeps it briefly. */
const PUBLIC_LIST_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

/** A card's document id (the page has it from its server render). */
const ID = /^[A-Za-z0-9_-]{1,160}$/;

/**
 * GET /api/cards/resonances?id= — the named public cards answering a card, for a reader nobody is signed in as
 * (BE-9): what the browser read through the rules (30 whole cards, stories and all, for every visitor and crawler),
 * as summaries the CDN keeps a minute. Only named cards, as the rules' query asked: an anonymous answer has no byline
 * to show here. A card no one signed out may read has none, never kept.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
  const body = ID.test(id) ? await getPublicResonances(serverCtx(), id) : null;
  if (!body) return NextResponse.json({ cards: [] }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(body, { headers: { 'Cache-Control': PUBLIC_LIST_CACHE } });
}
