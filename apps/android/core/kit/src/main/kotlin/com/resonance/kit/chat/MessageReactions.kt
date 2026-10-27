package com.resonance.kit.chat

import java.util.Date

/**
 * A message's reactions and its unsending, as rules with no screen (round 16 §3–§4). The reactions a
 * build knows are [KNOWN], in the order every surface shows them; a stored id it doesn't know is
 * drawn as nothing. One person, one reaction: choosing another replaces it, choosing the same again
 * takes it back.
 */
object MessageReactions {
    /** ❤️ heart · 🥹 moved · 😆 laugh · 🫂 hug · 👍 thumbs — that order everywhere. */
    val KNOWN: List<String> = listOf("heart", "moved", "laugh", "hug", "thumbs")

    /** How long after it was sent a message may be unsent (the server's `UNSEND_WINDOW_MS`). */
    const val UNSEND_WINDOW_MS: Long = 24L * 60 * 60 * 1000

    /** One chip beside a bubble: a reaction, how many gave it, and whether the viewer did. */
    data class Chip(val id: String, val count: Int, val mine: Boolean)

    /**
     * The chips [reactions] make for [me]: one per distinct known reaction, in [KNOWN]'s order, with
     * how many gave it (2 when both of the conversation's people did). Unknown ids are left out.
     */
    fun chips(reactions: Map<String, String>, me: String?): List<Chip> {
        if (reactions.isEmpty()) return emptyList()
        return KNOWN.mapNotNull { id ->
            val givers = reactions.filterValues { it == id }.keys
            if (givers.isEmpty()) null else Chip(id, givers.size, me != null && me in givers)
        }
    }

    /** The viewer's own reaction, if it is one this build knows. */
    fun mine(reactions: Map<String, String>, me: String?): String? = me?.let { reactions[it] }?.takeIf { it in KNOWN }

    /**
     * What choosing [id] does to [reactions] for [me]: the same as theirs takes it back (null: remove),
     * another replaces it. Returns the reactions after, and what to send (the id, or null for removing).
     */
    fun choose(reactions: Map<String, String>, me: String, id: String): Pair<Map<String, String>, String?> =
        if (reactions[me] == id) (reactions - me) to null else (reactions + (me to id)) to id

    /**
     * Whether [message] may be unsent by [me] at [now] (round 16 §3): their own, delivered, not a note,
     * not already unsent, and no older than [UNSEND_WINDOW_MS].
     */
    fun canUnsend(message: ChatMessage, me: String?, now: Date = Date()): Boolean =
        me != null && message.senderId == me && message.delivery == Delivery.Delivered && !message.isNote && !message.isUnsent &&
            now.time - message.sentAt.time <= UNSEND_WINDOW_MS

    /** Whether [message] may be reacted to: delivered, not unsent (the server asks the rest: connected, no block). */
    fun canReact(message: ChatMessage): Boolean = message.delivery == Delivery.Delivered && !message.isUnsent
}
