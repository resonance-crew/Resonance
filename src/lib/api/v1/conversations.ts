import type { AdminDb } from '@/server/infra/firestore/db';
import { ctxFor } from '@/server/infra/firestore/ctx';
import {
  deleteConversationIn,
  mayMessageIn,
  sendMessageIn,
  sendNoteIn,
  type NoteInput,
  type SendMessageInput,
  type SentMessage,
  type SentNote,
} from '@/server/app/conversations';

// Legacy facades: the services are src/server/app/conversations.ts, their
// Firestore code src/server/infra/firestore/repos/conversations.ts. Every
// export here keeps its name and signature (the emulator suites, the routes,
// scripts and other modules import them); the comments say why each is as it is.

export {
  LAST_MESSAGE_PREVIEW,
  MESSAGE_MAX_LENGTH,
  NOTE_MAX_LENGTH,
  NOTE_MESSAGE_KIND,
  NOTE_PREVIEW_CHARS,
  NOTE_REQUEST_MAX,
  REPLY_QUOTE_CHARS,
  cut,
  pairOf,
} from '@/server/domain/conversations';
export type { SendMessageInput, SentMessage, SentNote } from '@/server/app/conversations';

/**
 * `conversations/{pair}.request`: notes left by someone the other isn't
 * connected with, waiting for an answer — a letter (see sendNote). `from` is
 * the writer; `cardId` and `at` are their latest note's card and time;
 * `count` how many they have left unanswered (as their letters/* record
 * counts them). Written by the server only (the rules let a participant
 * change nothing but their unread count), and answered only by its
 * recipient: their message or note to its writer deletes it (and accepting
 * an invite between them does) — connecting them if they aren't. Anything
 * else that connects the two (a resonance) leaves it as it is: clients
 * ignore it while they are connected, and a resonance taken back leaves the
 * letter waiting as it was. It also goes with the conversation: either
 * participant may delete it, the writer withdrawing their letter, its
 * recipient declining it. Gone, it can no longer be answered: the
 * recipient's reply connects no one.
 */
export type { NoteRequest } from '@/server/domain/conversations';

/**
 * The refusal of a note past NOTE_REQUEST_MAX unanswered ones: a conflict,
 * "Wait for them to reply." Its own class so a build before letters, which
 * knows no 409 here, can be told the same in words it shows (./preLetter).
 */
export { NoteLimitReached } from '@/server/app/conversations';

/**
 * `letters/{writer}_{recipient}` = `{ from, to, count, at, cardId }`: how
 * many notes the writer has left someone they aren't connected with, still
 * unanswered (`at` and `cardId`: the latest one's). It is what holds the
 * writer to NOTE_REQUEST_MAX, and it lives where no one but the server
 * reaches (the rules close letters/* to clients): deleting the conversation
 * — which either of the two may do — never resets it, and neither does a
 * connection made otherwise and taken back. Answering the letter deletes it,
 * both ways (clearLetters): the recipient's message or note to its writer,
 * or an invite accepted between them. The account purge takes it from
 * either side.
 */
export { letterRef, lettersLeft, openRequest, holdsRequest } from '@/server/infra/firestore/repos/conversations';

/**
 * A letter answered: the count of each one's unanswered notes to the other
 * goes (blind deletes — a record that isn't there deletes nothing).
 */
export { clearLetters } from '@/server/infra/firestore/repos/conversations';

/**
 * Whether a profile has a pen name — what reaching anyone takes: a note, a
 * message, a resonance's connection and bell, accepting an invite. Whatever
 * reaches someone shows them who it is from (the bell, the thread, the push
 * all carry the name), and an account that never chose one has no page they
 * could block or report it from.
 */
export { hasPenName } from '@/server/infra/firestore/repos/conversations';
export { noPenName } from '@/server/app/conversations';

/**
 * The sender's budget for this send (rateLimit `spend`), which the route
 * starts beside the send rather than before it, so the two overlap. Every
 * attempt spends it, and it still answers first: a send waits for it before
 * any refusal and before writing anything (its transaction awaits it right
 * after its reads), so over budget the answer is the 429 whatever else is
 * wrong with the request — exactly as when the budget was spent first.
 */
export { budgetFirst } from '@/server/app/conversations';

/**
 * Whether `uid` may message `other` now, as sendMessage asks it (outside a
 * transaction: the message's own send asks again). A pen name, no block
 * either way, and a connection — or a letter of theirs waiting for this answer.
 */
export async function mayMessage(db: AdminDb, uid: string, other: string): Promise<void> {
  return mayMessageIn(ctxFor(db), uid, other);
}

/**
 * Send a note (小紙條) to a card's author: what the web's sendNote() does from
 * the client (client/notes.ts), with the author taken from the card — so the
 * app never needs to know who wrote an anonymous one — and with the rules'
 * guarantees re-checked: a card the sender can read, not their own, no block
 * either way. The note rings the author.
 *
 * A note on a named card also lands in the two people's conversation (opened
 * if need be) as a message of its own — `conversations/{pair}/messages/{noteId}`
 * = `{ senderId, text, sentAt, cardRef: cardId, kind: 'note' }` — so both see
 * it in their thread, the author answers it like any message, and it counts
 * as unread there. Its bell row is then written already pushed: the chat push
 * is the one buzz.
 *
 * A note is a letter: it connects no one by itself. Between two people who
 * aren't connected it opens, or adds to, the conversation's `request`
 * (`{ from, cardId, at, count }`, see NoteRequest), and the author's answer is
 * what connects them (sendMessage). Until they are connected, the writer may
 * leave NOTE_REQUEST_MAX notes in all — counted in letters/{writer}_{author}
 * (letterRef), which deleting the conversation leaves as it is; one more is
 * a conflict ("Wait for them to reply."), writing and ringing nothing.
 * Crossing letters: a note to someone whose own letter to the sender is
 * waiting answers it — the two are connected, `request` and both counts gone,
 * in the same transaction, the answered letter the connection's reason
 * (connectionOrigins). Between two people already connected a note is one
 * more message: it counts nothing, and answers a letter only from that
 * letter's recipient (it is kept as a reason then: a resonance taken back
 * leaves them connected); and from the original's author of a resonance of
 * the card's author's that stands, it answers that resonance — kept as a
 * reason for good (answeredBy, ./origins).
 *
 * A note on an anonymous card stays out of every thread, even between two
 * people already connected (the conversation would tell the sender whose card
 * it was), and connects, opens or answers nothing: it rings through its bell
 * row, as before. Whether it is anonymous is read in the note's transaction,
 * beside the blocks: a byline taken off a moment before still keeps it out.
 *
 * The bell of a note on an anonymous card says so (`payload.anonymous`): its
 * push opens the card (lib/push pushRoute), never a thread with the note's
 * writer, which their unread count there would answer for — and the bell
 * lists are to do the same (the clients' part, still to come).
 *
 * A block never answers for an anonymous card (the sender keeps their own
 * block list, and a refusal would name the author): across one, a note on an
 * anonymous card is answered as if delivered and delivers nothing. It is kept
 * as its writer's words — in their export like any note they wrote — but
 * addressed to no one (`toUserId: null`): no bell, no push, readable by no
 * client. It names whom it was withheld from (`withheldFor`, never read by a
 * client nor exported), so it goes with that account as a delivered note
 * goes with its recipient's. The pen name is asked first, so its refusal
 * says nothing either.
 *
 * `clientId` makes sending retry-safe, as it does a message's: it becomes the
 * note's id (and, in the thread, its message's), and sending the same one
 * again — the answer was lost — finds the note already left and answers with
 * it as the first send did (`duplicate`): nothing written, no bell, no
 * letter counted, no push. That holds for as long as the note is there,
 * whatever has become of the blocks or the card's visibility since — it is
 * asked before either — and for a note withheld across a block alike, so a
 * retry tells the sender nothing the first answer didn't. A card deleted
 * (DELETE /cards/{id}) takes its notes with it: a resend after that is
 * not_found, as any note to a missing card is — a withheld note's alike. A
 * `clientId` naming someone else's note is refused; so is one
 * naming a message already in the two people's thread (the note's message
 * would overwrite it), asked only on a named card, where the thread is theirs.
 */
export async function sendNote(db: AdminDb, uid: string, input: NoteInput, spent: Promise<void> = Promise.resolve()): Promise<SentNote> {
  return sendNoteIn(ctxFor(db), uid, input, spent);
}

/**
 * Send a message to someone you're connected with: the web's openConversation
 * + sendMessage (+ the first message's bell) in one transaction. The rules'
 * conditions are re-checked — a connection, no block either way, a
 * non-empty message unless it carries a card (one you can read). A reply to
 * a note carries its noteRef so the thread shows what it answers: a note the
 * recipient left the sender, nothing else. Only one left on a card under the
 * sender's name keeps it: a reply to a note on their anonymous card is sent
 * without it, quietly — the thread is the other person's to read, and the
 * note's card would tell them whose card it was. So is a reply to a note gone
 * with its card (deleting a card deletes its notes): the reply still goes,
 * and still answers a letter.
 *
 * Or answer a letter: with no connection, a message is allowed only to
 * someone whose notes to you wait in your conversation (`request.from` is
 * them, see sendNote), and that answer is what connects you — the
 * connection made, `request` and both people's letters/* counts deleted in
 * the same transaction as the message. Everyone else, the letter's own
 * writer included, is refused as before — and so is everyone once the
 * conversation holding the letter is deleted (withdrawn or declined). Between
 * two people already connected (a resonance did it) a letter still waiting is
 * answered the same way, by its recipient only, and stays a reason they are
 * connected (connectionOrigins); a message from its writer leaves it waiting.
 * A message from the original's author of a resonance that stands between
 * the two, to its writer, answers that resonance: kept as a reason for good
 * (answeredBy), so taking the resonance back leaves them connected. Words
 * before a resonance never answer it, and the resonator's answer nothing.
 *
 * `replyTo` names a message of this same conversation; the new message keeps
 * a snapshot of it (`replyTo: { id, senderId, text, cardRef? }`, the text cut
 * to REPLY_QUOTE_CHARS) so the thread can quote it without reading it, and
 * so the quote survives the original being deleted with the conversation.
 *
 * `clientId` makes sending retry-safe: it becomes the message's id, and
 * sending the same one again — the answer was lost — finds the message
 * already written and returns it as it is (`duplicate`), counting no unread,
 * ringing no bell. A `clientId` that names someone else's message is refused.
 *
 * The first message of a conversation still writes its bell row, but already
 * marked pushed: the chat push (`pushMessage`, which rings for every message)
 * is the one that buzzes, never two.
 *
 * The sender needs a pen name (hasPenName): the thread, its bell and every
 * push name them. It is asked before the blocks, as everywhere.
 *
 * A sticker (round 22, `sticker: { pack, id }` of lib/stickers/catalog) is a
 * message of its own: no words, card, picture or note beside it (400 'A
 * sticker is sent on its own.'; one the catalog doesn't hold is 400 'That is
 * not a sticker.'), though it may answer a message (`replyTo`). It is kept as
 * `sticker: { pack, id }` with its fallback words as `text` — 〔貼圖：謝謝〕 or
 * [Sticker: Thanks], in the recipient's profile language (zh-TW unless it is
 * en) — which builds that can't draw a sticker show (installed builds draw an
 * empty bubble for an empty text); the list's preview is those words with
 * `sticker: true`, and a reply to it quotes them with its `sticker`.
 * Everything else is any message's: the connection or the letter it answers,
 * the pen name, the blocks, `clientId`, the unread count, the budget.
 *
 * An album (round 22, `album: { id, index, count }`) is one of several
 * pictures sent together, each its own message: only beside `image` (400 'An
 * album holds pictures only.'), kept as it was sent. Only its first picture
 * (`index` 0) rings the other person's phone (`silent` on the others; the
 * push asks again).
 */
export async function sendMessage(db: AdminDb, uid: string, input: SendMessageInput, spent: Promise<void> = Promise.resolve()): Promise<SentMessage> {
  return sendMessageIn(ctxFor(db), uid, input, spent);
}

/**
 * Delete a conversation, everything in it, for both of its people (DELETE
 * /conversations/{pair}): its messages and the conversation itself, with its
 * letter if one waits (the writer withdraws it, its recipient declines it; the
 * count of three is kept apart, in letters/*, and stays). Either participant
 * may; for anyone else it is a missing conversation's 404 whether it exists or
 * not (who talks to whom is no one else's to probe). One already gone is
 * nothing (a retry after a lost answer). The messages go before the
 * conversation, so one cut short is still listed and can be deleted again.
 */
export async function deleteConversation(db: AdminDb, uid: string, pair: string): Promise<void> {
  return deleteConversationIn(ctxFor(db), uid, pair);
}
