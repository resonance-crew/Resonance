import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import { refusalForPreLetterBuildIn } from '@/server/app/preLetter';

/**
 * What the app builds made before letters (iOS ≤ 6, Android ≤ 7: see
 * ./clientBuild) still need from the server, and only they get. Those builds
 * are in the stores until the next version; remove this module (and its
 * callers: getProfile in ./reads, POST /api/v1/notes and …/publish) once they
 * are retired.
 *
 * The contract is the same for everyone — these change an answer's value or
 * status (to one the contract already lists), never its shape. A User-Agent
 * is anyone's to send, so none gives anything away: what each says, the
 * viewer could already see or do.
 */

// Legacy facades (src/server/README.md): today's exports and signatures, run
// by the services of src/server/app/preLetter.ts on a context bound to `db`.

/**
 * GET /users/{handle}: whether to tell a build before letters that it is
 * connected to someone it isn't. Those builds open a thread, and its
 * composer, only for someone their profile says they're connected with — so
 * a letter left them (a note from someone they aren't connected with: see
 * sendNote) could be neither read whole nor answered. It reads as connected
 * while that letter waits for the viewer's answer: `request.from` of the
 * two's conversation is the profile's person, exactly what sendMessage takes
 * as an answer — and the reply the thread then sends connects them.
 *
 * Never to the letter's writer (`request.from` is then the viewer), never
 * across a block either way (the viewer's own is the caller's to ask, its
 * profile read holds it; theirs is read here, only when a letter waits), and
 * never for a note on an anonymous card, which opens no letter. All it tells
 * the viewer is what their own Messages show: a letter from this person,
 * waiting for them.
 *
 * (Takes the conversation as a snapshot: implemented in
 * src/server/infra/firestore/legacy/graph.ts, re-exported.)
 */
export { letterReadsAsConnection } from '@/server/infra/firestore/legacy/graph';

/**
 * A refusal as a build before letters is to get it — `e` itself for every
 * other request, and for every other refusal. Those builds show the server's
 * message as it is (the newer clients put their own words to these codes),
 * so two come in the words the web and the newer apps show, in the app's own
 * language (appLocale):
 *
 * - POST /notes past the unanswered notes a writer may leave: a 409 they
 *   don't know (they show "Couldn't send"), so a 403 (`forbidden`), whose
 *   message they show — "wait for their reply".
 * - Publishing a card anonymous and for connections only (a web draft's
 *   audience, kept by those builds, with their anonymous switch: see
 *   firestore.rules): the 400 as it is, saying an anonymous card is public or
 *   only for its author — which those builds can pick.
 *
 * Nothing was written either way.
 */
export function refusalForPreLetterBuild(db: AdminDb, uid: string, req: Request, e: unknown): Promise<unknown> {
  return refusalForPreLetterBuildIn(ctxFor(db), uid, req, e);
}

// What appLocale (src/server/app/preLetter.ts) answers:
// The language a request's app speaks (the server's messages are otherwise
// English): the one it last registered for pushes on this platform (the
// app's own setting), else the language the request asks for (iOS sends the
// system's; OkHttp none), else the profile's primaryLocale. Read only on a
// refusal — and never in its way: a read that fails falls back to the
// language asked for (else English), so the refusal still goes out.
