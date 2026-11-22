package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasSetTextAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.unit.dp
import com.resonance.app.NoteSends
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.RuleChain
import org.junit.runner.RunWith
import org.junit.runners.model.Statement
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File

/**
 * The note in place (round 26, SETTLED — the owner: 「這個記小紙條的界面應該不要做成 pop ups」): 寄小紙條 opens the field
 * under the story, focused — never a dialog, and 共振 opens nothing; tapped again an empty field closes and one with
 * words only takes the focus; one line under it by priority; a draft opens it with the page; a note that didn't go
 * comes back into the field while the page is there. Round 30 (「照 C 做」): the field across the story's column at every
 * width (no 680 cap), no envelope — the words, the line under them and the wait line all 16 in.
 */
@RunWith(RobolectricTestRunner::class)
// A tablet's column (900) as well as a phone's.
@Config(application = Application::class, qualifiers = "w1200dp-h1600dp")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class NoteInPlaceTest {
    private val compose = createComposeRule()

    // The app's own manifest has no host for a composed screen: the test's activity is made known before the rule starts it.
    @get:Rule val rules: RuleChain = RuleChain.outerRule { base, _ ->
        object : Statement() {
            override fun evaluate() {
                val app = RuntimeEnvironment.getApplication()
                shadowOf(app.packageManager).addActivityIfNotPresent(ComponentName(app, ComponentActivity::class.java))
                base.evaluate()
            }
        }
    }.around(compose)

    private val language = Strings.language

    @Before fun catalogs() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
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

    /**
     * The owner, 2026-11-20: the note's 寄出 filled the capsule's whole end at any number of lines, where the messages'
     * composer makes it the 52 × 48 block on the last row from the second. The note takes the composer's rule (never
     * grown, nothing riding) from the lines its field lays out — never a fixed strip.
     */
    @Test fun itsSendIsTheComposersBlockFromTheSecondLine() {
        assertFalse(composerTools("一行", lines = 1, expanded = false).block)
        assertTrue(composerTools("兩行\n第二行", lines = 2, expanded = false).block)
        val source = File("src/main/kotlin/com/resonance/app/ui/NoteInPlace.kt").readText()
        assertTrue(source.contains("onTextLayout = { lines = it.lineCount }"))
        assertTrue(source.contains("block = composerTools(state.text, lines, expanded = false).block"))
    }

    /** The note's place open in a column [width] wide. */
    private fun shown(note: NoteFieldState, width: Int, mayNote: Boolean = true) = compose.setContent {
        Box(Modifier.width(width.dp).testTag("column")) {
            NoteInPlace(note, mayNote = mayNote, reducedMotion = true, onSend = {}, onUpgrade = {})
        }
    }

    @Test fun wideTheFieldSpansTheStorysColumnTo寄出OnItsEdge() {
        // A tablet's column of 900: the field from its start to its end (it stopped at 680), 寄出 ending on the edge.
        shown(NoteFieldState("謝謝你", mayNote = true).apply { segment() }, 900)
        compose.waitForIdle()
        val column = compose.onNodeWithTag("column").getBoundsInRoot()
        val send = compose.onNodeWithContentDescription(L10n.Card.Note.send).getBoundsInRoot()
        assertEquals(column.right.value, send.right.value, 0.5f)
        assertTrue("the field passes the old 680 cap", send.right.value > 680f + 1f)
    }

    @Test fun onAPhoneTheFieldSpansTheColumnAsBefore() {
        shown(NoteFieldState("謝謝你", mayNote = true).apply { segment() }, 335)
        compose.waitForIdle()
        assertEquals(335f, compose.onNodeWithContentDescription(L10n.Card.Note.send).getBoundsInRoot().right.value, 0.5f)
    }

    @Test fun noEnvelopeTheWordsStartSixteenIn() {
        // The envelope's 48 lead column is gone: the words (and the placeholder) start 16 from the field's start.
        shown(NoteFieldState("", mayNote = true).apply { segment() }, 600)
        compose.waitForIdle()
        val field = compose.onNode(hasSetTextAction()).getBoundsInRoot()
        assertEquals(NoteWordsStart.value, field.left.value, 0.5f)
        assertEquals(16f, NoteWordsStart.value, 0f)
        val hint = compose.onNodeWithText(notePlaceholder(), useUnmergedTree = true).getBoundsInRoot()
        assertEquals(16f, hint.left.value, 0.5f)
        // The envelope is drawn nowhere in it: the field is named as before, and is the only thing at its start.
        compose.onNode(hasSetTextAction()).assertExistsWithEntry()
    }

    private fun androidx.compose.ui.test.SemanticsNodeInteraction.assertExistsWithEntry() {
        assertEquals(L10n.Card.Note.entry, fetchSemanticsNode().config[androidx.compose.ui.semantics.SemanticsProperties.ContentDescription].single())
    }

    @Test fun theLineUnderTheFieldStartsSixteenIn() {
        val note = NoteFieldState("", mayNote = true).apply { segment() }
        note.edit("字".repeat(NOTE_UPGRADE_THRESHOLD + 1))
        shown(note, 600)
        compose.waitForIdle()
        assertEquals(16f, compose.onNodeWithText(L10n.Card.Note.upgrade, useUnmergedTree = true).getBoundsInRoot().left.value, 0.5f)
    }

    @Test fun theWaitLineStartsSixteenIn() {
        // Three letters unanswered: the wait line alone in the note's place, 16 in (it stood 0 in).
        shown(NoteFieldState("寫到一半", mayNote = false).apply { segment(mayNote = false) }, 600, mayNote = false)
        compose.waitForIdle()
        assertEquals(16f, compose.onNodeWithText(L10n.Card.Note.waitForReply, useUnmergedTree = true).getBoundsInRoot().left.value, 0.5f)
    }
}
