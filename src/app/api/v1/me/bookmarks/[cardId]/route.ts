import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { budgetFirst } from '@/server/app/budget';
import { deleteBookmarkIn, putBookmarkIn } from '@/server/app/social';

export const dynamic = 'force-dynamic';

/** PUT /api/v1/me/bookmarks/{cardId} — bookmark a card you may read (204; again: unchanged). */
export const PUT = withUser(async (user, _req, ctx: RouteContext<'cardId'>) => {
  const cardId = parse(CardIdParam, await routeParam(ctx, 'cardId'));
  const server = serverCtx();
  // The budget beside the card's read (BE-7), still answering first: the bookmark waits for it before writing.
  const spent = server.limits.spend(user.id, 'bookmark');
  await budgetFirst(spent, () => putBookmarkIn(server, user.id, cardId, spent));
  return new Response(null, { status: 204 });
});

/** DELETE /api/v1/me/bookmarks/{cardId} — take the bookmark back (204, whether or not there was one). */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'cardId'>) => {
  const cardId = parse(CardIdParam, await routeParam(ctx, 'cardId'));
  const server = serverCtx();
  await server.limits.spend(user.id, 'bookmark');
  await deleteBookmarkIn(server, user.id, cardId);
  return new Response(null, { status: 204 });
});
