import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { SendMessageRequest } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { sendMessageIn } from '@/server/app/conversations';
import { afterMessageSentIn } from '@/server/app/pushAfter';
import { OWN_SIGNALS_HEADER, type OwnSignals } from '@/server/app/inbox';

export const dynamic = 'force-dynamic';
// The push and the link preview run after the response, within the function's time:
// an unfurl may take its 8 s (UNFURL_DEADLINE_MS) beside a multicast.
export const maxDuration = 30;

/**
 * POST /api/v1/messages — message someone you're connected with (see
 * sendMessage). Answers 201 with the message's id, also when `clientId` named
 * one already sent (the retry gets the same answer). After the response the
 * recipient's phone rings and the message's link, if any, is unfurled.
 */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(SendMessageRequest, body);
  const server = serverCtx();
  // Spent beside the send's reads, and still before any refusal or write (sendMessage awaits it).
  const spent = server.limits.spend(user.id, 'message');
  spent.catch(() => {});
  const own: { signals?: OwnSignals } = {};
  const sent = await sendMessageIn(server, user.id, input, spent, (signals) => (own.signals = signals));
  afterMessageSentIn(server, sent, input.text);
  // The sender's own counters after the send: their client takes them as heard (client/signals pokeOwn).
  return NextResponse.json(
    { conversationId: sent.conversationId, id: sent.id },
    { status: 201, headers: own.signals ? { [OWN_SIGNALS_HEADER]: JSON.stringify(own.signals) } : {} },
  );
});
