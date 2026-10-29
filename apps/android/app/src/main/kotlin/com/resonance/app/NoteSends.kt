package com.resonance.app

import com.resonance.kit.chat.NoteAttempt
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * Notes on their way (round 21: the composer closes as 寄出 is pressed, and the note goes on from the
 * account's scope). Each card keeps its [NoteAttempt] here, so a note sent again on the same words after
 * a failure goes under the same client id — a retry the server recognises, never a second note — and a
 * failure's 再寄一次 asks for the card's composer to open again on its kept words ([reopen]). Belongs to
 * the account: emptied when it signs out or another signs in.
 */
class NoteSends {
    private val attempts = HashMap<String, NoteAttempt>()
    private val hosts = HashMap<String, Int>()
    private val _reopen = MutableStateFlow<String?>(null)

    /** The card whose composer is to open again (a failed note's 再寄一次), until the card's actions take it ([took]). */
    val reopen: StateFlow<String?> = _reopen

    /** The attempt notes to [cardId] go under. */
    @Synchronized
    fun attempt(cardId: String): NoteAttempt = attempts.getOrPut(cardId) { NoteAttempt() }

    /** The actions of [cardId]'s page are on screen ([present]), or gone. */
    @Synchronized
    fun host(cardId: String, present: Boolean) {
        val n = (hosts[cardId] ?: 0) + if (present) 1 else -1
        if (n > 0) hosts[cardId] = n else hosts.remove(cardId)
    }

    /**
     * 再寄一次 for [cardId]: its composer opens again — where its page is on screen, or on the page [openCard]
     * opens for it (whose actions take the request as they come).
     */
    fun requestReopen(cardId: String, openCard: () -> Unit) {
        _reopen.value = cardId
        val shown = synchronized(this) { (hosts[cardId] ?: 0) > 0 }
        if (!shown) openCard()
    }

    /** The composer of [cardId] opened again: the request is done. */
    fun took(cardId: String) {
        if (_reopen.value == cardId) _reopen.value = null
    }

    @Synchronized
    fun clear() {
        attempts.clear()
        _reopen.value = null
    }
}
