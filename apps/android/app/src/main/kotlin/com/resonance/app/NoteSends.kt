package com.resonance.app

import com.resonance.kit.chat.NoteAttempt
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Notes on their way (round 21: the note's field closes as 寄出 is pressed, and the note goes on from the
 * account's scope). Each card keeps its [NoteAttempt] here, so a note sent again on the same words after
 * a failure goes under the same client id — a retry the server recognises, never a second note — and a
 * failure asks for the card's note field to open again on its kept words ([reopen]): on its page when it
 * is on screen, saying why there ([Reopen.error]; round 26, the note in place), or from the toast's
 * 再寄一次, which opens the card with the field open and focused. Belongs to the account: emptied when it
 * signs out or another signs in.
 */
class NoteSends {
    /** A card's note field to open again, focused, on its kept words — with why the note didn't go, said under it. */
    data class Reopen(val cardId: String, val error: String? = null)

    private val attempts = HashMap<String, NoteAttempt>()
    private val hosts = HashMap<String, Int>()
    private val _reopen = MutableStateFlow<Reopen?>(null)

    /** The card whose note field is to open again, until the card's end row takes it ([took]). */
    val reopen: StateFlow<Reopen?> = _reopen

    /** The attempt notes to [cardId] go under. */
    @Synchronized
    fun attempt(cardId: String): NoteAttempt = attempts.getOrPut(cardId) { NoteAttempt() }

    /** The end row of [cardId]'s page is on screen ([present]), or gone. */
    @Synchronized
    fun host(cardId: String, present: Boolean) {
        val n = (hosts[cardId] ?: 0) + if (present) 1 else -1
        if (n > 0) hosts[cardId] = n else hosts.remove(cardId)
    }

    /** Whether [cardId]'s page is on screen, its note field there to take its words back. */
    @Synchronized
    fun shown(cardId: String): Boolean = (hosts[cardId] ?: 0) > 0

    /**
     * [cardId]'s note field opens again, focused: where its page is on screen, or on the page [openCard] opens for it
     * (whose end row takes the request as it comes). [error] is why the note didn't go, said under the field.
     */
    fun requestReopen(cardId: String, error: String? = null, openCard: () -> Unit) {
        _reopen.value = Reopen(cardId, error)
        if (!shown(cardId)) openCard()
    }

    /** The note field of [cardId] opened again: the request is done. */
    fun took(cardId: String) {
        if (_reopen.value?.cardId == cardId) _reopen.value = null
    }

    @Synchronized
    fun clear() {
        attempts.clear()
        _reopen.value = null
    }
}
