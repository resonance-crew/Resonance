package com.resonance.app

import com.resonance.kit.chat.ChatDraft
import com.resonance.kit.chat.ChatDrafts
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * A thread's hold on its conversation's draft (round 22 §4.4): an empty composer opening never wipes what
 * was kept, what is typed is written back once it has been read, a send clears it, and a deleted
 * conversation's draft stays gone though the screen writes its draft down as it leaves.
 */
class ThreadDraftTest {
    private class Device : ChatDrafts.Storage {
        val values = HashMap<String, String>()
        override fun read(account: String): String? = values[account]
        override fun write(account: String, value: String?) {
            if (value == null) values.remove(account) else values[account] = value
        }
    }

    private val book = ChatDraftBook(ChatDrafts(Device())).also { it.start("alice") }

    @Test fun nothingIsWrittenOverTheKeptDraftBeforeItWasRead() {
        book.keep("alice_bob", ChatDraft("那天河堤"))
        val thread = ThreadDraft(book)
        // The screen saves as it opens, before the person is found: the kept words stay.
        thread.keep("alice_bob", ChatDraft())
        assertEquals("那天河堤", book.get("alice_bob")?.text)
        assertEquals("那天河堤", thread.restore("alice_bob")?.text)
        // Read once.
        assertNull(thread.restore("alice_bob"))
        thread.keep("alice_bob", ChatDraft("那天河堤，下過雨"))
        assertEquals("那天河堤，下過雨", book.get("alice_bob")?.text)
        thread.sent("alice_bob")
        assertNull(book.get("alice_bob"))
        // The next words are a draft again.
        thread.keep("alice_bob", ChatDraft("還有"))
        assertEquals("還有", book.get("alice_bob")?.text)
    }

    @Test fun aDeletedConversationsDraftIsNotWrittenBackAsTheScreenLeaves() {
        book.keep("alice_bob", ChatDraft("寫到一半"))
        val thread = ThreadDraft(book)
        thread.restore("alice_bob")
        thread.deleted("alice_bob")
        // The thread is left: onDispose and the pause write the composer's draft down — and must not bring it back.
        thread.keep("alice_bob", ChatDraft("寫到一半"))
        assertNull(book.get("alice_bob"))
        assertEquals(emptyMap<String, ChatDraft>(), book.drafts.value)
    }
}
