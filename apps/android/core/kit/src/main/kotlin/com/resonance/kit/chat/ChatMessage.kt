package com.resonance.kit.chat

import com.resonance.kit.api.MessagingApi
import java.util.Date

/** Where a message of this person's own stands: [Delivered] is a document the conversation holds; the rest are still on their way. */
enum class Delivery {
    /** A document of the conversation (read from Firestore). */
    Delivered,
    /** Waiting in the outbox, or being sent. */
    Sending,
    /** The server took it; the conversation's listener hasn't shown it yet (drawn as delivered, but it can't be replied to yet). */
    Sent,
    /** The server refused it, or the network did: it stays here with a retry until the person retries or deletes it. */
    Failed,
}

/**
 * What a reply carries of the message it answers (the server's `replyTo` snapshot, kept on the
 * reply): the quote is read from here, never from the original, which may be far up the thread
 * or gone. [text] is at most [MAX_TEXT] code points; empty when the original was a card or a
 * picture alone ([image]: it carried one — the quote is words, so it says 「一張圖片」 then).
 */
data class ReplyQuote(
    val id: String,
    val senderId: String,
    val text: String,
    val cardRef: String? = null,
    val image: Boolean = false,
    /** The message it quotes was unsent (round 16 §3: the server scrubs the quote to `{ id, senderId, unsent: true }`): it reads 訊息已收回. */
    val unsent: Boolean = false,
    /** The message it quotes was a sticker (round 22): the quote shows its key pose and its name; [text] is its fallback words. */
    val sticker: ChatSticker? = null,
) {
    companion object {
        const val MAX_TEXT = 140

        /** The quote a reply to [message] carries (the same cut the server makes). */
        fun of(message: ChatMessage) = ReplyQuote(
            message.id, message.senderId, cut(message.text), message.cardRef, image = message.image != null, sticker = message.sticker,
        )

        /** At most [MAX_TEXT] code points, never splitting a surrogate pair. */
        fun cut(text: String): String {
            if (text.codePointCount(0, text.length) <= MAX_TEXT) return text
            return text.substring(0, text.offsetByCodePoints(0, MAX_TEXT))
        }
    }
}

/**
 * A 小紙團 sticker as a message names it (round 22, `public/stickers/catalog.json`): its pack and its
 * id in the pack — lowercase, `[a-z0-9-]`, stored for good and never renamed. Whether this build can
 * draw it is [StickerCatalog]'s to say.
 */
data class ChatSticker(val pack: String, val id: String) {
    companion object {
        private val PACK = Regex("^[a-z0-9-]{1,32}$")
        private val ID = Regex("^[a-z0-9-]{1,40}$")

        /** Whether [pack] and [id] are what the contract takes (anything else names no sticker, and nothing is asked for it). */
        fun isValid(pack: String, id: String): Boolean = PACK.matches(pack) && ID.matches(id)

        /** A message's (or a quote's) `sticker: { pack, id }`; null when it isn't one. */
        fun from(map: Map<*, *>?): ChatSticker? {
            val pack = map?.get("pack") as? String ?: return null
            val id = map["id"] as? String ?: return null
            return if (isValid(pack, id)) ChatSticker(pack, id) else null
        }
    }
}

/**
 * Several pictures sent together (round 22): the album's [id] (the client's, shared by its pictures),
 * this picture's place in it ([index], 0 first) and how many were sent ([count], 2–10). The thread
 * draws one sender's consecutive pictures of an album as one grid ([AlbumRows]).
 */
data class ChatAlbum(val id: String, val index: Int, val count: Int) {
    companion object {
        private val ID = Regex("^[A-Za-z0-9_-]{16,64}$")
        const val MAX = 10

        /** A message's `album: { id, index, count }`; null when it isn't one the contract takes. */
        fun from(map: Map<*, *>?): ChatAlbum? {
            val id = (map?.get("id") as? String)?.takeIf { ID.matches(it) } ?: return null
            val index = (map["index"] as? Number)?.toDouble()?.takeIf { it == Math.floor(it) }?.toInt() ?: return null
            val count = (map["count"] as? Number)?.toDouble()?.takeIf { it == Math.floor(it) }?.toInt() ?: return null
            if (count !in 2..MAX || index !in 0 until count) return null
            return ChatAlbum(id, index, count)
        }
    }
}

/**
 * The unfurled page of the first link in a message, which the server writes a moment after the
 * message itself (so a message is drawn without it and again when it arrives). [imageUrl] is
 * absolute — the server's site-relative `/api/link-image?…` resolved against the API's origin —
 * and is only ever an image of that proxy; [url] is a normalized http(s) address that
 * [Linkify.action] has accepted.
 */
data class LinkPreview(val url: String, val title: String, val description: String?, val siteName: String?, val imageUrl: String?)

/**
 * One message of a conversation as the thread draws it (a document of
 * `conversations/{pair}/messages`, or one of this person's own still on its way).
 *
 * [key] is the identity a list keeps a row by: the id, except that a message sent from here keeps
 * the key it had while it was sending (the client id), so the row doesn't jump when the document
 * replaces it. [id] is the document's id; for a message still on its way it is the client id,
 * which the server uses as the document id.
 */
data class ChatMessage(
    val id: String,
    val senderId: String,
    val text: String,
    val sentAt: Date,
    val cardRef: String? = null,
    val noteRef: MessagingApi.Note? = null,
    val replyTo: ReplyQuote? = null,
    val preview: LinkPreview? = null,
    /** A picture it carries (never with a card): drawn at the head of its bubble, its words under it. */
    val image: ChatImage? = null,
    val delivery: Delivery = Delivery.Delivered,
    val key: String = id,
    /**
     * A note left on a card of the recipient's (`kind: 'note'`, written by the server into the
     * thread): [cardRef] is the card it was left on, drawn above the note's words as what they
     * answer — not inside the bubble as a card shared. A kind this build doesn't know is an
     * ordinary message.
     */
    val isNote: Boolean = false,
    /**
     * Who reacted how (round 16 §3–§4: `reactions: { [uid]: id }`, one reaction per person): ids as
     * stored, unknown ones too — a client draws an id it doesn't know as nothing ([MessageReactions]).
     */
    val reactions: Map<String, String> = emptyMap(),
    /** When its sender unsent it (round 16 §3): the document then holds nothing else but who sent it and when. */
    val unsentAt: Date? = null,
    /**
     * Its sender shared their own 私人卡 ([cardRef]) and the message is its recipient's pass to read it
     * (`privateShare: true`, written by the server). It goes when the sender stops sharing it (停止分享)
     * while the thread is open — the message stays, the card no longer reads.
     */
    val privateShare: Boolean = false,
    /**
     * A 小紙團 sticker (round 22): the message carries nothing else; [text] is its fallback words
     * (〔貼圖：謝謝〕), drawn only when this build can't draw the sticker.
     */
    val sticker: ChatSticker? = null,
    /** One of several pictures sent together (round 22): only beside a picture ([image]). */
    val album: ChatAlbum? = null,
) {
    /** Still on its way, or failed: nothing is known of it by the server (yet). */
    val isPending: Boolean get() = delivery != Delivery.Delivered
    /** Unsent by its sender: drawn as a one-line ghost, offering nothing. */
    val isUnsent: Boolean get() = unsentAt != null
    /** A reply names a document of the conversation, so only delivered messages can be replied to (never an unsent one). */
    val canReply: Boolean get() = delivery == Delivery.Delivered && !isUnsent

    companion object {
        /**
         * A message document's fields as Firestore returns them (maps and strings), with its id and
         * its send time (read with the estimate for a server time still pending). [origin] is the
         * API's — a preview's picture is a path of it. Missing or odd fields leave a message
         * without that part; none of them fails it.
         */
        fun from(id: String, fields: Map<String, Any?>, sentAt: Date, origin: String): ChatMessage {
            val note = fields["noteRef"] as? Map<*, *>
            val noteCard = note?.get("cardId") as? String
            val noteId = note?.get("noteId") as? String
            // Unsent: its sender and its time are all that is left (anything else is ignored, should it linger).
            unsentDate(fields["unsentAt"])?.let { unsent ->
                return ChatMessage(id = id, senderId = fields["senderId"] as? String ?: "", text = "", sentAt = sentAt, unsentAt = unsent)
            }
            return ChatMessage(
                id = id,
                senderId = fields["senderId"] as? String ?: "",
                text = fields["text"] as? String ?: "",
                sentAt = sentAt,
                cardRef = (fields["cardRef"] as? String)?.takeIf { it.isNotEmpty() },
                noteRef = if (noteCard != null && noteId != null) MessagingApi.Note(noteCard, noteId) else null,
                replyTo = quote(fields["replyTo"] as? Map<*, *>),
                preview = preview(fields["preview"] as? Map<*, *>, origin),
                image = ChatImage.from(fields["image"] as? Map<*, *>),
                isNote = fields["kind"] == "note",
                reactions = reactions(fields["reactions"] as? Map<*, *>),
                // Only beside the card it shares: a stray marker on a message without one is no pass to anything.
                privateShare = fields["privateShare"] == true && !(fields["cardRef"] as? String).isNullOrEmpty(),
                sticker = ChatSticker.from(fields["sticker"] as? Map<*, *>),
                // An album names pictures: a stray one on a message without a picture groups nothing.
                album = ChatAlbum.from(fields["album"] as? Map<*, *>)?.takeIf { ChatImage.from(fields["image"] as? Map<*, *>) != null },
            )
        }

        /** `reactions` as stored: uid → id, both strings and not blank (anything else is left out). */
        private fun reactions(map: Map<*, *>?): Map<String, String> {
            if (map.isNullOrEmpty()) return emptyMap()
            val out = LinkedHashMap<String, String>()
            for ((k, v) in map) {
                val uid = (k as? String)?.takeIf { it.isNotBlank() } ?: continue
                val reaction = (v as? String)?.takeIf { it.isNotBlank() } ?: continue
                out[uid] = reaction
            }
            return out
        }

        /**
         * `unsentAt` as Firestore hands it over — a Timestamp (read by its `toDate()`, the SDK's class
         * being out of this module's reach), a Date, or epoch milliseconds; a pending server time reads
         * as now.
         */
        internal fun unsentDate(value: Any?): Date? = when (value) {
            null -> null
            is Date -> value
            is Number -> Date(value.toLong())
            else -> runCatching { value.javaClass.getMethod("toDate").invoke(value) as? Date }.getOrNull()
        }

        private fun quote(map: Map<*, *>?): ReplyQuote? {
            val id = (map?.get("id") as? String)?.takeIf { it.isNotEmpty() } ?: return null
            if (map["unsent"] == true) return ReplyQuote(id = id, senderId = map["senderId"] as? String ?: "", text = "", unsent = true)
            return ReplyQuote(
                id = id,
                senderId = map["senderId"] as? String ?: "",
                text = ReplyQuote.cut(map["text"] as? String ?: ""),
                cardRef = (map["cardRef"] as? String)?.takeIf { it.isNotEmpty() },
                image = map["image"] == true,
                sticker = ChatSticker.from(map["sticker"] as? Map<*, *>),
            )
        }

        private fun preview(map: Map<*, *>?, origin: String): LinkPreview? {
            map ?: return null
            // The address is what a tap opens: only one the link rules accept (http(s), no userinfo, a real host).
            val url = (map["url"] as? String)?.let(Linkify::normalize) ?: return null
            val title = (map["title"] as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            return LinkPreview(
                url = url,
                title = title,
                description = (map["description"] as? String)?.trim()?.takeIf { it.isNotEmpty() },
                siteName = (map["siteName"] as? String)?.trim()?.takeIf { it.isNotEmpty() },
                imageUrl = imageUrl(map["image"] as? String, origin),
            )
        }

        /**
         * The server writes the picture as a path of its own image proxy; anything else (another
         * host, a plain address, a path elsewhere on the site) is no picture of ours, and nothing
         * is requested for it.
         */
        internal fun imageUrl(path: String?, origin: String): String? {
            if (path == null || !path.startsWith(IMAGE_PATH) || path.length > 4096 || path.any { it.isWhitespace() || it.isISOControl() }) return null
            return origin.trimEnd('/') + path
        }

        internal const val IMAGE_PATH = "/api/link-image?"
    }
}
