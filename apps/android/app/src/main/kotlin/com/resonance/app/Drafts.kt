package com.resonance.app

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.SetOptions
import com.resonance.kit.api.Trash
import java.time.Instant
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.tasks.await

/** A draft's editable fields — CardEditor's DraftValues. */
data class DraftValues(
    val title: String = "",
    val story: String = "",
    val tags: List<String> = emptyList(),
    val visibility: String = "public",
    val anonymous: Boolean = false,
    /** The cover: its public URL and label (media {type: image} on the web). */
    val imageUrl: String? = null,
    val imageLabel: String? = null,
    /** The cover's hue snapped to the card palette; null keeps the position colour. */
    val accentHue: Double? = null,
) {
    /** Nothing written yet — autosave doesn't create a document for it (isEmptyDraft). */
    val isEmpty: Boolean get() = title.isBlank() && story.isBlank() && tags.isEmpty() && imageUrl == null
}

/**
 * What the writer keeps its card in: a draft's own document, a published card's pending edit — the
 * author's own writes ([DraftService] on Firestore; a stand-in under test).
 */
interface DraftStore {
    /** A new, unpublished card; returns its id. */
    suspend fun create(v: DraftValues, locale: String, referenceCardId: String?): String

    suspend fun update(id: String, v: DraftValues)

    /** A published card's working copy, into its private buffer. */
    suspend fun saveEdit(id: String, v: DraftValues)

    suspend fun discardEdit(id: String)

    /**
     * Whether your card is in the trash now (`trashedAt`), read again: a write refused for it is
     * then said as such. False when it isn't (or is gone); a read that fails throws.
     */
    suspend fun isTrashed(id: String): Boolean

    /** Whether a write was refused by the rules (permission-denied): what a card in the trash answers a save with. */
    fun refused(error: Throwable): Boolean
}

/**
 * Drafts, written straight to Firestore like the web editor's client
 * (lib/db/firestore/client/cards.ts: createCardDraft, updateCardDraft) — the
 * author's own documents under the same rules. Publishing is the server's
 * (WritingApi.publish), since it reaches other people, and so are the card
 * box's changes to a card (WritingApi.updateCard / deleteCard), which refresh
 * the site's cached pages. The twin of iOS's DraftService. Also opens a card
 * of yours for editing and keeps a published card's pending edit.
 */
class DraftService(private val uid: String) : DraftStore {
    private val cards get() = AppFirebase.db.collection("cards")

    private fun fields(v: DraftValues): MutableMap<String, Any?> = mutableMapOf(
        "thoughtCore" to v.title,
        "story" to v.story,
        "tags" to v.tags,
        "visibility" to v.visibility,
        "anonymous" to v.anonymous,
    )

    private fun media(v: DraftValues): Map<String, String>? = v.imageUrl?.let { mapOf("type" to "image", "url" to it, "label" to (v.imageLabel ?: "")) }

    /** createCardDraft: a new, unpublished card with zeroed counters. */
    override suspend fun create(v: DraftValues, locale: String, referenceCardId: String?): String {
        val data = fields(v)
        media(v)?.let { data["media"] = it }
        v.accentHue?.let { data["accentHue"] = it }
        referenceCardId?.let { data["referenceCardId"] = it }
        data += mapOf(
            "authorId" to uid,
            "originalLocale" to locale,
            "translations" to emptyMap<String, Any>(),
            "publishedAt" to null,
            "readCount" to 0,
            "resonanceCount" to 0,
            "inviteCount" to 0,
            "createdAt" to FieldValue.serverTimestamp(),
            "updatedAt" to FieldValue.serverTimestamp(),
        )
        val ref = cards.document()
        ref.set(data).await()
        return ref.id
    }

    /** updateCardDraft: the fields as they are now (a removed cover clears media and its hue). */
    override suspend fun update(id: String, v: DraftValues) {
        val data = fields(v)
        data["media"] = media(v) ?: FieldValue.delete()
        data["accentHue"] = v.accentHue
        data["updatedAt"] = FieldValue.serverTimestamp()
        cards.document(id).set(data, SetOptions.merge()).await()
    }

    // Opening a card to edit

    /**
     * A card of yours as the editor opens it (write/[id]/page.tsx): a draft
     * with its own fields, or a published card with its pending edit when
     * there is one — buffered edits win over the live fields.
     */
    data class OpenedCard(
        val id: String,
        val values: DraftValues,
        val isPublished: Boolean,
        val slug: String?,
        val referenceCardId: String?,
        val hasPendingEdit: Boolean,
        /** When it went into the trash (the server's alone to set), or null: then the writer says so, with 還原. */
        val trashedAt: Instant? = null,
        /** Who reads a published card now, and under whose name (its pending edit may say otherwise). */
        val liveVisibility: String = values.visibility,
        val liveAnonymous: Boolean = values.anonymous,
    ) {
        /** Where it lives once published: the slug, or the id. */
        val routeKey: String get() = slug ?: id

        val isTrashed: Boolean get() = trashedAt != null
    }

    /**
     * Your card by id, or null when it is missing or someone else's (rules deny → null) — or past
     * its days in the trash, gone to its owner too even before the server's purge reaches it.
     */
    suspend fun open(id: String): OpenedCard? {
        val data = attempt { cards.document(id).get().await() }?.data ?: return null
        val isPublished = data["publishedAt"] is Timestamp
        val buffered = if (isPublished && data["trashedAt"] == null) attempt { editRef(id).get().await() }?.data else null
        return openedCard(uid, id, data, buffered)
    }

    override suspend fun isTrashed(id: String): Boolean {
        val data = cards.document(id).get().await().data ?: return false
        return data["trashedAt"] != null
    }

    override fun refused(error: Throwable): Boolean =
        (error as? FirebaseFirestoreException)?.code == FirebaseFirestoreException.Code.PERMISSION_DENIED

    companion object {
        /**
         * Your card as the writer opens it, from its document ([data]) and a published card's
         * pending edit ([buffered], whose values win: that is the copy being worked on): null when
         * it isn't yours, or has been in the trash past its days. A card in the trash keeps
         * `trashedAt` (a Timestamp, or an ISO string written by hand) and comes back with it.
         */
        fun openedCard(uid: String, id: String, data: Map<String, Any?>, buffered: Map<String, Any?>?, now: Instant = Instant.now()): OpenedCard? {
            if (data["authorId"] != uid) return null
            val trashedAt = instantOf(data["trashedAt"])
            if (trashedAt != null && Trash.expired(Trash.purgeAtOf(trashedAt), now)) return null
            val live = draftValues(data)
            val isPublished = data["publishedAt"] is Timestamp || data["publishedAt"] is Instant
            return OpenedCard(
                id = id,
                values = if (trashedAt == null && buffered != null) draftValues(buffered) else live,
                isPublished = isPublished,
                slug = data["slug"] as? String,
                referenceCardId = data["referenceCardId"] as? String,
                hasPendingEdit = trashedAt == null && buffered != null,
                trashedAt = trashedAt,
                liveVisibility = live.visibility,
                liveAnonymous = live.anonymous,
            )
        }

        private fun instantOf(v: Any?): Instant? = when (v) {
            is Timestamp -> Instant.ofEpochSecond(v.seconds, v.nanoseconds.toLong())
            is Instant -> v
            is String -> runCatching { Instant.parse(v) }.getOrNull()
            else -> null
        }

        /** A draft's editable fields as its document (or its pending edit) holds them. */
        fun draftValues(d: Map<String, Any?>): DraftValues {
            val media = d["media"] as? Map<*, *>
            return DraftValues(
                title = d["thoughtCore"] as? String ?: "",
                story = d["story"] as? String ?: "",
                tags = (d["tags"] as? List<*>)?.filterIsInstance<String>() ?: emptyList(),
                visibility = d["visibility"] as? String ?: "public",
                anonymous = d["anonymous"] as? Boolean ?: false,
                imageUrl = media?.get("url") as? String,
                imageLabel = media?.get("label") as? String,
                accentHue = (d["accentHue"] as? Number)?.toDouble(),
            )
        }
    }

    /** A read that may be refused or fail: null then (a cancelled one still cancels). */
    private suspend fun <T> attempt(read: suspend () -> T): T? = try {
        read()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    // Pending edits (lib/db/firestore/client/cardEdits.ts)

    private fun editRef(id: String): DocumentReference = cards.document(id).collection("edits").document("current")

    /**
     * savePendingCardEdit: a published card autosaves its whole working copy
     * here (owner-only), never onto the card readers are looking at. A full
     * replace, not a merge — the cover is simply absent when there is none.
     */
    override suspend fun saveEdit(id: String, v: DraftValues) {
        val data = fields(v)
        media(v)?.let { data["media"] = it }
        data["accentHue"] = v.accentHue
        data["updatedAt"] = FieldValue.serverTimestamp()
        editRef(id).set(data).await()
    }

    /** discardPendingCardEdit: the live card is left exactly as it was. */
    override suspend fun discardEdit(id: String) {
        editRef(id).delete().await()
    }

    // Reads of your own cards

    /** Your card answering another: its id, the key its page goes by (slug or id), and whether it is published yet. */
    data class Resonance(val id: String, val routeKey: String, val published: Boolean)

    /** getMyResonanceCard: your card (draft or published) answering this one, if any. Throws when the lookup fails. */
    suspend fun myResonance(cardId: String): Resonance? =
        cards.whereEqualTo("authorId", uid).whereEqualTo("referenceCardId", cardId).limit(1).get().await().documents.firstOrNull()?.let { doc ->
            Resonance(doc.id, doc.getString("slug")?.takeIf { it.isNotEmpty() } ?: doc.id, doc.get("publishedAt") != null)
        }

    /**
     * hasAnyOwnCards: whether you have written anything at all (drafts count).
     * A failed read counts as "has written": the guide is for newcomers only.
     */
    suspend fun hasAnyCards(): Boolean =
        attempt { cards.whereEqualTo("authorId", uid).limit(1).get().await().isEmpty.not() } ?: true
}
