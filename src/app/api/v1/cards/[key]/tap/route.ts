import { NextResponse, after } from 'next/server';
import { ApiFailure, parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { setTap } from '@/lib/api/v1/taps';
import { CardIdParam } from '@/lib/api/v1/schemas';
import { spend } from '@/lib/api/rateLimit';
import { budgetFirst } from '@/lib/api/v1/conversations';
import { getAdminDb, getAdminMessaging } from '@/lib/db/firestore/admin';
import { isReservedId } from '@/lib/db/firestore/reservedId';
import { pushTap, ringTap, untapBell } from '@/lib/push/tapBell';

export const dynamic = 'force-dynamic';

/**
 * PUT /api/v1/cards/{id}/tap — resonate with a card (共振, the tap; see
 * lib/api/v1/taps setTap). Answers `{ on, changed }` at once; ringing its
 * author — once ever per reader and card, never across a block — runs after
 * the response, in its own transaction (lib/push/tapBell ringTap → pushTap).
 * It reaches someone: the default live revocation check.
 */
export const PUT = withUser(async (user, _req, ctx: RouteContext<'key'>) => tap(user.id, ctx, true));

/**
 * DELETE /api/v1/cards/{id}/tap — take it back: `{ on: false, changed }`. It
 * tells no one; after the response the reader leaves the bell row their ring
 * wrote (lib/push/tapBell untapBell).
 */
export const DELETE = withUser(async (user, _req, ctx: RouteContext<'key'>) => tap(user.id, ctx, false));

async function tap(uid: string, ctx: RouteContext<'key'>, on: boolean): Promise<Response> {
  const id = parse(CardIdParam, await routeParam(ctx, 'key'));
  // An id Firestore keeps for itself names no card: answered as one, before it costs any of the budget.
  if (isReservedId(id)) throw new ApiFailure('not_found', 'No such card.');
  const db = getAdminDb();
  // The budget is spent beside the tap's reads, not before them (B7), and still answers first (budgetFirst).
  const spent = spend(db, uid, 'tap');
  const { ring, ...result } = await budgetFirst(spent, () => setTap(db, uid, id, on, Date.now(), spent));
  if (result.changed && ring) {
    after(async () => {
      try {
        const rang = await ringTap(db, uid, id);
        if (rang) await pushTap(db, await getAdminMessaging(), { ...rang, from: uid, cardId: id });
      } catch (e) {
        console.error('[tap] ring', id, e);
      }
    });
  }
  if (result.changed && !on) after(() => untapBell(db, uid, id).catch((e) => console.error('[tap] bell', id, e)));
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } });
}
