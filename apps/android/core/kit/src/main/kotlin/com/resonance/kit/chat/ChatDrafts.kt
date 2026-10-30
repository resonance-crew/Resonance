package com.resonance.kit.chat

import com.resonance.kit.api.MessagingApi
import kotlinx.serialization.Serializable
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json

/**
 * A card waiting in the composer with the message (its row's title, cover and whether it is a 私人卡),
 * as a draft keeps it.
 */
data class DraftCard(val id: String, val title: String, val cover: String? = null, val keptPrivate: Boolean = false)

/**
 * What a conversation's composer held and didn't send (round 22 §4.4): the words, the message being
 * replied to, the note being answered and the card riding with it — never pictures (they are the
 * device's own files, and big). Empty: nothing worth keeping.
 */
data class ChatDraft(
    val text: String = "",
    val reply: ReplyQuote? = null,
    val noteRef: MessagingApi.Note? = null,
    val card: DraftCard? = null,
) {
    val isEmpty: Boolean get() = text.isBlank() && reply == null && noteRef == null && card == null

    /** What the conversation list shows of it after its pen (round 22 §4.4): its words, else the card's title; null: nothing to show. */
    val preview: String?
        get() = text.trim().replace('\n', ' ').takeIf { it.isNotEmpty() } ?: card?.title?.takeIf { it.isNotBlank() }
}

/**
 * Messages written and not sent, kept on the device per signed-in account and conversation (round 22
 * §4.4) — the web keeps them in localStorage, iOS in a file per account: the composer opens on them
 * again, and the conversation list shows them. Kept a moment after typing stops and as the thread is
 * left; a draft sent (queued), emptied, or whose conversation is deleted leaves nothing, and the
 * account's sign-out takes all of them ([forget]). At most [MAX] are kept (the one written longest ago
 * goes first), none older than [MAX_AGE_MS].
 */
class ChatDrafts(private val storage: Storage, private val clock: () -> Long = System::currentTimeMillis) {
    /** Where an account's drafts are kept, as one string; null: none. The app's is outside the device's backup. */
    interface Storage {
        fun read(account: String): String?
        fun write(account: String, value: String?)
    }

    @Serializable
    private data class Quote(
        val id: String,
        val senderId: String,
        val text: String = "",
        val cardRef: String? = null,
        val image: Boolean = false,
        val stickerPack: String? = null,
        val stickerId: String? = null,
    )

    @Serializable
    private data class Note(val cardId: String, val noteId: String)

    @Serializable
    private data class Card(val id: String, val title: String = "", val cover: String? = null, val keptPrivate: Boolean = false)

    @Serializable
    private data class Entry(val text: String = "", val reply: Quote? = null, val note: Note? = null, val card: Card? = null, val at: Long)

    /** One account's drafts. */
    inner class Account(val id: String) {
        /** The draft kept for the conversation [pair] (null: none, or too old). */
        fun get(pair: String): ChatDraft? = synchronized(this@ChatDrafts) { load(id)[pair]?.let(::draftOf) }

        /** Every conversation's draft, by pair id. */
        fun all(): Map<String, ChatDraft> = synchronized(this@ChatDrafts) { load(id).mapValues { draftOf(it.value) } }

        /** Keeps [draft] for [pair], as written now; an empty one clears it. */
        fun keep(pair: String, draft: ChatDraft) = synchronized(this@ChatDrafts) {
            val entries = load(id).toMutableMap()
            if (draft.isEmpty) entries.remove(pair) else entries[pair] = entryOf(draft)
            save(id, entries)
        }

        /** The draft for [pair] was sent, or its conversation deleted: nothing of it is kept. */
        fun clear(pair: String) = synchronized(this@ChatDrafts) {
            val entries = load(id)
            if (pair in entries) save(id, entries - pair)
        }
    }

    fun of(account: String): Account = Account(account)

    /** The account signed out (or another signed in on this device): none of its drafts stay. */
    @Synchronized
    fun forget(account: String) = storage.write(account, null)

    private fun entryOf(d: ChatDraft) = Entry(
        text = d.text,
        reply = d.reply?.let { Quote(it.id, it.senderId, it.text, it.cardRef, it.image, it.sticker?.pack, it.sticker?.id) },
        note = d.noteRef?.let { Note(it.cardId, it.noteId) },
        card = d.card?.let { Card(it.id, it.title, it.cover, it.keptPrivate) },
        at = clock(),
    )

    private fun draftOf(e: Entry) = ChatDraft(
        text = e.text,
        reply = e.reply?.let { q ->
            val sticker = if (q.stickerPack != null && q.stickerId != null && ChatSticker.isValid(q.stickerPack, q.stickerId)) ChatSticker(q.stickerPack, q.stickerId) else null
            ReplyQuote(q.id, q.senderId, ReplyQuote.cut(q.text), q.cardRef, image = q.image, sticker = sticker)
        },
        noteRef = e.note?.let { MessagingApi.Note(it.cardId, it.noteId) },
        card = e.card?.let { DraftCard(it.id, it.title, it.cover, it.keptPrivate) },
    )

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
        /** The most drafts kept for an account. */
        const val MAX = 50

        /** A draft left unsent longer than this is let go: 30 days. */
        const val MAX_AGE_MS = 30L * 24 * 60 * 60 * 1000

        private val json = Json { ignoreUnknownKeys = true }
        private val serializer = MapSerializer(String.serializer(), Entry.serializer())
    }
}

/**
 * Whether a restored draft's reply still stands (round 22 §4.4: a quoted message since unsent or
 * deleted is dropped on restore), once the thread has read its messages: the quoted message unsent,
 * or missing from a conversation held from its beginning ([complete]) — or gone with the whole
 * conversation ([conversationGone]) — drops it; a message older than what is held may still be there.
 */
fun replyStillStands(reply: ReplyQuote, messages: List<ChatMessage>, complete: Boolean, conversationGone: Boolean): Boolean {
    if (conversationGone) return false
    val found = messages.firstOrNull { it.id == reply.id }
    if (found != null) return !found.isUnsent
    return !complete
}
