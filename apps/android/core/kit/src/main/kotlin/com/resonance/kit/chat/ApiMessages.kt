package com.resonance.kit.chat

import com.resonance.api.models.ThreadMessage
import java.time.OffsetDateTime
import java.util.Date

/**
 * A message as GET /conversations/{pair}/messages answers it, as the thread draws it: the same
 * fields a `messages` document has (the contract keeps the document's shape), read by the same
 * [ChatMessage.from], so the two paths can't draw one message two ways. Times are ISO strings to
 * the microsecond; an unparsable one reads as now (as a pending server time does).
 */
fun ThreadMessage.toChatMessage(origin: String): ChatMessage {
    val fields = HashMap<String, Any?>()
    fields["senderId"] = senderId
    fields["text"] = text
    kind?.let { fields["kind"] = it }
    cardRef?.let { fields["cardRef"] = it }
    noteRef?.let { fields["noteRef"] = mapOf("cardId" to it.cardId, "noteId" to it.noteId) }
    replyTo?.let { q ->
        fields["replyTo"] = mapOf(
            "id" to q.id, "senderId" to q.senderId, "text" to q.text, "cardRef" to q.cardRef,
            "image" to q.image, "unsent" to q.unsent,
            "sticker" to q.sticker?.let { mapOf("pack" to it.pack, "id" to it.id) },
        )
    }
    image?.let { fields["image"] = mapOf("id" to it.id, "width" to it.width, "height" to it.height) }
    album?.let { fields["album"] = mapOf("id" to it.id, "index" to it.index, "count" to it.count) }
    sticker?.let { fields["sticker"] = mapOf("pack" to it.pack, "id" to it.id) }
    reactions?.let { fields["reactions"] = it }
    privateShare?.let { fields["privateShare"] = it }
    preview?.let { fields["preview"] = mapOf("url" to it.url, "title" to it.title, "description" to it.description, "siteName" to it.siteName, "image" to it.image) }
    unsentAt?.let(::isoDate)?.let { fields["unsentAt"] = it }
    return ChatMessage.from(id = id, fields = fields, sentAt = isoDate(sentAt) ?: Date(), origin = origin)
}

/** An ISO 8601 time of the contract's (`2026-11-21T08:00:00.123456Z`); null when it isn't one. */
fun isoDate(text: String?): Date? = text?.let { runCatching { Date.from(OffsetDateTime.parse(it).toInstant()) }.getOrNull() }
