package com.resonance.app

import com.google.firebase.firestore.FieldValue
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.SocialApi
import kotlinx.coroutines.tasks.await

/**
 * Bookmarks (收藏): users/{uid}/bookmarks/{cardId}, owner-only, never counted and never notified.
 * The twin of iOS's BookmarkService.
 *
 * Phase 2: with client-config's `apiSocial` on ([api] non-null) they go through the contract —
 * PUT/DELETE /me/bookmarks/{cardId}, and whether a card is bookmarked from its page's
 * `bookmarked` — instead of straight to Firestore as the web's client did
 * (lib/db/firestore/client/bookmarks.ts), which stays the path with the switch off.
 */
class BookmarkService(private val uid: String, private val api: Api? = null) {
    /** The contract's path: the bookmark's writes, and the card page that says whether it is one. */
    class Api(val social: SocialApi, val reading: ReadingApi)

    private fun ref(cardId: String) = AppFirebase.db.collection("users").document(uid).collection("bookmarks").document(cardId)

    suspend fun isBookmarked(cardId: String): Boolean {
        api?.let { return it.reading.card(cardId).bookmarked ?: false }
        return ref(cardId).get().await().exists()
    }

    /** Bookmarks [cardId] or lets it go (idempotent either way); returns the state now. */
    suspend fun set(cardId: String, on: Boolean): Boolean {
        api?.let {
            it.social.bookmark(cardId, on)
            return on
        }
        val doc = ref(cardId)
        if (on) doc.set(mapOf("cardId" to cardId, "createdAt" to FieldValue.serverTimestamp())).await() else doc.delete().await()
        return on
    }
}
