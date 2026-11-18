package com.resonance.app.ui

import com.resonance.app.AskKind
import com.resonance.app.PushCenter
import com.resonance.app.Session
import com.resonance.design.Toasts
import com.resonance.design.generated.IconName
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException

/** The most a note (or a message) may hold, in UTF-16 units — the rules' own cap. */
const val NOTE_MAX_LENGTH = 2000

/** Past this many characters the note's field offers to make the note a card of its own instead. */
const val NOTE_UPGRADE_THRESHOLD = 200

/**
 * The note on its way once its field has closed (round 21; round 26: the field is in the page, never a dialog — see
 * [NoteInPlace]): under the card's one client id until it is left ([com.resonance.app.NoteSends.attempt]: the same
 * words sent again after a failure are a retry the server recognises, never a second note), in the account's scope.
 * Delivered, its kept words go (unless the field has been written in since) and the notification permission may be
 * asked; refused while the card's page is still on screen, the words go back into its field and the line under it
 * says why; refused after the page is gone, the toast says why — 紙條沒寄出, or that notes wait for a reply — with
 * 再寄一次, which opens the card with the field open and focused on the kept words; a card gone says so alone
 * (sending again won't help).
 */
internal fun sendNoteOnward(session: Session, toasts: Toasts, cardId: String, words: String, openCard: () -> Unit) {
    val sends = session.noteSends
    val drafts = session.noteDrafts
    session.launch {
        try {
            sends.attempt(cardId).send(cardId, words) { clientId -> session.messaging.sendNote(cardId, words, clientId) }
            if (drafts?.text(cardId)?.trim() == words) drafts.clear(cardId)
            PushCenter.reachedOut(AskKind.Reply)
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val gone = e is ApiFailure && e.status == 404
            if (sends.shown(cardId)) {
                sends.requestReopen(cardId, error = noteSendError(e), openCard = openCard)
                return@launch
            }
            toasts.show(
                noteFailure(e),
                action = if (gone) null else Toasts.Action(L10n.Card.Note.reopen, L10n.Card.Note.reopen, IconName.Note) {
                    sends.requestReopen(cardId, openCard = openCard)
                },
            )
        }
    }
}

/** What a toast says of a note that didn't go: notes waiting unanswered, a card gone, else 紙條沒寄出. */
internal fun noteFailure(e: Exception): String = when {
    e is ApiFailure && e.isConflict -> L10n.Card.Note.waitForReply
    e is ApiFailure && e.status == 404 -> L10n.Card.NotFound.title
    else -> L10n.Card.Note.failed
}

/**
 * Why a note didn't go, in the app's words — never the server's English: notes waiting
 * unanswered, that the next one waits for their reply; a card gone (deleted, or hidden from the
 * writer since — a note resent after a deletion too, which took its notes with it), that it can't
 * be found, since sending again won't help; anything else (a refusal, a block either way — which
 * it doesn't tell apart — the network), that it didn't send. As the web's field says.
 */
internal fun noteSendError(e: Exception): String = when {
    e is ApiFailure && e.isConflict -> L10n.Card.Note.waitForReply
    e is ApiFailure && e.status == 404 -> L10n.Card.NotFound.title
    else -> L10n.Messages.sendError
}

/** Text held to `max` UTF-16 units (the field's maxLength), never cutting a surrogate pair in two. */
internal fun capped(text: String, max: Int): String {
    if (text.length <= max) return text
    val cut = if (text[max - 1].isHighSurrogate()) max - 1 else max
    return text.take(cut)
}
