import { NextResponse } from 'next/server';
import { parse, withUser } from '@/lib/api/v1/http';
import { legacyVectors } from '@/lib/api/v1/cards';
import { EmptyTrashQuery } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { emptyTrashIn } from '@/server/app/trash';

export const dynamic = 'force-dynamic';
// A page of up to 50 cards, each deleted with its notes, edit and vectors.
export const maxDuration = 60;

/**
 * DELETE /api/v1/me/trash?before= — empty your trash, a page at a time (see
 * emptyTrash): call again with the answer's `before` while `remaining` and
 * `deleted` are both above 0. The deleted cards' pages are revalidated after
 * the response.
 */
export const DELETE = withUser(async (user, req) => {
  const { before } = parse(EmptyTrashQuery, Object.fromEntries(new URL(req.url).searchParams));
  const server = serverCtx();
  await server.limits.spend(user.id, 'trash');
  // The vectors as the legacy emptyTrash reached them (lib/api/v1/cards legacyVectors: the configured store).
  const { stale, ...result } = await emptyTrashIn(serverCtx({ vectors: legacyVectors() }), user.id, { before: before ? new Date(before) : null });
  if (stale.length) server.later.later(() => void server.pages.revalidate(stale), 'revalidate');
  return NextResponse.json(result);
});
