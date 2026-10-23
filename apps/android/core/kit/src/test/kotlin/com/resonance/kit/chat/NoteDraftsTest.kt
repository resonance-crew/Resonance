package com.resonance.kit.chat

import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNull
import kotlin.test.assertTrue

/**
 * A note's words wait on the device until it is sent: per account and card, through the composer
 * closing and the app going (the store outlives both), gone once sent, emptied or signed out of —
 * at most fifty kept, none past thirty days.
 */
class NoteDraftsTest {
    /** The device's store: what survives the composer, and the app being killed. */
    private class Device : NoteDrafts.Storage {
        val values = HashMap<String, String>()
        var writes = 0
        override fun read(account: String): String? = values[account]
        override fun write(account: String, value: String?) {
            writes++
            if (value == null) values.remove(account) else values[account] = value
        }
    }

    private val device = Device()
    private var now = 1_000_000L
    private fun drafts() = NoteDrafts(device) { now }

    @Test fun wordsTypedAndLeftComeBackWhenTheComposerOpensAgainEvenAfterTheAppWasKilled() {
        val composer = NoteDraft(drafts().of("alice"), "walk")
        assertEquals("", composer.initial)
        composer.keep("Your story stayed")
        // Closed by a tap beside it, back, or 取消: what it holds as it goes is kept.
        composer.keep("Your story stayed with me.")

        // The app killed and opened again: a new store over the same device.
        val again = NoteDraft(drafts().of("alice"), "walk")
        assertEquals("Your story stayed with me.", again.initial)
        // Another card's composer opens empty; so does the same card under another account.
        assertEquals("", NoteDraft(drafts().of("alice"), "coffee").initial)
        assertEquals("", NoteDraft(drafts().of("bob"), "walk").initial)
    }

    @Test fun aSentNoteLeavesNothingAndItsComposerWritesNothingBackAsItCloses() {
        val composer = NoteDraft(drafts().of("alice"), "walk")
        composer.keep("Thank you for this.")
        composer.sent()
        // The composer closing after the confirmation (or a keystroke's late write) keeps nothing.
        composer.keep("Thank you for this.")
        assertNull(drafts().of("alice").text("walk"))
        assertTrue(device.values.isEmpty())
    }

    @Test fun aComposerOpenedAndClosedWithoutTypingWritesNothing() {
        drafts().of("alice").keep("walk", "Kept from before.")
        val before = device.writes
        val composer = NoteDraft(drafts().of("alice"), "walk")
        // The pause after it opens, the app leaving the screen, the composer closing: the same words.
        composer.keep(composer.initial)
        composer.keep(composer.initial)
        assertEquals(before, device.writes)
        assertEquals("Kept from before.", drafts().of("alice").text("walk"))
        // Nor does one opened on nothing.
        NoteDraft(drafts().of("alice"), "coffee").keep("")
        assertEquals(before, device.writes)
    }

    @Test fun emptyingTheNoteClearsItsDraft() {
        val composer = NoteDraft(drafts().of("alice"), "walk")
        composer.keep("Never mind")
        composer.keep("   \n")
        assertNull(drafts().of("alice").text("walk"))
        composer.keep("")
        assertNull(drafts().of("alice").text("walk"))
    }

    @Test fun signingOutTakesTheAccountsNotesAndNoOneElses() {
        val store = drafts()
        store.of("alice").keep("walk", "alice's words")
        store.of("bob").keep("walk", "bob's words")
        store.forget("alice")
        assertNull(store.of("alice").text("walk"))
        assertEquals("bob's words", store.of("bob").text("walk"))
    }

    @Test fun atMostFiftyAreKeptTheOneWrittenLongestAgoGoingFirst() {
        val alice = drafts().of("alice")
        for (i in 1..NoteDrafts.MAX) {
            now += 1_000
            alice.keep("card$i", "note $i")
        }
        // Touching card1 again makes it the latest; card2 is now the oldest.
        now += 1_000
        alice.keep("card1", "note 1, again")
        now += 1_000
        alice.keep("card51", "note 51")
        assertNull(alice.text("card2"))
        assertEquals("note 1, again", alice.text("card1"))
        assertEquals("note 51", alice.text("card51"))
        assertEquals("note 3", alice.text("card3"))
    }

    @Test fun noneOlderThanThirtyDaysIsKept() {
        val alice = drafts().of("alice")
        alice.keep("old", "from a month ago")
        now += 10L * 24 * 60 * 60 * 1000
        alice.keep("recent", "from twenty days ago")
        now += NoteDrafts.MAX_AGE_MS - 10L * 24 * 60 * 60 * 1000 + 1
        // Thirty days and a moment after it was written: let go, read or written.
        assertNull(alice.text("old"))
        assertEquals("from twenty days ago", alice.text("recent"))
    }

    @Test fun whatTheDeviceHoldsThatCantBeReadIsAsGoodAsNothing() {
        device.values["alice"] = "{not json"
        assertNull(drafts().of("alice").text("walk"))
        drafts().of("alice").keep("walk", "fresh")
        assertEquals("fresh", drafts().of("alice").text("walk"))
    }
}
