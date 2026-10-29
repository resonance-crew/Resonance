package com.resonance.app.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.layout.height
import com.resonance.design.ModalErrorGap
import com.resonance.design.ModalErrorTuck
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import com.resonance.app.PushCenter
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.FieldLabel
import com.resonance.design.ModalActions
import com.resonance.design.LocalToasts
import com.resonance.design.Toasts
import com.resonance.design.OrganicIcon
import com.resonance.design.fieldHintStyle
import com.resonance.design.fieldSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.chat.NoteDraft
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.delay

/** The most a note (or a message) may hold, in UTF-16 units — the rules' own cap. */
const val NOTE_MAX_LENGTH = 2000

/** Past this many characters the composer offers to make the note a resonance card. */
const val NOTE_UPGRADE_THRESHOLD = 200

/**
 * NoteComposer (the plain variant in its modal): a little note to the card's
 * author — the only reader it will ever have. Four lines to write in, the
 * privacy hint for the first few times, the count, and past 200 characters an
 * offer to make it a resonance card instead (`onUpgrade` carries its words
 * into the writer). 寄出 closes it at once (round 21) with 紙條寄出了, and the
 * note goes on from the account's scope ([sendNoteOnward]); one that doesn't
 * go says so in a toast whose 再寄一次 opens the composer again on its words
 * ([onOpenCard]: the card's page, when it is no longer on screen). The twin
 * of iOS's NoteComposer.
 *
 * Its words wait on the device until the note goes ([NoteDraft]): closed any
 * way — a tap beside the sheet, back, 取消, 寄出 — or with the app killed, the
 * composer opens on them again for this card; sent (the server's 201) or
 * emptied, nothing is kept.
 */
@Composable
fun NoteComposer(session: Session, cardId: String, onClose: () -> Unit, onUpgrade: (String) -> Unit, onOpenCard: () -> Unit = {}) {
    val toasts = LocalToasts.current
    val draft = remember(session, cardId) { NoteDraft(session.noteDrafts, cardId) }
    var text by remember(draft) { mutableStateOf(draft.initial) }
    // Kept a moment after typing stops, as the app leaves the screen, and on every way out of the composer.
    val typed by rememberUpdatedState(text)
    LaunchedEffect(draft, text) {
        delay(NOTE_DRAFT_DELAY_MS)
        draft.keep(text)
    }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { draft.keep(typed) }
    DisposableEffect(draft) { onDispose { draft.keep(typed) } }
    var showsHint by remember { mutableStateOf(false) }
    var focused by remember { mutableStateOf(false) }

    // The web counts the trimmed text in UTF-16 units (Kotlin's length is the same unit).
    val count = text.trim().length
    val valid = count > 0 && count <= NOTE_MAX_LENGTH && session.me != null

    LaunchedEffect(Unit) { showsHint = session.hints?.claim("note-privacy") ?: false }

    Column(Modifier.fillMaxWidth()) {
        Box(Modifier.padding(bottom = 10.dp)) { FieldLabel(L10n.Card.Note.label) }
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = 96.dp)
                .fieldSurface(17.0, { focused })
                .padding(horizontal = Tokens.FieldPadX.dp, vertical = Tokens.FieldPadY.dp),
        ) {
            if (text.isEmpty()) BasicText(L10n.Card.Note.placeholder, style = fieldHintStyle(L10n.Card.Note.placeholder))
            BasicTextField(
                text, { text = capped(it, NOTE_MAX_LENGTH) },
                textStyle = AppFonts.body(15f, lineHeight = 1.6f),
                cursorBrush = SolidColor(Tokens.Text),
                minLines = 4,
                maxLines = 8,
                modifier = Modifier.fillMaxWidth().onFocusChanged { focused = it.isFocused },
            )
        }
        Row(Modifier.fillMaxWidth().padding(top = 6.dp), verticalAlignment = Alignment.Top, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (showsHint) BasicText(L10n.Card.Note.hint, style = AppFonts.body(12f, lineHeight = 1.5f, color = Tokens.TextMuted), modifier = Modifier.weight(1f))
            else Spacer(Modifier.weight(1f))
            BasicText(
                "$count / $NOTE_MAX_LENGTH",
                style = AppFonts.body(11f, lineHeight = 1.3f, color = if (count > NOTE_MAX_LENGTH) Tokens.Terracotta else Tokens.TextMuted)
                    .copy(fontFeatureSettings = "tnum"),
            )
        }
        if (count > NOTE_UPGRADE_THRESHOLD) {
            BasicText(
                L10n.Card.Note.upgrade,
                style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.Terracotta).copy(textDecoration = TextDecoration.Underline),
                modifier = Modifier.padding(top = 2.dp, bottom = 10.dp).plainClickable(role = Role.Button) {
                    // Carried into a card of its own (the web's rule): the writer keeps the words from here.
                    draft.sent()
                    onUpgrade(text)
                },
            )
        }
        // The modal is the frame: cancel the tonal pill, Send the solid verb, rightmost — the foot
        // every dialog shares; Send waits, faded, until there is something to send.
        ModalActions(
            L10n.Card.Note.cancel, onClose, L10n.Card.Note.send,
            verbEnabled = valid, topPadding = NoteFootTop,
            onVerb = {
                if (valid) {
                    // Kept until the server has it (the composer's close keeps it too): 再寄一次 opens on these words.
                    draft.keep(text)
                    onClose()
                    toasts.show(L10n.Card.Note.sent)
                    sendNoteOnward(session, toasts, cardId, text.trim(), onOpenCard)
                }
            },
        )
    }
}

/**
 * The note on its way once its composer has closed (round 21): under the card's one client id until it is
 * left ([com.resonance.app.NoteSends.attempt]: the same words sent again after a failure are a retry the
 * server recognises, never a second note), in the account's scope. Delivered, its kept words go (unless the
 * composer has been opened on other words since) and the notification permission may be asked; refused,
 * the toast says why — 紙條沒寄出, or that notes wait for a reply — with 再寄一次, which opens the composer
 * again on the kept words; a card gone says so alone (sending again won't help).
 */
internal fun sendNoteOnward(session: Session, toasts: Toasts, cardId: String, words: String, openCard: () -> Unit) {
    val sends = session.noteSends
    val drafts = session.noteDrafts
    session.launch {
        try {
            sends.attempt(cardId).send(cardId, words) { clientId -> session.messaging.sendNote(cardId, words, clientId) }
            if (drafts?.text(cardId)?.trim() == words) drafts.clear(cardId)
            PushCenter.reachedOut()
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            val gone = e is ApiFailure && e.status == 404
            toasts.show(
                noteFailure(e),
                action = if (gone) null else Toasts.Action(L10n.Card.Note.reopen, L10n.Card.Note.reopen, IconName.Note) {
                    sends.requestReopen(cardId, openCard)
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

/** The air over the composer's foot (the dialogs' 18, as when an error line stood over it). */
private val NoteFootTop = ModalErrorGap + ModalErrorTuck

/** How long after the last keystroke a note's draft is written down. */
private const val NOTE_DRAFT_DELAY_MS = 400L

/**
 * Why a note didn't go, in the app's words — never the server's English: notes waiting
 * unanswered, that the next one waits for their reply; a card gone (deleted, or hidden from the
 * writer since — a note resent after a deletion too, which took its notes with it), that it can't
 * be found, since sending again won't help; anything else (a refusal, a block either way — which
 * it doesn't tell apart — the network), that it didn't send. As the web's composer says.
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
