import { NextResponse, after } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { deleteCard, updateCard } from '@/lib/api/v1/cards';
import { tryReachResonance } from '@/lib/api/v1/resonate';
import { getCardDetail } from '@/lib/api/v1/reads';
import { knowsSharedCards } from '@/lib/api/v1/clientBuild';
import { CardDetailQuery, CardIdParam, CardKey, DeleteCardQuery, UpdateCardRequest } from '@/lib/api/v1/schemas';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { BRIEF, NEVER, OWN, cachedJson } from '@/lib/api/v1/cache';
import { ringAfter } from '@/lib/push/ring';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/cards/{key}?include=resonances,related,links,embeds — a card
 * (by slug or id) the viewer may read, with its story, and the lists asked for.
 */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const key = parse(CardKey, await routeParam(ctx, 'key'));
  const { include } = parse(CardDetailQuery, Object.fromEntries(new URL(req.url).searchParams));
  const detail = await getCardDetail(getAdminDb(), user.id, key, include, { shared: knowsSharedCards(req) });
  // Their own card may be one they just changed (visibility, byline, an applied edit). Someone else's 私人卡 is
  // read on a pass its author can end at any moment (api/v1/sharedCards): never kept, not even for a moment.
  const shared = !detail.isOwner && (detail.visibility === 'private' || !detail.card.publishedAt);
  return cachedJson(req, detail, detail.isOwner ? OWN : shared ? NEVER : BRIEF);
});

/**
 * PATCH /api/v1/cards/{id} — your card's visibility and/or anonymity (see
 * updateCard). A resonance it made public under your name reaches the
 * original's author after the response — connects you two and rings them,
 * once (tryReachResonance) — so the answer never waits on it.
 */
export const PATCH = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const db = getAdminDb();
  const { card, stale, reaches } = await updateCard(db, user.id, id, parse(UpdateCardRequest, body));
  if (reaches) ringAfter(db, () => tryReachResonance(db, user.id, id));
  if (stale.length) after(() => void revalidateLocalized(stale));
  return NextResponse.json(card);
});

/**
 * DELETE /api/v1/cards/{id}?onlyIfTrashed= — delete your card for good, draft
 * or published; a resonance takes back the connection it made (see
 * deleteCard). Clients with a trash move a card there first (POST …/trash),
 * and their 永久刪除 sends `onlyIfTrashed=true`: a card restored meanwhile is
 * 409 and stays.
 */
export const DELETE = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const { onlyIfTrashed } = parse(DeleteCardQuery, Object.fromEntries(new URL(req.url).searchParams));
  const { stale } = await deleteCard(getAdminDb(), user.id, id, { onlyIfTrashed: onlyIfTrashed === 'true' });
  after(() => void revalidateLocalized(stale));
  return new NextResponse(null, { status: 204 });
});
