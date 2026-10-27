import { NextResponse } from 'next/server';
import { parse, routeParam, withUser, type RouteContext } from '@/lib/api/v1/http';
import { unsendMessage } from '@/lib/api/v1/messageActions';
import { afterMessageUnsent } from '@/lib/api/v1/afterMessage';
import { ConversationIdParam, MessageIdParam } from '@/lib/api/v1/schemas';
import { getAdminDb } from '@/lib/db/firestore/admin';
import { spend } from '@/lib/api/rateLimit';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/conversations/{pair}/messages/{messageId}/unsend — unsend a
 * message you sent, within 24 hours (see unsendMessage): 204, also for one
 * already unsent. After the response the recipient's phone is told
 * (pushUnsend), so a lock screen stops showing what it said.
 */
export const POST = withUser(async (user, _req, ctx: RouteContext<'pair' | 'messageId'>) => {
  const pair = parse(ConversationIdParam, await routeParam(ctx, 'pair'));
  const messageId = parse(MessageIdParam, await routeParam(ctx, 'messageId'));
  const db = getAdminDb();
  await spend(db, user.id, 'unsend');
  const { push } = await unsendMessage(db, user.id, pair, messageId);
  afterMessageUnsent(db, push);
  return new NextResponse(null, { status: 204 });
});
