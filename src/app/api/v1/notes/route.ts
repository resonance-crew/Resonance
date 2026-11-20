import { NextResponse } from 'next/server';
import { ApiFailure, parse, withUser } from '@/lib/api/v1/http';
import { SendNoteRequest } from '@/lib/api/v1/schemas';
import { serverCtx } from '@/server/ctx';
import { sendNoteIn } from '@/server/app/conversations';
import { refusalForPreLetterBuildIn } from '@/server/app/preLetter';
import { afterNoteSentIn, ringAfterIn } from '@/server/app/pushAfter';

export const dynamic = 'force-dynamic';

/**
 * POST /api/v1/notes — send a note to a card's author (see sendNote). After
 * the response the author's phone rings once: through the chat push when the
 * note went into the two people's thread, through its bell row when the card
 * is anonymous (no thread). Answers 201 with the note's id, also when
 * `clientId` named one already left — and that resend rings no one. Past
 * the unanswered notes a writer may leave it is a 409 — a 403 to an app
 * build made before letters (lib/api/v1/preLetter).
 */
export const POST = withUser(async (user, req) => {
  const body = await req.json().catch(() => {
    throw new ApiFailure('invalid_request', 'The body must be JSON.');
  });
  const input = parse(SendNoteRequest, body);
  const server = serverCtx();
  // Spent beside the send's reads, and still before any refusal or write (sendNote awaits it).
  const spent = server.limits.spend(user.id, 'note');
  spent.catch(() => {});
  const { id, notificationId, push, duplicate } = await sendNoteIn(server, user.id, input, spent).catch(async (e: unknown) => {
    // A build before letters knows no 409 here: it is told the same with a 403, whose words it shows.
    throw await refusalForPreLetterBuildIn(server, user.id, req, e);
  });
  if (!duplicate) {
    if (push) afterNoteSentIn(server, push);
    else ringAfterIn(server, notificationId);
  }
  return NextResponse.json({ id }, { status: 201 });
});
