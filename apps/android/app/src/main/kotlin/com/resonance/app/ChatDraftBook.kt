package com.resonance.app

import android.content.SharedPreferences
import com.resonance.kit.chat.ChatDraft
import com.resonance.kit.chat.ChatDrafts
import com.resonance.kit.chat.KeyboardHeights
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

/**
 * The signed-in account's unsent messages, by conversation (round 22 §4.4): the thread opens on its
 * own and keeps it as it is written; the conversation list shows each after its pen ([drafts], live,
 * so a draft written in the pane beside the list shows there at once). Kept in [ChatDrafts] on the
 * device; gone with the account on sign-out ([forget]).
 */
class ChatDraftBook(private val store: ChatDrafts?) {
    private val _drafts = MutableStateFlow<Map<String, ChatDraft>>(emptyMap())
    val drafts: StateFlow<Map<String, ChatDraft>> = _drafts
    private var account: String? = null

    /** [uid] signed in (null: nobody): its drafts are read. */
    fun start(uid: String?) {
        account = uid
        _drafts.value = uid?.let { store?.of(it)?.all() }.orEmpty()
    }

    fun get(pair: String): ChatDraft? = _drafts.value[pair]

    /** Keeps [draft] for [pair] (an empty one clears it). */
    fun keep(pair: String, draft: ChatDraft) {
        val who = account ?: return
        if (draft.isEmpty) return clear(pair)
        if (_drafts.value[pair] == draft) return
        store?.of(who)?.keep(pair, draft)
        _drafts.value = _drafts.value + (pair to draft)
    }

    /** The draft for [pair] was sent, emptied, or its conversation deleted. */
    fun clear(pair: String) {
        val who = account ?: return
        if (pair !in _drafts.value) return
        store?.of(who)?.clear(pair)
        _drafts.value = _drafts.value - pair
    }

    /** [uid] signed out: none of its drafts stay. */
    fun forget(uid: String) {
        store?.forget(uid)
        if (account == uid || account == null) _drafts.value = emptyMap()
    }
}

/**
 * One thread's hold on its conversation's draft in the account's [book] (round 22 §4.4): nothing is
 * written back until the kept draft has been read into the composer ([restore]) — an empty composer
 * opening must not wipe it — and nothing again once the conversation is deleted ([deleted]), though the
 * screen keeps its draft as it goes (iOS's ChatDrafts alike).
 */
class ThreadDraft(private val book: ChatDraftBook) {
    /** The kept draft has been read into the composer: what the composer holds may be written down. */
    var restored = false
        private set

    /** The draft kept for [pair], once (null: none, or read already). */
    fun restore(pair: String): ChatDraft? {
        if (restored) return null
        restored = true
        return book.get(pair)
    }

    /** What the composer holds now, written down for [pair] (an empty draft clears it) — only after [restore]. */
    fun keep(pair: String, draft: ChatDraft) {
        if (restored) book.keep(pair, draft)
    }

    /** The draft was sent (queued): nothing of it is kept; the composer's next words are a draft again. */
    fun sent(pair: String) = book.clear(pair)

    /** The conversation was deleted: its draft goes, and the screen leaving writes nothing back. */
    fun deleted(pair: String) {
        restored = false
        book.clear(pair)
    }
}

/** Where unsent messages wait on the device ([ChatDrafts]): `chat-drafts.xml`, one entry per account, outside the backup. */
class ChatDraftPrefs(private val prefs: SharedPreferences) : ChatDrafts.Storage {
    override fun read(account: String): String? = prefs.getString("drafts:$account", null)

    override fun write(account: String, value: String?) {
        prefs.edit().apply { if (value == null) remove("drafts:$account") else putString("drafts:$account", value) }.apply()
    }

    companion object {
        const val FILE = "chat-drafts"
    }
}

/**
 * Where the keyboard's height is remembered, per orientation (`composer.xml`, the device's, outside
 * the backup: another phone's keyboard is another height).
 */
class KeyboardHeightPrefs(private val prefs: SharedPreferences) : KeyboardHeights.Storage {
    override fun read(key: String): Float? = if (prefs.contains(key)) prefs.getFloat(key, 0f) else null
    override fun write(key: String, value: Float) {
        prefs.edit().putFloat(key, value).apply()
    }

    companion object {
        const val FILE = "composer"
    }
}
