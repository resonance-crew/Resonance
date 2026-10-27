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
) {
    companion object {
        const val MAX_TEXT = 140

        /** The quote a reply to [message] carries (the same cut the server makes). */
        fun of(message: ChatMessage) = ReplyQuote(message.id, message.senderId, cut(message.text), message.cardRef, image = message.image != null)

        /** At most [MAX_TEXT] code points, never splitting a surrogate pair. */
        fun cut(text: String): String {
            if (text.codePointCount(0, text.length) <= MAX_TEXT) return text
            return text.substring(0, text.offsetByCodePoints(0, MAX_TEXT))
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
