import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam, TapListQuery } from '@/lib/api/v1/schemas';
import { OWN, cachedJson } from '@/lib/api/v1/cache';
import { serverCtx } from '@/server/ctx';
import { shadowRead } from '@/server/app/shadow';
import { shadowFromEnv } from '@/server/infra/shadow';
import { listTapsIn } from '@/server/app/taps';

export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/cards/{id}/taps?pageToken=&passage= — who resonated with a card (共振,
 * the tap), as the viewer may see them: everyone for its author (a page at a
 * time, with the excerpt of a note each left on a named card), the people
 * they are connected with for a reader (see lib/api/v1/taps listTaps);
 * `passage`, the author's people of one picked sentence (round 29). The
 * viewer's own view of who reached them, or of their connections: no-cache.
 */
export const GET = withUser(async (user, req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const { pageToken, passage } = parse(TapListQuery, Object.fromEntries(new URL(req.url).searchParams));
  const sctx = serverCtx();
  const body = await listTapsIn(sctx, user.id, id, pageToken, passage);
  // Shadow-read when READ_BACKEND=shadow (app/shadow.ts): the log names the card by a hash only.
  shadowRead(sctx, shadowFromEnv(), 'GET /api/v1/cards/{id}/taps', `${user.id}:${id}`, body, (s) => listTapsIn(s, user.id, id, pageToken, passage));
  return cachedJson(req, body, OWN);
});
