import { NextResponse } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { legacyVectors } from '@/lib/api/v1/cards';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { serverCtx } from '@/server/ctx';
import { ringAfterIn } from '@/server/app/pushAfter';
import { restoreCardIn } from '@/server/app/trash';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/cards/{id}/restore — bring your card back from the trash as
 * it was (see restoreCard). A resonance that never reached its original's
 * author rings them after the response, once ever; its pages are
 * revalidated then too. Restoring spends a budget of its own: clearing many
 * cards never uses up what their undo needs.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'key'>) => {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  const server = serverCtx();
  await server.limits.spend(user.id, 'restore');
  // The vectors as the legacy restoreCard reached them (lib/api/v1/cards legacyVectors: the configured store).
  const { stale, notificationId, ...result } = await restoreCardIn(serverCtx({ vectors: legacyVectors() }), user.id, id);
  ringAfterIn(server, notificationId);
  if (stale.length) server.later.later(() => void server.pages.revalidate(stale), 'revalidate');
  return NextResponse.json(result);
});
