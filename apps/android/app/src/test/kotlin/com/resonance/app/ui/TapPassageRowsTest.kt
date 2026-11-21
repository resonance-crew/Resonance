package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertHasNoClickAction
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.TapList
import com.resonance.api.models.TapNote
import com.resonance.api.models.TapPassageQuote
import com.resonance.api.models.TapPerson
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LocalWindowLayout
import com.resonance.design.WindowLayout
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
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

/**
 * Round 27 §U2 and §U3 — who learns the pick: the author, on every row of their list (the quote, then the note's first
 * line), and the reader on their own row alone (their quote, or 選一段 when the card offers passages and they picked
 * none) — no other row of a reader's list ever a second line, on a named card or an anonymous one (M3).
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TapPassageRowsTest {
    private val compose = createComposeRule()

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

    @Before fun setUp() {
        AppFonts.init(RuntimeEnvironment.getApplication())
        Grain.init(RuntimeEnvironment.getApplication())
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun author(id: String) = Author(id, id, id.take(2).uppercase(), "oklch(88% 0.08 55)", null, "7", false, null)
    private fun person(id: String, quote: String? = null, note: String? = null) =
        TapPerson(author(id), note?.let { TapNote(it) }, quote?.let { TapPassageQuote(it) })

    private val gus = person("gus", quote = "原來一個人的早晨，也可以不急。")
    private val carol = person("carol", quote = "咖啡涼了也沒關係。", note = "我也是這樣搬出來的")
    private val hana = person("hana")

    @Test fun theAuthorsListShowsEveryPickThenTheNote() {
        assertEquals(TapRowLines(quote = gus.passage!!.text), tapRowLines(gus, anonymous = false, author = true, viewerId = null, offersPassages = false))
        assertEquals(
            TapRowLines(quote = carol.passage!!.text, excerpt = "我也是這樣搬出來的"),
            tapRowLines(carol, anonymous = false, author = true, viewerId = null, offersPassages = false),
        )
        // No pick, no note: as round 26, 60 tall.
        assertEquals(TapRowLines.NONE, tapRowLines(hana, anonymous = false, author = true, viewerId = null, offersPassages = false))
        // An anonymous card: the pick still, the note never.
        assertEquals(TapRowLines(quote = carol.passage!!.text), tapRowLines(carol, anonymous = true, author = true, viewerId = null, offersPassages = false))
    }

    @Test fun aReadersListShowsTheirOwnRowAloneNeverAnothers() {
        // Their own pick.
        assertEquals(TapRowLines(quote = gus.passage!!.text), tapRowLines(gus, anonymous = true, author = false, viewerId = "gus", offersPassages = true))
        // Someone else's row, even holding a pick and a note: nothing (the server sends none; the app shows none).
        assertEquals(TapRowLines.NONE, tapRowLines(carol, anonymous = true, author = false, viewerId = "gus", offersPassages = true))
        // Their own row with no pick: 選一段 while the card offers passages; else as today.
        assertEquals(TapRowLines(pick = true), tapRowLines(hana, anonymous = true, author = false, viewerId = "hana", offersPassages = true))
        assertEquals(TapRowLines.NONE, tapRowLines(hana, anonymous = true, author = false, viewerId = "hana", offersPassages = false))
        // Their own row picks again (the dialog); any other leads to the profile, as today.
        assertTrue(readerRowPicks(hana, "hana", offersPassages = true))
        assertFalse(readerRowPicks(hana, "hana", offersPassages = false))
        assertFalse(readerRowPicks(carol, "hana", offersPassages = true))
    }

    private fun showReader(viewer: String, offers: Boolean, people: List<TapPerson>, rows: MutableList<String>) = compose.setContent {
        CompositionLocalProvider(LocalWindowLayout provides WindowLayout(390.dp)) {
            val list = remember { TapPeople { TapList(people, nextPageToken = null) } }
            LaunchedEffect(list) { list.first() }
            ReaderTapDialog(list, onDismiss = {}, lines = { tapRowLines(it, anonymous = true, author = false, viewer, offers) }) { rows += it.author.handle }
        }
    }

    @Test fun theReadersOwnRowSaysTheirQuoteAndNoOtherRowDoes() {
        val rows = mutableListOf<String>()
        showReader("gus", offers = true, listOf(gus, carol), rows)
        compose.waitForIdle()
        compose.onNodeWithText(L10n.Card.Tap.passageQuote(gus.passage!!.text)).assertExists()
        compose.onAllNodesWithText(L10n.Card.Tap.passageQuote(carol.passage!!.text)).assertCountEquals(0)
        compose.onAllNodesWithText("我也是這樣搬出來的").assertCountEquals(0)
        compose.onAllNodesWithText(L10n.Card.Tap.passagePick).assertCountEquals(0)
    }

    @Test fun theReadersOwnRowWithNoPickOffersOne() {
        val rows = mutableListOf<String>()
        showReader("hana", offers = true, listOf(hana, carol), rows)
        compose.waitForIdle()
        compose.onNodeWithText(L10n.Card.Tap.passagePick).assertExists()
        compose.onNodeWithText("hana").performClick()
        assertEquals(listOf("hana"), rows)
    }

    private fun showFaces(selfOpens: Boolean) = compose.setContent {
        TapFacesButton(TapFaces(true, listOf(author("dora")), false), "dora", author = false, onOpen = {}, selfOpens = selfOpens)
    }

    @Test fun theOwnFaceAloneOpensNothingOnACardWithoutPassages() {
        showFaces(selfOpens = false)
        compose.onNodeWithTag("tap-faces").assertHasNoClickAction()
    }

    @Test fun theOwnFaceAloneOpensTheListWhenTheCardOffersPassages() {
        showFaces(selfOpens = true)
        compose.onNodeWithTag("tap-faces").assertHasClickAction()
    }
}
