/**
 * Why two people are connected — `connectionOrigins/{pair}`, beside the
 * connection and with the same id, server-only (the rules close it: it names
 * which card of whose made the connection, and a resonance can be made
 * anonymous later). It is what lets taking a resonance back take back the
 * connection it alone stands for, and nothing else:
 *
 * - `reasons`: every reason the two are connected now, by key —
 *   `resonance_{by}_{cardId}` for each standing resonance that reached (the
 *   one that connected them and each one after it while they were),
 *   `answered_{writer}` once the original's author of a standing resonance
 *   has written to its writer (a message, or a note in their thread: the
 *   resonance answered), `letter` once a letter's recipient has answered it,
 *   `invite_{id}` for an accepted invite, and `legacy` for a connection made
 *   before reasons were kept (written the first time anything is added to
 *   it). Only resonances are ever taken back; the rest stand for good, so
 *   taking one back ends the connection exactly when no reason is left;
 * - `resonanceCards`: the resonance cards among them, what a take-back finds
 *   the document by (the card's original may be gone by then).
 *
 * An answer is recorded in the transaction of the words that make it, read
 * against the reasons as they stand then: words written before a resonance
 * never answer it, and the resonator's own words answer nothing. Kept here,
 * not judged from the thread, because either of them may delete the thread.
 *
 * A new connection writes it afresh, so nothing of an earlier connection
 * between the same two (one a block ended) counts for this one. Purged with
 * either account.
 */
export {
  ORIGINS,
  answeredByReasons,
  inviteReason,
  letterReason,
  resonanceReason,
  type ConnectionReason,
  type KeyedReason,
  type Origins,
} from '@/server/domain/graph';

// The legacy Transaction helpers (src/server/README.md), composed today by
// other modules' transactions (./conversations, ./trash, ./cards, ./edits):
// their old signatures, implemented in src/server/infra/firestore (the graph
// repository's own code), re-exported here until those callers move to
// `tx.graph`.
//
// - connect(tx, db, [a, b], reason, { extra }): connect two people, in the
//   transaction that found them not connected: the connection (`extra` beside
//   its two fields) and its origins, afresh — the one reason.
// - addReason(tx, db, [a, b], origins, ...added): more reasons two people
//   already connected are (`origins` as read in the same transaction; a null
//   among them adds nothing, and none writes nothing): kept beside the
//   others. A connection older than reasons gets `legacy` with its first one,
//   so taking that one back never ends it.
// - answeredBy(origins, uid, other): what `uid` writing to `other` — a
//   message, or a note in their thread, between two people connected —
//   answers: a resonance of `other`'s standing on a card of `uid`'s (its
//   original's author writing to its writer), kept as `answered_{other}` for
//   good. Null when the words answer none (no resonance of theirs stands now —
//   words before it never answer it, and a resonator's words to the
//   original's author answer nothing), or the answer is kept already.
// - readTakeBack(tx, db, uid, cardId): read, in `tx` before it writes, what
//   taking back `uid`'s resonance `cardId` means: the reason it stands for
//   (found by the card, whatever it answers or whether that is still there),
//   and whether the connection goes with it — exactly when no other reason is
//   left: another resonance either way, the original's author's answer to
//   one, an answered letter, an invite, a connection older than reasons.
// - takeBack(tx, plans): write what readTakeBack read: the reason goes, and
//   the connection with its origins when nothing else holds it.
export { addReason, connect, originsRef, readTakeBack, takeBack, type TakeBack } from '@/server/infra/firestore/repos/graph';
export { answeredBy } from '@/server/infra/firestore/legacy/graph';
