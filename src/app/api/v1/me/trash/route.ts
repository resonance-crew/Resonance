import { NextResponse, after } from 'next/server';
import { parse, withUser } from '@/lib/api/v1/http';
import { emptyTrash } from '@/lib/api/v1/trash';
import { EmptyTrashQuery } from '@/lib/api/v1/schemas';
import { revalidateLocalized } from '@/lib/api/revalidate';
import { spend } from '@/lib/api/rateLimit';
import { getAdminDb } from '@/lib/db/firestore/admin';

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
  const db = getAdminDb();
  await spend(db, user.id, 'trash');
  const { stale, ...result } = await emptyTrash(db, user.id, { before: before ? new Date(before) : null });
  if (stale.length) after(() => void revalidateLocalized(stale));
  return NextResponse.json(result);
});
