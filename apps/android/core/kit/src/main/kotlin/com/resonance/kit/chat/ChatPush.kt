package com.resonance.kit.chat

/**
 * A chat message's push as the server sends it (`type: "message"`): the sender's pen name as the
 * title and the message (or the localized "Shared a card") as the body, already in this device's
 * language. A build that draws the conversation's notification itself gets this as a data-only
 * push (it registered the `chat-push` capability); any other path delivers the same keys with a
 * notification payload beside them.
 */
data class ChatPush(
    val conversationId: String,
    val messageId: String?,
    val fromUserId: String?,
    /** Whom it was sent to (the server names them; an older server didn't — then the conversation's pair stands in). */
    val toUserId: String?,
    val title: String,
    val body: String,
    /** A site path, `/messages/{handle}`. */
    val route: String,
    /** When the message was sent, epoch milliseconds. */
    val sentAt: Long,
    /** The sender's profile photo (the server sends one only from our own storage), when they have one. */
    val fromAvatarUrl: String? = null,
    /** What their avatar shows without a photo — their initials, on their colour (a CSS `oklch(…)`) — when their profile says. */
    val fromInitials: String? = null,
    val fromColor: String? = null,
) {
    /**
     * Whether this push may be drawn for [signedIn]: the account it was sent to must be the one
     * signed in. A sign-out whose unregister never reached the server leaves the install
     * registered to the old account for a while — its messages must not show on the lock screen
     * of a signed-out phone, or of whoever signed in next.
     */
    fun isFor(signedIn: String?): Boolean {
        if (signedIn.isNullOrEmpty()) return false
        toUserId?.let { return it == signedIn }
        return conversationId.split("_").let { it.size == 2 && signedIn in it }
    }

    companion object {
        const val TYPE = "message"

        /**
         * The push [data] describes, or null when it isn't a chat message or lacks what a
         * notification needs (a conversation to stack it in, someone it is from).
         * [fallbackTitle] and [fallbackBody] are the notification payload's, for the path that has one.
         */
        fun from(data: Map<String, String>, fallbackTitle: String? = null, fallbackBody: String? = null, now: Long = System.currentTimeMillis()): ChatPush? {
            if (data["type"] != TYPE) return null
            val conversationId = data["conversationId"]?.takeIf { it.isNotBlank() } ?: return null
            val title = (data["title"] ?: fallbackTitle)?.takeIf { it.isNotBlank() } ?: return null
            return ChatPush(
                conversationId = conversationId,
                messageId = data["messageId"]?.takeIf { it.isNotBlank() },
                fromUserId = data["fromUserId"]?.takeIf { it.isNotBlank() },
                toUserId = data["toUserId"]?.takeIf { it.isNotBlank() },
                title = title,
                body = data["body"] ?: fallbackBody.orEmpty(),
                route = data["route"].orEmpty(),
                sentAt = data["sentAt"]?.toLongOrNull()?.takeIf { it > 0 } ?: now,
                fromAvatarUrl = data["fromAvatarUrl"]?.takeIf { it.startsWith("https://") || it.startsWith("http://") },
                fromInitials = data["fromInitials"]?.trim()?.takeIf { it.isNotEmpty() },
                fromColor = data["fromColor"]?.takeIf { it.isNotBlank() },
            )
        }
    }
}

/**
 * A message unsent after its push was shown (round 16 §3, `type: "unsend"`, data-only to builds that
 * draw their conversations' notifications themselves): the conversation's notification is drawn again
 * without that line — or taken away when no line is left.
 */
data class ChatUnsend(val conversationId: String, val messageId: String, val toUserId: String? = null) {
    /** Only for the account it was sent to, as [ChatPush.isFor] (the pair stands in when the server names no one). */
    fun isFor(signedIn: String?): Boolean {
        if (signedIn.isNullOrEmpty()) return false
        toUserId?.let { return it == signedIn }
        return conversationId.split("_").let { it.size == 2 && signedIn in it }
    }

    companion object {
        const val TYPE = "unsend"

        /** The unsend [data] describes, or null when it isn't one or lacks the conversation or the message. */
        fun from(data: Map<String, String>): ChatUnsend? {
            if (data["type"] != TYPE) return null
            val conversationId = data["conversationId"]?.takeIf { it.isNotBlank() } ?: return null
            val messageId = data["messageId"]?.takeIf { it.isNotBlank() } ?: return null
            return ChatUnsend(conversationId, messageId, data["toUserId"]?.takeIf { it.isNotBlank() })
        }
    }
}
