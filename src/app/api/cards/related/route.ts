import { NextResponse } from 'next/server';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { getPublicRelated } from '@/lib/api/v1/reads';

export const runtime = 'nodejs';

/** The same for every signed-out reader of a card, as its page's own ISR: the CDN keeps it briefly. */
const RELATED_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=300';

/** A card's document id (the page has it from its server render). */
const ID = /^[A-Za-z0-9_-]{1,160}$/;

/**
 * GET /api/cards/related?id= — the related cards under a card, for a reader
 * nobody is signed in as: what GET /api/v1/cards/{id}/related answers, without
 * a viewer (so without blocks). From the server because only it may read the
 * cards' readings (`cardSignatures`, round 26 §A1.7): a card its reading keeps
 * from strangers is left out here as everywhere else that picks cards for
 * people who may not know its author. Anonymous cards are in it without their
 * byline. A card no one signed out may read has none, never kept.
 */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get('id')?.trim() ?? '';
  const body = ID.test(id) ? await getPublicRelated(getAdminDb(), id) : null;
  if (!body) return NextResponse.json({ cards: [] }, { headers: { 'Cache-Control': 'no-store' } });
  return NextResponse.json(body, { headers: { 'Cache-Control': RELATED_CACHE } });
}
