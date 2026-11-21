import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { countCardReadIn } from '@/server/app/cardReads';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/cards/{id}/read — the card page shows the card: count the read
 * (lib/api/v1/cardReads — once per reader, card and UTC day, never its
 * author's). Answered 204 at once, whatever the card and whether it counted;
 * the counting runs after the response. A quiet write that reaches no one,
 * so it takes this instance's cached word on revocation, as reads do.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  const server = serverCtx();
  server.later.later(
    () => countCardReadIn(server, user.id, id).catch((err) => console.error(`Card read: counting ${id} failed`, err)),
    'read',
  );
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
}, { revocation: 'cached' });
