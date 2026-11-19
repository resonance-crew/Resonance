package com.resonance.app.ui

import com.resonance.app.NoteSends
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File

/**
 * The note in place (round 26, SETTLED — the owner: 「這個記小紙條的界面應該不要做成 pop ups」): 寄小紙條 opens the field
 * under the story, focused — never a dialog, and 共振 opens nothing; tapped again an empty field closes and one with
 * words only takes the focus; one line under it by priority; a draft opens it with the page; a note that didn't go
 * comes back into the field while the page is there.
 */
class NoteInPlaceTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun theNoteSegmentOpensTheFieldFocusedAndAgainClosesItOnlyWhenEmpty() {
        val note = NoteFieldState(draft = "", mayNote = true)
        assertFalse(note.open)
        note.segment()
        assertTrue(note.open)
        assertEquals(1, note.focusTicket)
        // Empty: closes.
        note.segment()
        assertFalse(note.open)
        // With words: stays, and takes the focus back.
        note.segment()
        note.edit("謝謝你")
        note.segment()
        assertTrue(note.open)
        assertEquals(3, note.focusTicket)
    }

    @Test fun aDraftOpensTheFieldWithThePageWhereANoteMayBeLeft() {
        assertTrue(NoteFieldState("寫到一半", mayNote = true).open)
        assertEquals("寫到一半", NoteFieldState("寫到一半", mayNote = true).text)
        // Three letters unanswered: the draft stays on the device, the field doesn't open by itself.
        assertFalse(NoteFieldState("寫到一半", mayNote = false).open)
        assertFalse(NoteFieldState("寫到一半", mayNote = false).canSend(mayNote = false))
    }

    @Test fun waitingForTheirReplyItsPlaceSaysSoAndClosesAgain() {
        // A draft kept, three letters unanswered: 寄小紙條 opens the wait line, and closes it again.
        val note = NoteFieldState("寫到一半", mayNote = false)
        note.segment(mayNote = false)
        assertTrue(note.open)
        note.segment(mayNote = false)
        assertFalse(note.open)
        assertEquals("寫到一半", note.draft)
    }

    // The owner's look (2026-11-19): the placeholder itself says where the words go and what to write — the same in
    // every state, the reader's tap on or not (card.tap.ask is no longer asked here).
    @Test fun theFieldAsksTheSameInEveryState() {
        assertEquals("悄悄告訴作者，哪一段打動你", notePlaceholder())
        Strings.language = Strings.Language.En
        assertEquals("Tell the author what moved you", notePlaceholder())
    }

    @Test fun oneLineUnderTheFieldByPriorityAndNoneWithNothingToSay() {
        val note = NoteFieldState("", mayNote = true)
        note.segment()
        // No privacy line (「這段話只有作者看得到」 is gone): an empty field has nothing under it.
        assertNull(note.line())
        note.edit("謝謝你寫下這場雨")
        assertNull(note.line())
        note.edit("字".repeat(NOTE_UPGRADE_THRESHOLD + 1))
        assertEquals(NoteLine.Upgrade, note.line())
        note.failed("", "沒送出去，再試一次")
        assertEquals(NoteLine.Error("沒送出去，再試一次"), note.line())
        // Writing again clears the error.
        note.edit(note.text + "。")
        assertEquals(NoteLine.Upgrade, note.line())
    }

    @Test fun theCountShowsOnlyNearTheCap() {
        val note = NoteFieldState("", mayNote = true)
        note.edit("a".repeat(1799))
        assertNull(note.countShown)
        note.edit("a".repeat(1800))
        assertEquals("1800 / 2000", note.countShown)
        // The field holds no more than the cap.
        note.edit("a".repeat(2100))
        assertEquals(NOTE_MAX_LENGTH, note.text.length)
    }

    @Test fun sentClosesAndKeepsTheDraftUntilTheServerHasIt() {
        val note = NoteFieldState("謝謝你寫下這場雨", mayNote = true)
        assertTrue(note.canSend(mayNote = true))
        note.sent()
        assertFalse(note.open)
        assertEquals("", note.text)
        // The empty field doesn't clear the card's draft while the note is on its way.
        assertNull(note.draft)
        // It didn't go, and the page is still here: the words come back into the field, saying why.
        note.failed("", "沒送出去，再試一次")
        assertTrue(note.open)
        assertEquals("謝謝你寫下這場雨", note.text)
        assertEquals("謝謝你寫下這場雨", note.draft)
    }

    @Test fun overTwoHundredTheWordsGoToTheWriterAndTheFieldCloses() {
        val note = NoteFieldState("", mayNote = true)
        note.segment()
        note.edit("字".repeat(250))
        note.upgraded()
        assertFalse(note.open)
        assertEquals("", note.draft)
    }

    @Test fun aFailureOnThePageReopensItThereAndElsewhereOpensTheCard() {
        val sends = NoteSends()
        var opened = 0
        sends.host("c1", true)
        assertTrue(sends.shown("c1"))
        sends.requestReopen("c1", error = "沒送出去，再試一次") { opened++ }
        assertEquals(NoteSends.Reopen("c1", "沒送出去，再試一次"), sends.reopen.value)
        assertEquals(0, opened)
        sends.took("c1")
        sends.host("c1", false)
        // From the toast's 再寄一次: the card opens, its field open and focused (no error line).
        sends.requestReopen("c1") { opened++ }
        assertEquals(1, opened)
        assertEquals(NoteSends.Reopen("c1", null), sends.reopen.value)
    }

    @Test fun aPhonesFieldGrowsToThreeLinesWiderToFive() {
        assertEquals(3, noteMaxLines(phone = true, shortWindow = false))
        assertEquals(2, noteMaxLines(phone = true, shortWindow = true))
        assertEquals(5, noteMaxLines(phone = false, shortWindow = false))
        // A phone on its side is a Medium window, and short: 2 lines over the keyboard, whatever its width.
        assertEquals(2, noteMaxLines(phone = false, shortWindow = true))
    }
}
