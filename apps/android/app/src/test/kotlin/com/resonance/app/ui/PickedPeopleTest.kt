package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasClickAction
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.isPopup
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.TapList
import com.resonance.api.models.TapNote
import com.resonance.api.models.TapPassageQuote
import com.resonance.api.models.TapPerson
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.StoryType
import com.resonance.design.WindowLayout
import com.resonance.kit.api.ApiConfiguration
import com.resonance.kit.api.TapApi
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.StoryScript
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
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
 * Who resonated with one sentence (round 29 §S4 — the owner: 「點選這個highlight的字都可以開啟這個誰共振了這一句。那作者的話
 * 他可能就可以多看一下那一個人回覆的小紙條」): a centred dialog — never a sheet, never a popover — titled
 * 對這一段有共鳴的人, the sentence once in 「」, then only that sentence's people, read with `?passage=`, each a face, the pen
 * name and their note's first line (never the quote again under a name), leading where the author's list leads; 顯示更多
 * for the next page; 關閉 at its foot.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class PickedPeopleTest {
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

    private val sentence = "我坐在地上，第一次覺得安靜是屬於自己的。"
    private fun author(id: String) = Author(id, id, id.take(2).uppercase(), "oklch(88% 0.08 55)", null, "7", false, null)
    private fun row(id: String, note: String? = null) = TapPerson(author(id), note?.let(::TapNote), passage = TapPassageQuote(sentence))

    private var closed = 0
    private val opened = mutableListOf<TapPerson>()

    private fun show(window: Dp, anonymous: Boolean = false, next: String? = null) = compose.setContent {
        CompositionLocalProvider(LocalWindowLayout provides WindowLayout(window)) {
            val list = remember { TapPeople { TapList(listOf(row("gus"), row("bob", note = "讀到搬家那段，好像看見自己。")), nextPageToken = next) } }
            LaunchedEffect(list) { list.first() }
            PickedPeopleDialog(list, sentence, StoryType.of(StoryScript.Cjk, LayoutClass.of(window.value)), anonymous, onDismiss = { closed++ }) { opened += it }
        }
    }

    @Test fun theSentenceOnceThenItsPeopleWithTheirNotesAndTheWayOut() {
        show(390.dp)
        compose.waitForIdle()
        compose.onNode(isDialog()).assertExists()
        compose.onAllNodes(isPopup()).assertCountEquals(0)
        compose.onNodeWithText(L10n.Card.Tap.pickedTitle).assertExists()
        // The sentence heads it, once: never again under a name.
        compose.onAllNodesWithText("「$sentence」").assertCountEquals(1)
        compose.onNodeWithTag("tap-picked", useUnmergedTree = true).assertExists()
        // Round 34 (10): no note under bob's name (it arrives as a message).
        compose.onAllNodesWithText("讀到搬家那段，好像看見自己。").assertCountEquals(0)
        // No next page: no 顯示更多.
        compose.onAllNodesWithText(L10n.Home.moreBtn).assertCountEquals(0)
        compose.onNodeWithText("bob").performClick()
        assertEquals(listOf("bob"), opened.map { it.author.handle })
        // The flow presses 關閉 by its id (maestro/flows/tap-picked.yaml).
        compose.onNodeWithTag("tap-picked-close", useUnmergedTree = true).performClick()
        assertEquals(1, closed)
    }

    @Test @Config(qualifiers = "w1280dp-h800dp")
    fun aNextPageIsAskedForWithShowMore() {
        show(1280.dp, next = "t2")
        compose.waitForIdle()
        compose.onNodeWithText(L10n.Home.moreBtn).assertExists()
        // The author's list's 480 on a tablet.
        val row = compose.onNodeWithText("gus").getBoundsInRoot()
        val width = (row.right - row.left).value
        assertTrue("a row $width wide", width > 380f && width <= 480f)
    }

    /** The title, the sentence, the first row and 關閉 as drawn, and the two gaps and the sentence's leading measured. */
    private fun measures(size: Float = 16f) {
        compose.waitForIdle()
        val title = compose.onNodeWithText(L10n.Card.Tap.pickedTitle).getBoundsInRoot()
        val quote = compose.onNodeWithTag("tap-picked", useUnmergedTree = true).getBoundsInRoot()
        val first = compose.onNode(hasClickAction() and hasText("gus")).getBoundsInRoot()
        val last = compose.onNode(hasClickAction() and hasText("bob")).getBoundsInRoot()
        val close = compose.onNodeWithTag("tap-picked-close", useUnmergedTree = true).getBoundsInRoot()
        // Title → sentence 10, sentence → rows 12 (round 29 §S12; the shell's 14 before).
        assertEquals(10f, (quote.top - title.bottom).value, 0.5f)
        assertEquals(12f, (first.top - quote.bottom).value, 0.5f)
        // The sentence's lines at [size] × 1.8 (the story's compact CJK leading), never the tablet's 1.85 — 16 on a phone,
        // the tablet's 18 (round 34).
        // (Laid out in whole pixels: within 0.75 of the lines; at 1.85 they are 1.2 or more off.)
        val height = (quote.bottom - quote.top).value
        val line = size * 1.8f
        val lines = kotlin.math.round(height / line)
        assertTrue("$height tall: not ${lines.toInt()} lines of $line", lines >= 1 && kotlin.math.abs(height - lines * line) < 0.75f)
        // Round 34: 關閉 24 over the paper's edge, its right edge on the content's (24 in); the last row clear of it, the
        // list's end keeping 24 + 44 + 18 (two rows: the footer, 18 under the last row).
        val paper = compose.onNode(this.paper, useUnmergedTree = true).getBoundsInRoot()
        assertEquals(24f, (paper.bottom - close.bottom).value, 1f)
        assertEquals((paper.right - 24.dp).value, close.right.value, 1f)
        assertTrue("the last row clear of 關閉", last.bottom <= close.top + 0.5.dp)
        assertEquals(FloatingExitRoom.value, (paper.bottom - last.bottom).value, 1.5f)
        assertEquals(FloatingExitGap.value, (close.top - last.bottom).value, 1.5f)
        // §Q2: the faces on the title's edge, 24 in; the rows' bands from the paper's edge to its edge.
        assertEquals((paper.left + 24.dp).value, title.left.value, 0.5f)
        assertEquals(paper.left.value, first.left.value, 0.5f)
        assertEquals(paper.right.value, first.right.value, 0.5f)
    }

    @Test fun onAPhoneTheTitleSentenceAndRowsStand10And12ApartTheSentenceAt1Point8() {
        show(390.dp)
        measures()
    }

    @Test @Config(qualifiers = "w1280dp-h800dp")
    fun onATabletTheSameMeasuresTheStorysCompactLeadingNotItsWide() {
        show(1280.dp)
        measures(18f)
        // A Latin story's, at every width: 1.6.
        assertEquals(1.6f, pickedSentenceLeading(StoryType.of(StoryScript.Latin, LayoutClass.Expanded)), 0f)
        assertEquals(1.6f, pickedSentenceLeading(StoryType.of(StoryScript.Latin, LayoutClass.Compact)), 0f)
        assertEquals(1.8f, pickedSentenceLeading(StoryType.of(StoryScript.Cjk, LayoutClass.Expanded)), 0f)
    }

    @Test fun aRowSaysTheNoteNeverThePickAndLeadsWhereTheAuthorsListLeads() {
        val bob = row("bob", note = "謝謝")
        // Round 34 (10): never the note — the face and the pen name only.
        assertEquals(TapRowLines.NONE, pickedRowLines(bob, anonymous = false))
        assertNull(pickedRowLines(bob, anonymous = false).quote)
        // An anonymous card: faces and names only.
        assertEquals(TapRowLines.NONE, pickedRowLines(bob, anonymous = true))
        assertEquals(tapRowRoute(bob, anonymous = false), Route.Thread("bob", uid = "bob"))
        assertEquals(Route.Author("gus"), tapRowRoute(row("gus"), anonymous = false))
    }

    @Test fun onlyThatSentencesPeopleAreAskedFor() = runBlocking {
        val server = MockWebServer()
        server.start()
        try {
            val body = """{"people":[],"nextPageToken":"t2"}"""
            repeat(2) { server.enqueue(MockResponse().setResponseCode(200).setBody(body).setHeader("Content-Type", "application/json")) }
            val list = pickedPeople(TapApi(ApiConfiguration(server.url("/").toString()) { "token" }), "rich-story", "8b3a1c4d")
            list.first()
            list.more()
            assertEquals("/api/v1/cards/rich-story/taps?passage=8b3a1c4d", server.takeRequest().path)
            val second = server.takeRequest().path.orEmpty()
            assertTrue(second, second.contains("pageToken=t2") && second.contains("passage=8b3a1c4d"))
        } finally {
            server.shutdown()
        }
    }

    // Round 32 §P3: the dialog opens at its final height

    private val paper = androidx.compose.ui.test.SemanticsMatcher.keyIsDefined(androidx.compose.ui.semantics.SemanticsProperties.PaneTitle)

    private class Shown(val list: TapPeople, val expected: List<Author>?)

    private var shown: androidx.compose.runtime.MutableState<Shown?>? = null

    /** The paper's height while the first page is on its way, and once it has answered with [people]. */
    private fun heights(people: List<TapPerson>, expected: List<Author>?): Pair<Float, Float> {
        val answer = CompletableDeferred<Unit>()
        val list = TapPeople { answer.await(); TapList(people, nextPageToken = null) }
        val state = shown
        if (state == null) {
            val made = androidx.compose.runtime.mutableStateOf<Shown?>(Shown(list, expected))
            shown = made
            compose.setContent {
                CompositionLocalProvider(LocalWindowLayout provides WindowLayout(390.dp)) {
                    made.value?.let { now ->
                        androidx.compose.runtime.key(now) {
                            LaunchedEffect(now.list) { now.list.first() }
                            PickedPeopleDialog(now.list, sentence, StoryType.of(StoryScript.Cjk, LayoutClass.Compact), false, onDismiss = {}, expected = now.expected) {}
                        }
                    }
                }
            }
        } else {
            compose.runOnIdle { state.value = null }
            compose.waitForIdle()
            compose.runOnIdle { state.value = Shown(list, expected) }
        }
        compose.waitForIdle()
        val reading = compose.onNode(paper, useUnmergedTree = true).getBoundsInRoot().let { (it.bottom - it.top).value }
        answer.complete(Unit)
        compose.waitForIdle()
        assertTrue(list.loaded)
        val read = compose.onNode(paper, useUnmergedTree = true).getBoundsInRoot().let { (it.bottom - it.top).value }
        return reading to read
    }

    @Test fun whileItsPeopleAreReadTheRowsStandAsTheyWillForOneTwoAndThree() {
        for (n in 1..3) {
            val people = listOf("gus", "bob", "ann").take(n).map { row(it) }
            val (reading, read) = heights(people, expected = people.map { it.author })
            assertEquals("$n: the first frame is the final height", read, reading, 0.5f)
        }
    }

    @Test fun theLoadingRowsAreTheKnownFacesNeverADefaultCount() {
        // Round 32's cause, round 33 §Q1 for the family: the loading state drew three 60-tall shapes whoever was coming.
        // Now there is no default: the rows read are the faces known — none known, none drawn.
        val source = File("src/main/kotlin/com/resonance/app/ui/TapFaces.kt").readText()
        assertFalse("no fixed count of shapes", source.contains("repeat(3)"))
        val (reading, read) = heights(listOf(row("gus")), expected = null)
        assertTrue("nothing drawn for no known faces ($reading < $read)", reading < read)
    }

    @Test fun thePressWaitsForTheFirstPageAShortWhileAtMost() = runBlocking {
        val answered = TapPeople { TapList(listOf(row("gus")), nextPageToken = null) }
        val job = launch { answered.first() }
        awaitFirstPage(answered)
        assertTrue("waited for the page", answered.loaded)
        job.join()
        // A page that never comes: the dialog opens after the wait, with the sentence's faces as its rows.
        val never = TapPeople { kotlinx.coroutines.awaitCancellation() }
        val hanging = launch { never.first() }
        val start = System.nanoTime()
        awaitFirstPage(never, wait = 50)
        assertTrue((System.nanoTime() - start) / 1_000_000 < 1_000)
        assertTrue(!never.loaded)
        hanging.cancel()
        assertEquals(300L, TAP_LIST_OPEN_WAIT_MS)
    }
}
