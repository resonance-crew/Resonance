import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { knowsSharedCards } from '@/lib/api/v1/clientBuild';
import { CardKeysQuery, CreateDraftRequest } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { getCardsByKeys } from '@/server/app/cardsRead';
import { createDraftIn } from '@/server/app/writer';
import { BRIEF, NEVER, cachedJson } from '@/lib/api/v1/cache';

export const dynamic = 'force-dynamic';

/** GET /api/v1/cards?keys=a,b,c — summaries of several cards (slugs or ids) at once, in the order asked. */
export const GET = withUser(async (user, req) => {
  const { keys } = parse(CardKeysQuery, Object.fromEntries(new URL(req.url).searchParams));
  const body = await getCardsByKeys(serverCtx(), user.id, keys, { shared: knowsSharedCards(req) });
  // A 私人卡 among them (someone's shared with the viewer — or the viewer's own): read on a pass its author can
  // end at any moment (api/v1/sharedCards), so the answer is never kept.
  const kept = body.cards.some((c) => c.visibility === 'private' || !c.publishedAt);
  return cachedJson(req, body, kept ? NEVER : BRIEF);
});

/**
 * POST /api/v1/cards — a new draft under the id your client made (see
 * createDraft): 201 when made, 200 with `created: false` when your draft was
 * there already (a create sent again).
 */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const result = await createDraftIn(serverCtx(), user.id, parse(CreateDraftRequest, body));
  return NextResponse.json(result, { status: result.created ? 201 : 200 });
});
