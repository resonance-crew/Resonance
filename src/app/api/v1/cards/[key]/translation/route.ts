import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { translateCard } from '@/lib/api/v1/translation';
import { CardKey, TranslationRequest } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';

export const dynamic = 'force-dynamic';
// A long story is up to eight model calls, six at a time, given 50 s in all (lib/ai/translate).
export const maxDuration = 60;

/**
 * POST /api/v1/cards/{key}/translation `{ to }` — a published public story
 * translated by AI for its reader, by slug or id (see translateCard). Never
 * cached: a kept translation is answered from Firestore, not from a cache.
 */
export const POST = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const key = parse(CardKey, await routeParam(ctx, 'key'));
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const { to } = parse(TranslationRequest, body);
  const answer = await translateCard(getAdminDb(), user.id, key, to);
  return NextResponse.json(answer, { headers: { 'Cache-Control': 'no-store' } });
});
