package com.resonance.kit.chat

import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * Notes not sent yet (小紙條), kept on the device per signed-in account and card — as the web keeps
 * them in localStorage — so a note's words outlive its composer closing (a tap beside it, back,
 * 取消) and the app being killed: the composer opens on them again for that card. A note sent (the
 * server's 201) or emptied leaves nothing; the account's sign-out takes all of them ([forget]).
 * At most [MAX] are kept (the one written longest ago goes first), none older than [MAX_AGE_MS].
 */
class NoteDrafts(private val storage: Storage, private val clock: () -> Long = System::currentTimeMillis) {
    /** Where an account's drafts are kept, as one string; null: none. The app's is outside the device's backup. */
    interface Storage {
        fun read(account: String): String?
        fun write(account: String, value: String?)
    }

    @Serializable
    private data class Entry(val text: String, val at: Long)

    /** One account's drafts. */
    inner class Account(val id: String) {
        /** The words kept for [cardId] (null: none, or too old). */
        fun text(cardId: String): String? = synchronized(this@NoteDrafts) { load(id)[cardId]?.text }

        /** Keeps [text] for [cardId], as written now; nothing but white space clears it. */
        fun keep(cardId: String, text: String) = synchronized(this@NoteDrafts) {
            val entries = load(id).toMutableMap()
            if (text.isBlank()) entries.remove(cardId) else entries[cardId] = Entry(text, clock())
            save(id, entries)
        }

        /** The note for [cardId] was sent: nothing of it is kept. */
        fun clear(cardId: String) = synchronized(this@NoteDrafts) {
            val entries = load(id)
            if (cardId in entries) save(id, entries - cardId)
        }
    }

    fun of(account: String): Account = Account(account)

    /** The account signed out (or another signed in on this device): none of its notes stay. */
    @Synchronized
    fun forget(account: String) = storage.write(account, null)

    /** What is kept, without what has aged out (a value that can't be read is as good as none). */
    private fun load(account: String): Map<String, Entry> {
        val raw = storage.read(account) ?: return emptyMap()
        val entries = runCatching { json.decodeFromString(serializer, raw) }.getOrElse { emptyMap() }
        return fresh(entries)
    }

    private fun save(account: String, entries: Map<String, Entry>) {
        val kept = fresh(entries)
        storage.write(account, if (kept.isEmpty()) null else json.encodeToString(serializer, kept))
    }

    /** At most [MAX], the latest written; none written more than [MAX_AGE_MS] ago. */
    private fun fresh(entries: Map<String, Entry>): Map<String, Entry> {
        val now = clock()
        return entries.entries
            .filter { now - it.value.at <= MAX_AGE_MS }
            .sortedByDescending { it.value.at }
            .take(MAX)
            .associate { it.key to it.value }
    }

    companion object {
        /** The most notes kept for an account. */
        const val MAX = 50

        /** A note left unsent longer than this is let go: 30 days. */
        const val MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000

        private val json = Json { ignoreUnknownKeys = true }
        private val serializer = MapSerializer(String.serializer(), Entry.serializer())
    }
}

/**
 * One note composer's draft (the card it is for, in the signed-in account's [NoteDrafts]): the
 * words it opens on, kept as they are typed and as it closes — until the note is sent, after which
 * nothing it holds is written back.
 */
class NoteDraft(private val drafts: NoteDrafts.Account?, private val cardId: String) {
    /** What the composer opens on: the words kept for this card, or nothing. */
    val initial: String = drafts?.text(cardId).orEmpty()

    private var sent = false
    /** What was last written down (the same words again are not written twice). */
    private var kept = initial

    /** The words as they stand (typed, or as the composer closes); none clears the draft. */
    fun keep(text: String) {
        if (sent || text == kept) return
        drafts?.keep(cardId, text)
        kept = text
    }

    /** The note went (the server's 201): its draft goes, and nothing more is kept for it from this composer. */
    fun sent() {
        sent = true
        drafts?.clear(cardId)
    }
}
