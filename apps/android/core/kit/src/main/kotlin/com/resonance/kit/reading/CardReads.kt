package com.resonance.kit.reading

import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.kit.api.isTrashed
import kotlin.coroutines.cancellation.CancellationException

/**
 * Counting a signed-in reader's reads of a card (the web's lib/data/cardReads): once the card page
 * shows someone else's published, non-private card outside the trash, the server is told — once per
 * account and card for the app's life, so moving back and forth between cards doesn't ask again.
 * The server decides the rest (its author's reads, a block, a day) and always answers 204; nothing
 * of it is ever shown, and a failure is nobody's concern: the read goes uncounted, and a later visit
 * asks again.
 */
class CardReads(private val send: suspend (String) -> Unit) {
    private val asked = HashSet<String>()

    /** Tells the server `viewerId` is reading the page's card, unless it doesn't count or was asked already. */
    suspend fun count(viewerId: String?, page: CardDetail) {
        if (viewerId == null || !counts(page)) return
        val key = "$viewerId:${page.card.id}"
        if (!take(key)) return
        try {
            send(page.card.id)
        } catch (e: CancellationException) {
            forget(key)
            throw e
        } catch (e: Exception) {
            // Let a later visit try again.
            forget(key)
        }
    }

    @Synchronized private fun take(key: String): Boolean = asked.add(key)
    @Synchronized private fun forget(key: String) { asked.remove(key) }

    companion object {
        /** Whether a reader's visit to this page is one the server would count: someone else's card, published, not private, not in the trash. */
        fun counts(page: CardDetail): Boolean =
            !page.isOwner && page.card.publishedAt != null && page.card.visibility != FeedCard.Visibility.`private` && !page.card.isTrashed
    }
}
