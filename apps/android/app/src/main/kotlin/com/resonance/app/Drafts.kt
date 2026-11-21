package com.resonance.app

import com.google.firebase.Timestamp
import com.google.firebase.firestore.DocumentReference
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.FirebaseFirestoreException
import com.google.firebase.firestore.SetOptions
import com.resonance.api.models.CoverFrame
import com.resonance.api.models.CreateDraftRequest
import com.resonance.api.models.CreatedDraft
import com.resonance.api.models.DraftMedia
import com.resonance.api.models.DraftSaved
import com.resonance.api.models.PendingEdit
import com.resonance.api.models.PendingEditRequest
import com.resonance.api.models.UpdateDraftRequest
import com.resonance.design.CoverFraming
import com.resonance.kit.api.Trash
import com.resonance.kit.api.WriterApi
import com.resonance.kit.api.WritingApi
import com.resonance.kit.writing.DraftOutbox
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
    /**
     * Where the cover is looked at (round 25 §G1: `media.frame`); null — the centre at zoom 1. Inside `media`, so it
     * goes with the picture: a new picture, or none, clears it.
     */
    val imageFrame: CoverFraming? = null,
    /**
     * The cover's small copy as the card keeps it (`media.thumbUrl`), when it has one: a save through the
     * contract sends the cover whole, so it goes along — only while it is this cover's ([DraftService.thumbOf]).
     */
    val imageThumbUrl: String? = null,
) {
    /** Nothing written yet — autosave doesn't create a document for it (isEmptyDraft). */
    val isEmpty: Boolean get() = title.isBlank() && story.isBlank() && tags.isEmpty() && imageUrl == null
}

/**
 * What the writer keeps its card in: a draft's own document, a published card's pending edit — the
 * author's own writes ([DraftService] on Firestore; a stand-in under test).
 */
interface DraftStore {
    /** The id a new draft will have (Firestore makes ids on the device): the writer holds it from the moment its create is issued. */
    fun newDraftId(): String

    /**
     * A new, unpublished card under [id] (from [newDraftId]). The write is on the device as soon as
     * it is issued; this returns once the server has taken it — which, offline, is never until the
     * network comes back (Firestore neither fails nor finishes a write it can't send).
     */
    suspend fun create(id: String, v: DraftValues, locale: String, referenceCardId: String?)

    suspend fun update(id: String, v: DraftValues)

    /** A published card's working copy, into its private buffer. */
    suspend fun saveEdit(id: String, v: DraftValues)

    suspend fun discardEdit(id: String)

    /** A draft let go of: deleted (the rules let its writer delete a card never published, never one that was). */
    suspend fun delete(id: String)

    /**
     * Whether your card is in the trash now (`trashedAt`), read again: a write refused for it is
     * then said as such. False when it isn't (or is gone); a read that fails throws.
     */
    suspend fun isTrashed(id: String): Boolean

    /** Whether a write was refused by the rules (permission-denied): what a card in the trash answers a save with. */
    fun refused(error: Throwable): Boolean

    /**
     * Waits until everything written to [id] has reached the server — what publishing, applying an edit or
     * dropping it must stand on (the contract's outbox; Firestore's own queue keeps its order by itself).
     */
    suspend fun settle(id: String) {}
}

private fun fields(v: DraftValues): MutableMap<String, Any?> = mutableMapOf(
    "thoughtCore" to v.title,
    "story" to v.story,
    "tags" to v.tags,
    "visibility" to v.visibility,
    "anonymous" to v.anonymous,
)

private fun media(v: DraftValues): Map<String, Any>? = v.imageUrl?.let { url ->
    val m = mutableMapOf<String, Any>("type" to "image", "url" to url, "label" to (v.imageLabel ?: ""))
    v.imageFrame?.let { m["frame"] = it.toMap() }
    m
}

/**
 * updateCardDraft's fields, for a merge write: the fields as they are now (a removed cover clears media and its hue).
 * A merge set merges nested maps key by key, so a cover with no frame (a new picture, or reset to the centre) deletes
 * `media.frame` outright — else the old crop would stay on the document and frame the new picture.
 */
internal fun draftUpdate(v: DraftValues): Map<String, Any?> {
    val data = fields(v)
    data["media"] = media(v)?.let { m -> if (v.imageFrame == null) m + ("frame" to FieldValue.delete()) else m } ?: FieldValue.delete()
    data["accentHue"] = v.accentHue
    data["updatedAt"] = FieldValue.serverTimestamp()
    return data
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
class DraftService(private val uid: String, private val api: Api? = null) : DraftStore {
    private val cards get() = AppFirebase.db.collection("cards")

    /**
     * The contract's path (client-config's `apiDrafts`): every write into the account's [DraftOutbox] —
     * kept on the device, sent in order with its `rev` — and the pending edit read from GET
     * …/edits/current. Null: the Firestore path, kept for one release.
     */
    class Api(val writer: WriterApi, val outbox: DraftOutbox)

    /** The outbox's calls: the contract's draft endpoints, and DELETE /cards/{id} for a draft let go of. */
    class Sender(private val writer: WriterApi, private val writing: WritingApi) : DraftOutbox.Sender {
        override suspend fun create(request: CreateDraftRequest): CreatedDraft = writer.createDraft(request)
        override suspend fun save(cardId: String, request: UpdateDraftRequest): DraftSaved = writer.saveDraft(cardId, request)
        override suspend fun saveEdit(cardId: String, request: PendingEditRequest): DraftSaved = writer.savePendingEdit(cardId, request)
        override suspend fun discardEdit(cardId: String) {
            writer.discardPendingEdit(cardId)
        }
        override suspend fun delete(cardId: String) = writing.deleteCard(cardId)
    }

    override fun newDraftId(): String = if (api != null) newId() else cards.document().id

    override suspend fun settle(id: String) {
        api?.outbox?.settle(id)
    }

    /** createCardDraft: a new, unpublished card with zeroed counters. */
    override suspend fun create(id: String, v: DraftValues, locale: String, referenceCardId: String?) {
        api?.let { return it.outbox.create(createRequest(id, v, locale, referenceCardId)) }
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
        cards.document(id).set(data).await()
    }

    /** updateCardDraft: the fields as they are now (a removed cover clears media and its hue). */
    override suspend fun update(id: String, v: DraftValues) {
        api?.let { return it.outbox.save(id, saveRequest(v)) }
        cards.document(id).set(draftUpdate(v), SetOptions.merge()).await()
    }

    override suspend fun delete(id: String) {
        api?.let { return it.outbox.delete(id) }
        cards.document(id).delete().await()
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
        /** Who it was for before the trash made it private (`trashedFrom.visibility`), while it is there. */
        val trashedFromVisibility: String? = null,
        /** The story's link previews the server keeps on the card (`linkPreviews`, raw): the writer's link cards show them. */
        val linkPreviews: Any? = null,
    ) {
        /** Where it lives once published: the slug, or the id. */
        val routeKey: String get() = slug ?: id

        val isTrashed: Boolean get() = trashedAt != null

        /** Who reads it once it is out of the trash (or now, out of it): the trash keeps it private meanwhile. */
        val restoresVisibility: String get() = trashedFromVisibility ?: liveVisibility
    }

    /**
     * Your card by id, or null when it is missing or someone else's (rules deny → null) — or past
     * its days in the trash, gone to its owner too even before the server's purge reaches it.
     */
    suspend fun open(id: String): OpenedCard? {
        val data = attempt { cards.document(id).get().await() }?.data ?: return null
        val isPublished = data["publishedAt"] is Timestamp
        val api = api ?: run {
            val buffered = if (isPublished && data["trashedAt"] == null) attempt { editRef(id).get().await() }?.data else null
            return openedCard(uid, id, data, buffered)
        }
        // What this device wrote and the server hasn't taken yet is the newest copy of all (a reopen offline, or after the app was killed).
        val queued = api.outbox.pending(id)
        val buffered = when {
            !isPublished || data["trashedAt"] != null -> null
            queued?.edit != null -> null
            else -> attempt { api.writer.pendingEdit(id) }?.let(::editData)
        }
        val opened = openedCard(uid, id, data, buffered) ?: return null
        return queuedOver(opened, queued)
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
                trashedFromVisibility = if (trashedAt == null) null else (data["trashedFrom"] as? Map<*, *>)?.get("visibility") as? String,
                linkPreviews = data["linkPreviews"],
            )
        }

        private fun instantOf(v: Any?): Instant? = when (v) {
            is Timestamp -> Instant.ofEpochSecond(v.seconds, v.nanoseconds.toLong())
            is Instant -> v
            is String -> runCatching { Instant.parse(v) }.getOrNull()
            else -> null
        }

        private const val ID_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"

        /** A new draft's id, made on the device (POST /cards takes it): 20 letters and digits, as Firestore's auto ids. */
        fun newId(random: java.util.Random = java.security.SecureRandom()): String =
            String(CharArray(20) { ID_CHARS[random.nextInt(ID_CHARS.length)] })

        /** The small copy [thumb] when it is [url]'s (`-w960.webp` in place of its extension), else none. */
        fun thumbOf(url: String, thumb: String?): String? {
            thumb ?: return null
            val name = url.lastIndexOf('/')
            val dot = url.lastIndexOf('.')
            val stem = if (dot > name) url.substring(0, dot) else url
            return thumb.takeIf { it == "$stem-w960.webp" }
        }

        /** The cover as the contract takes it: sent whole, so a frame or small copy left out is gone from it. */
        fun draftMedia(v: DraftValues): DraftMedia? = v.imageUrl?.let { url ->
            DraftMedia(
                type = DraftMedia.Type.image,
                url = url,
                thumbUrl = thumbOf(url, v.imageThumbUrl),
                label = v.imageLabel ?: "",
                frame = v.imageFrame?.let { CoverFrame(it.cx, it.cy, it.zoom, it.ar) },
            )
        }

        /** POST /cards: createCardDraft's fields under the device's [id]. */
        fun createRequest(id: String, v: DraftValues, locale: String, referenceCardId: String?) = CreateDraftRequest(
            id = id,
            thoughtCore = v.title,
            story = v.story,
            tags = v.tags,
            visibility = CreateDraftRequest.Visibility.entries.firstOrNull { it.value == v.visibility } ?: CreateDraftRequest.Visibility.`private`,
            originalLocale = locale,
            media = draftMedia(v),
            accentHue = v.accentHue,
            referenceCardId = referenceCardId,
            anonymous = v.anonymous,
        )

        /**
         * PATCH …/draft: every field as it is now (the outbox numbers it). A field sent null is left as it is,
         * so a cover or hue taken away is `clear`ed — and a cover sent replaces the stored one whole, its frame
         * with it (what the Firestore path's merge had to delete `media.frame` for by hand).
         */
        fun saveRequest(v: DraftValues): UpdateDraftRequest {
            val media = draftMedia(v)
            val clear = listOfNotNull(UpdateDraftRequest.Clear.media.takeIf { media == null }, UpdateDraftRequest.Clear.accentHue.takeIf { v.accentHue == null })
            return UpdateDraftRequest(
                rev = 0,
                thoughtCore = v.title,
                story = v.story,
                tags = v.tags,
                visibility = UpdateDraftRequest.Visibility.entries.firstOrNull { it.value == v.visibility } ?: UpdateDraftRequest.Visibility.`private`,
                anonymous = v.anonymous,
                media = media,
                accentHue = v.accentHue,
                clear = clear.ifEmpty { null },
            )
        }

        /** PUT …/edits/current: the whole working copy (the outbox numbers it); no cover is none. */
        fun editRequest(v: DraftValues) = PendingEditRequest(
            rev = 0,
            thoughtCore = v.title,
            story = v.story,
            tags = v.tags,
            visibility = PendingEditRequest.Visibility.entries.firstOrNull { it.value == v.visibility } ?: PendingEditRequest.Visibility.`private`,
            anonymous = v.anonymous,
            media = draftMedia(v),
            accentHue = v.accentHue,
        )

        /** A cover as the contract hands it, in a document's shape (what [draftValues] reads). */
        private fun mediaData(m: DraftMedia?): Map<String, Any?>? = m?.let {
            mapOf<String, Any?>(
                "type" to it.type.value, "url" to it.url, "thumbUrl" to it.thumbUrl, "label" to it.label,
                "frame" to it.frame?.let { f -> mapOf("cx" to f.cx, "cy" to f.cy, "zoom" to f.zoom, "ar" to f.ar) },
            ).filterValues { v -> v != null }
        }

        /** GET …/edits/current's copy in its document's shape. */
        fun editData(e: PendingEdit): Map<String, Any?> = mapOf(
            "thoughtCore" to e.thoughtCore, "story" to e.story, "tags" to e.tags, "visibility" to e.visibility.value,
            "anonymous" to e.anonymous, "media" to mediaData(e.media), "accentHue" to e.accentHue,
        )

        /**
         * [opened] with the words this device still has on their way to it laid over it ([queued]: the
         * outbox's last create, save or pending edit of the card) — newer than anything the server holds.
         * A draft's are its own fields; a published card's are its pending edit (in the trash: neither,
         * as the trash shows the card as it is).
         */
        fun queuedOver(opened: OpenedCard, queued: DraftOutbox.Op?): OpenedCard {
            queued ?: return opened
            val words: Map<String, Any?> = queued.create?.let { c ->
                mapOf(
                    "thoughtCore" to c.thoughtCore, "story" to c.story, "tags" to c.tags, "visibility" to c.visibility.value,
                    "anonymous" to (c.anonymous ?: false), "media" to mediaData(c.media), "accentHue" to c.accentHue,
                )
            } ?: queued.save?.let { u ->
                val clear = u.clear.orEmpty()
                mapOf(
                    "thoughtCore" to u.thoughtCore, "story" to u.story, "tags" to u.tags, "visibility" to u.visibility?.value, "anonymous" to u.anonymous,
                    "media" to if (UpdateDraftRequest.Clear.media in clear) null else mediaData(u.media),
                    "accentHue" to if (UpdateDraftRequest.Clear.accentHue in clear) null else u.accentHue,
                )
            } ?: queued.edit?.let { e ->
                mapOf(
                    "thoughtCore" to e.thoughtCore, "story" to e.story, "tags" to e.tags, "visibility" to e.visibility.value,
                    "anonymous" to e.anonymous, "media" to mediaData(e.media), "accentHue" to e.accentHue,
                )
            } ?: return opened
            if (opened.isTrashed) return opened
            val values = draftValues(words)
            return when {
                queued.edit != null -> if (opened.isPublished) opened.copy(values = values, hasPendingEdit = true) else opened
                opened.isPublished -> opened
                else -> opened.copy(values = values, liveVisibility = values.visibility, liveAnonymous = values.anonymous)
            }
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
                imageFrame = CoverFraming.of(media?.get("frame") as? Map<*, *>),
                imageThumbUrl = media?.get("thumbUrl") as? String,
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
        api?.let { return it.outbox.saveEdit(id, editRequest(v)) }
        val data = fields(v)
        media(v)?.let { data["media"] = it }
        data["accentHue"] = v.accentHue
        data["updatedAt"] = FieldValue.serverTimestamp()
        editRef(id).set(data).await()
    }

    /** discardPendingCardEdit: the live card is left exactly as it was. */
    override suspend fun discardEdit(id: String) {
        api?.let { return it.outbox.discardEdit(id) }
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
}
