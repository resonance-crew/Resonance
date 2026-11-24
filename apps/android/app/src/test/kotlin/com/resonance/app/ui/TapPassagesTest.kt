package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.assertHasClickAction
import androidx.compose.ui.test.assertIsNotSelected
import androidx.compose.ui.test.performTouchInput
import androidx.compose.ui.test.swipeUp
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.isDialog
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.unit.dp
import com.resonance.api.models.Author
import com.resonance.api.models.CardTap
import com.resonance.api.models.TapPassage
import com.resonance.design.AppFonts
import com.resonance.design.Grain
import com.resonance.design.LocalWindowLayout
import com.resonance.design.WindowLayout
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.StoryScript
import java.io.File
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.yield
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

/**
 * Round 27 §U1 and §P7 — after a reader turns 共振 on, a centred dialog offers the author's own sentences (the owner:
 * 「在点击共振之后呢，还可以出现一个可能一个 pop ups」): when it opens, what it draws, how a pick goes (after the tap's own
 * PUT, never once the tap is off), how a refusal ends, and the page's copy of the tap keeping the passages and the pick.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TapPassagesTest {
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

    private fun face(id: String) = Author(id, id, id.take(2).uppercase(), "oklch(88% 0.08 55)", null, "7", false, null)

    // Long on purpose: a sentence wraps in full, never cut.
    private val passages = listOf(
        TapPassage("14fecaaf", "清晨六點的城市還沒醒，我站在陽台上，看著對面的窗一扇一扇亮起來，像有人在替這一天慢慢點燈，而我只是剛好醒著，替它數著。"),
        TapPassage("8b3a1c4d", "原來一個人的早晨，也可以不急。"),
        TapPassage("85007cbf", "咖啡涼了也沒關係。"),
    )

    private fun tap(mine: Boolean, passage: String? = null, options: List<TapPassage>? = passages) =
        CardTap(mine = mine, faces = if (mine) listOf(face("dora")) else emptyList(), more = false, mayNote = true, passages = options, passage = passage)

    // When it opens (§U1.1, §U1.9)

    @Test fun onlyAPressThatTurnsTheTapOnOnACardOfferingTwoOpensIt() {
        val offered = TapFaces.of(tap(mine = false))
        assertTrue(passagesOpenOnPress(turnedOn = true, offered, translated = false))
        // Taking it back opens nothing.
        assertFalse(passagesOpenOnPress(turnedOn = false, offered, translated = false))
        // One passage is none; none at all (a short card: the field absent) is none.
        assertFalse(passagesOpenOnPress(true, TapFaces.of(tap(false, options = passages.take(1))), false))
        assertFalse(passagesOpenOnPress(true, TapFaces.of(tap(false, options = null)), false))
        // The story in translation on screen: the author's words are not offered.
        assertFalse(passagesOpenOnPress(true, offered, translated = true))
        // 240 after the press; at once under reduced motion. A pick closes 300 later, or at once.
        assertEquals(240L, TapPassagesTiming.openDelay(reduced = false))
        assertEquals(0L, TapPassagesTiming.openDelay(reduced = true))
        assertEquals(300L, TapPassagesTiming.closeDelay(reduced = false))
        assertEquals(0L, TapPassagesTiming.closeDelay(reduced = true))
    }

    // §P7: the tap written back to the page keeps both fields

    @Test fun thePagesTapKeepsThePassagesAndThePickThroughEveryFlip() {
        val served = TapFaces.of(tap(mine = true, passage = "8b3a1c4d"))
        assertEquals(passages, served.passages)
        assertEquals("8b3a1c4d", served.passage)
        // Round trip: what CardViewerActions hands the page (and the card cache) carries both.
        val kept = served.toCardTap(mayNote = true)
        assertEquals(passages, kept.passages)
        assertEquals("8b3a1c4d", kept.passage)
        // Taken back: the passages stay, the pick goes (the server clears it in the same write).
        val off = served.withViewer(face("dora"), on = false)
        assertEquals(passages, off.passages)
        assertNull(off.passage)
        assertNull(off.toCardTap(true).passage)
        // On again: still offered — the dialog opens again (M1) — and starts with no pick.
        val again = off.withViewer(face("dora"), on = true)
        assertTrue(again.offersPassages)
        assertNull(again.passage)
        assertTrue(passagesOpenOnPress(true, TapFaces.of(again.toCardTap(true)), false))
        // A short card answers as round 26: the fields absent, not [] or null.
        assertNull(TapFaces.of(tap(true, options = null)).toCardTap(true).passages)
        // A pick that is not one of the options now is none.
        assertNull(TapFaces.of(tap(true, passage = "gone")).passage)
    }

    @Test fun aRowPressedPicksItAndPressedAgainClearsIt() {
        assertEquals("14fecaaf", nextPick(null, "14fecaaf"))
        assertEquals("85007cbf", nextPick("14fecaaf", "85007cbf"))
        assertNull(nextPick("14fecaaf", "14fecaaf"))
    }

    // §U1.5–6: the pick's request

    private class Sent {
        val asked = mutableListOf<String?>()
        val picked = mutableListOf<String?>()
        var stale = 0
        var failed = 0
    }

    private fun CoroutineScope.picker(
        sent: Sent,
        on: () -> Boolean,
        held: () -> String? = { null },
        answer: suspend (String?) -> String?,
    ) = PassagePick(
        launch = { work -> launch(block = work) },
        send = { id -> sent.asked += id; answer(id) },
        tapOn = on,
        held = held,
        onPicked = { sent.picked += it },
        onStale = { sent.stale++ },
        onFailed = { sent.failed++ },
    )

    @Test fun thePickGoesOnlyAfterTheTapsOwnPutHasAnswered() = runBlocking {
        val sent = Sent()
        val tapAnswered = CompletableDeferred<Unit>()
        val tapJob: Job = launch(Dispatchers.Unconfined) { tapAnswered.await() }
        val job = picker(sent, on = { true }) { it }.pick("8b3a1c4d", after = tapJob)
        repeat(5) { yield() }
        assertTrue("nothing sent before the tap answered", sent.asked.isEmpty())
        tapAnswered.complete(Unit)
        job.join()
        assertEquals(listOf<String?>("8b3a1c4d"), sent.asked)
        assertEquals(listOf<String?>("8b3a1c4d"), sent.picked)
        assertEquals(0, sent.failed + sent.stale)
    }

    @Test fun aTapThatWentByThenSendsNoPick() = runBlocking {
        val sent = Sent()
        picker(sent, on = { false }) { it }.pick("8b3a1c4d").join()
        assertTrue(sent.asked.isEmpty())
        assertTrue(sent.picked.isEmpty())
    }

    @Test fun a400Or409ClosesQuietlyAndReadsTheCardAgainAnythingElseSaysSo() = runBlocking {
        for (status in listOf(400, 409)) {
            val sent = Sent()
            picker(sent, on = { true }) { throw ApiFailure("conflict", "no", status) }.pick("8b3a1c4d").join()
            assertEquals("$status reads the card again", 1, sent.stale)
            assertEquals("$status: no toast", 0, sent.failed)
            assertEquals(listOf<String?>(null), sent.picked)
        }
        val sent = Sent()
        picker(sent, on = { true }) { throw ApiFailure("unexpected", "down", 500) }.pick("8b3a1c4d").join()
        assertEquals(1, sent.failed)
        assertEquals(0, sent.stale)
        // The tap stays on (nothing here touches it), with no passage.
        assertEquals(listOf<String?>(null), sent.picked)
        assertEquals(PickFailure.Failed, pickFailure(IllegalStateException("offline")))
    }

    @Test fun aChangeThatFailsPutsBackThePickTheServerStillHolds() = runBlocking {
        // Picked A before; reopened from the own row, B pressed; the PUT fails: A stays, as on the web and iOS.
        for (failure in listOf<Exception>(ApiFailure("unexpected", "down", 500), IllegalStateException("offline"))) {
            val sent = Sent()
            picker(sent, on = { true }, held = { "14fecaaf" }) { throw failure }.pick("8b3a1c4d").join()
            assertEquals(listOf<String?>("8b3a1c4d"), sent.asked)
            assertEquals(listOf<String?>("14fecaaf"), sent.picked)
            assertEquals(1, sent.failed)
        }
        // A 409 still ends with none: the options or the tap changed, and the card is read again.
        val sent = Sent()
        picker(sent, on = { true }, held = { "14fecaaf" }) { throw ApiFailure("conflict", "no", 409) }.pick("8b3a1c4d").join()
        assertEquals(listOf<String?>(null), sent.picked)
        assertEquals(1, sent.stale)
    }

    // §U1.3–8: the dialog

    private var picks = mutableListOf<String?>()
    private var closed = 0

    private fun show(picked: String? = null, hold: Boolean = false) = compose.setContent {
        CompositionLocalProvider(LocalWindowLayout provides WindowLayout(390.dp)) {
            var open by mutableStateOf(true)
            if (open) TapPassages(
                passages, picked, StoryScript.Cjk, reducedMotion = true, hold = hold,
                onPick = { picks += it },
                onDismiss = { closed++; open = false },
            )
        }
    }

    @Test fun aCentredDialogTitledWithEveryPassageInFullAndSkipAtItsFoot() {
        show()
        compose.waitForIdle()
        compose.onNode(isDialog()).assertExists()
        compose.onNodeWithTag("tap-passages", useUnmergedTree = true).assertExists()
        compose.onNodeWithText(L10n.Card.Tap.passageTitle).assertExists()
        // Each row its sentence, whole (never 「…」), tagged for the flows, none picked yet.
        passages.forEachIndexed { i, p ->
            compose.onNodeWithText(p.text).assertExists()
            compose.onNodeWithTag("tap-passage-$i", useUnmergedTree = true).assertIsNotSelected()
        }
        val long = compose.onNodeWithText(passages[0].text).getBoundsInRoot()
        val short = compose.onNodeWithText(passages[2].text).getBoundsInRoot()
        assertTrue("the long sentence wraps onto more lines", (long.bottom - long.top) > (short.bottom - short.top) * 1.5f)
        // A phone's 400 at most: the row inside the card's padding.
        val row = compose.onNodeWithTag("tap-passage-0", useUnmergedTree = true).getBoundsInRoot()
        assertTrue((row.right - row.left).value <= 400f)
        // 略過 closes, with no pick.
        compose.onNodeWithTag("tap-passage-skip", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        assertEquals(1, closed)
        assertTrue(picks.isEmpty())
    }

    @Test fun eachRowsBandRunsFromThePapersLeftEdgeToItsRightTheWordsWhereTheyWere() {
        // The owner, 2026-11-21: the chosen band reaches the dialog card's left and right edges, as the web's.
        assertFalse("never the tablet's rounded cut", PassageBand.cut)
        // Round 33 §Q2: the words the family's 24 in (28 + 12 before), on the title's edge.
        assertEquals(24f, PassageBand.wordsInset.value)
        show(picked = "8b3a1c4d")
        compose.waitForIdle()
        val paper = compose.onNode(SemanticsMatcher.keyIsDefined(SemanticsProperties.PaneTitle), useUnmergedTree = true).getBoundsInRoot()
        for (i in passages.indices) {
            val row = compose.onNodeWithTag("tap-passage-$i", useUnmergedTree = true).getBoundsInRoot()
            assertEquals(paper.left.value, row.left.value, 0.5f)
            assertEquals(paper.right.value, row.right.value, 0.5f)
        }
        // The words 24 from the paper's edge, and the title on the same edge (round 33 §Q2).
        // (Their left by position: a clipped bounds box reads zero for text under a merged button.)
        val words = compose.onNodeWithText(passages[2].text, useUnmergedTree = true).fetchSemanticsNode().positionInRoot.x / compose.density.density
        assertEquals(paper.left.value + 24f, words, 0.5f)
        val title = compose.onNodeWithText(L10n.Card.Tap.passageTitle, useUnmergedTree = true).fetchSemanticsNode().positionInRoot.x / compose.density.density
        assertEquals(paper.left.value + 24f, title, 0.5f)
        compose.onNodeWithTag("tap-passage-1", useUnmergedTree = true).assertIsSelected()
    }

    @Test fun aRowPressedIsPickedThenTheDialogCloses() {
        show()
        compose.onNodeWithTag("tap-passage-1", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        assertEquals(listOf<String?>("8b3a1c4d"), picks)
        assertEquals(1, closed)
    }

    @Test fun reopenedWithAPickItRestsSelectedAndPressedAgainClears() {
        show(picked = "8b3a1c4d")
        compose.waitForIdle()
        compose.onNodeWithTag("tap-passage-1", useUnmergedTree = true).assertIsSelected()
        compose.onNodeWithTag("tap-passage-0", useUnmergedTree = true).assertIsNotSelected()
        compose.onNodeWithTag("tap-passage-1", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        assertEquals(listOf<String?>(null), picks)
    }

    @Test fun opensFromThePressThatTurnedItOnMarkingNoneEvenWhileThePageStillHoldsTheOldPick() {
        // Off sent with A picked, on again before the off PUT answered: the page's copy still says A.
        val current = TapFaces.of(tap(mine = true, passage = "14fecaaf")).passage
        assertEquals("14fecaaf", current)
        assertNull(passagesMarked(shown = null, current = current, fromPress = true))
        // From the reader's own row the current pick is marked (§U3); a row just pressed wins either way.
        assertEquals("14fecaaf", passagesMarked(null, current, fromPress = false))
        assertEquals("8b3a1c4d", passagesMarked("8b3a1c4d", current, fromPress = true))
        // So pressing A picks A (not none, as it would with A marked).
        show(picked = passagesMarked(null, current, fromPress = true))
        compose.waitForIdle()
        passages.indices.forEach { compose.onNodeWithTag("tap-passage-$it", useUnmergedTree = true).assertIsNotSelected() }
        compose.onNodeWithTag("tap-passage-0", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        assertEquals(listOf<String?>("14fecaaf"), picks)
    }

    @Test fun theScreenshotsPickedStateHoldsTheDialogOpenOnTheRow() {
        show(hold = true)
        compose.onNodeWithTag("tap-passage-1", useUnmergedTree = true).performClick()
        compose.waitForIdle()
        assertEquals(0, closed)
        compose.onNodeWithTag("tap-passage-1", useUnmergedTree = true).assertIsSelected()
        // Launch words reach the end row.
        assertEquals(
            setOf(com.resonance.app.DebugLaunch.CardEnd.Passages, com.resonance.app.DebugLaunch.CardEnd.PassagePicked),
            com.resonance.app.DebugLaunch.cardEndOf("passages,passage-picked"),
        )
    }

    @Test @Config(qualifiers = "w320dp-h568dp")
    fun threeHundredCharacterPassagesOnTheSmallestPhoneWrapWholeInsideTheirScroll() {
        // Wave 2 #3a: 2–3 whole sentences, about 100 characters each.
        val long = List(3) { i ->
            TapPassage("p$i", "清晨六點的城市還沒醒，我站在陽台上，看著對面的窗一扇一扇亮起來，像有人在替這一天慢慢點燈。".repeat(2).take(100) + "。$i")
        }
        compose.setContent {
            CompositionLocalProvider(LocalWindowLayout provides WindowLayout(320.dp)) {
                TapPassages(long, null, StoryScript.Cjk, reducedMotion = true, onPick = {}, onDismiss = {})
            }
        }
        compose.waitForIdle()
        val list = compose.onNodeWithTag("tap-passages", useUnmergedTree = true).getBoundsInRoot()
        // The list stops at 70 % of the window and scrolls inside; nothing runs past the window's sides.
        assertTrue((list.bottom - list.top).value <= 568f * 0.7f + 0.5f)
        assertTrue(list.left.value >= -0.5f && list.right.value <= 320f + 0.5f)
        // Each sentence in full (never 「…」), on several lines, within its row.
        long.forEachIndexed { i, p ->
            val node = compose.onNodeWithText(p.text, useUnmergedTree = true).fetchSemanticsNode()
            val results = mutableListOf<androidx.compose.ui.text.TextLayoutResult>()
            node.config[androidx.compose.ui.semantics.SemanticsActions.GetTextLayoutResult].action?.invoke(results)
            val layout = results.single()
            assertFalse("passage $i is cut", layout.hasVisualOverflow)
            assertTrue("passage $i wraps", layout.lineCount >= 3)
        }
    }

    @Test fun theListScrollsInsideAtMostFiveHundredSixtyOrSeventyPercentOfTheWindow() {
        // Wave 2 #3a: three passages of about 100 characters each — the web's min(560, 70 %).
        assertEquals(560f, passagesListMax(900.dp).value)
        assertEquals(420f, passagesListMax(600.dp).value, 0.01f)
    }

    // Round 32 §P1–§P2: one scroll region (the title and the rows), rules between the rows; round 33 §Q3: 略過 floats
    // over the region's foot, the family's tonal pill

    private val paperMatcher = SemanticsMatcher.keyIsDefined(SemanticsProperties.PaneTitle)

    @Test fun theTitleScrollsWithTheRowsAndSkipFloatsOverTheRegionsFoot() {
        show()
        compose.waitForIdle()
        val region = compose.onNodeWithTag("tap-passages", useUnmergedTree = true).getBoundsInRoot()
        val title = compose.onNodeWithText(L10n.Card.Tap.passageTitle, useUnmergedTree = true).getBoundsInRoot()
        val skip = compose.onNodeWithTag("tap-passage-skip", useUnmergedTree = true).getBoundsInRoot()
        val first = compose.onNodeWithTag("tap-passage-0", useUnmergedTree = true).getBoundsInRoot()
        val last = compose.onNodeWithTag("tap-passage-2", useUnmergedTree = true).getBoundsInRoot()
        // The title is the region's first child: 10 over the first row, inside the region.
        assertTrue("the title inside the scroll region", title.top >= region.top - 0.5.dp && title.bottom <= region.bottom)
        assertEquals(10f, (first.top - title.bottom).value, 0.5f)
        // Round 33 §Q3, round 34: the region reaches the paper's foot and 略過 stands in its end's room — its right edge on
        // the content's (the paper's less 24), 24 over the paper's edge; the list's end keeps 24 + 44 + 18 so the last row
        // clears it; short content: the dialog as tall as the rows and that room (TapListFootTest: the two states).
        val paper = compose.onNode(paperMatcher, useUnmergedTree = true).getBoundsInRoot()
        assertEquals("the region down to the paper's foot", paper.bottom.value, region.bottom.value, 1f)
        assertTrue("略過 over the region", skip.top >= region.top && skip.bottom <= region.bottom + 0.5.dp)
        assertEquals("略過's right edge on the content's", (paper.right - 24.dp).value, skip.right.value, 1f)
        assertEquals(24f, (paper.bottom - skip.bottom).value, 1f)
        assertTrue("a finger's 44 at least", (skip.bottom - skip.top).value >= 44f - 0.5f)
        // Scrolled to the end, the last row stands clear of it: the list's end keeps 24 + 44 + 18.
        repeat(3) { compose.onNodeWithTag("tap-passages", useUnmergedTree = true).performTouchInput { swipeUp() } }
        compose.waitForIdle()
        val end = compose.onNodeWithTag("tap-passage-2", useUnmergedTree = true).getBoundsInRoot()
        val skipThen = compose.onNodeWithTag("tap-passage-skip", useUnmergedTree = true).getBoundsInRoot()
        assertEquals("略過 never moved", skip.top.value, skipThen.top.value, 0.5f)
        assertTrue("the last row (${end.bottom}) clear of 略過 (${skip.top})", end.bottom <= skip.top + 0.5.dp)
        assertEquals(FloatingExitRoom.value, (region.bottom - end.bottom).value, 1f)
    }

    @Test fun skipIsTheFamilysFloatingTonalPill() {
        // Round 33 §Q3 (the owner: 用有颜色的浮动按钮): 略過 is the family's floating exit — the tonal small pill, as 關閉 —
        // never round 32's quiet words, never a footer of its own.
        val source = File("src/main/kotlin/com/resonance/app/ui/TapPassages.kt").readText()
        assertTrue(source.contains("TapListModal("))
        assertFalse("no quiet 略過 any more", source.contains("QuietButton("))
        assertFalse("no footer pill of its own", source.contains("ModalCloseButton("))
        val shell = File("src/main/kotlin/com/resonance/app/ui/TapListModal.kt").readText()
        assertTrue(shell.contains("variant = ButtonVariant.Tonal, small = true"))
        show()
        compose.waitForIdle()
        compose.onNodeWithTag("tap-passage-skip", useUnmergedTree = true).assertHasClickAction()
        compose.onNodeWithText(L10n.Card.Tap.passageSkip, useUnmergedTree = true).assertExists()
    }

    @Test @Config(qualifiers = "w320dp-h568dp")
    fun longPassagesScrollInsideTheRegionTheDialogFitsTheWindowAndSkipNeverMoves() {
        val long = List(3) { i ->
            TapPassage("p$i", "清晨六點的城市還沒醒，我站在陽台上，看著對面的窗一扇一扇亮起來，像有人在替這一天慢慢點燈。".repeat(3).take(140) + "。$i")
        }
        compose.setContent {
            CompositionLocalProvider(LocalWindowLayout provides WindowLayout(320.dp)) {
                TapPassages(long, null, StoryScript.Cjk, reducedMotion = true, onPick = {}, onDismiss = {})
            }
        }
        compose.waitForIdle()
        val paper = compose.onNode(paperMatcher, useUnmergedTree = true).getBoundsInRoot()
        // The whole card in the window: nothing for the backdrop to scroll.
        assertTrue("the paper ${paper.top}–${paper.bottom} inside 568", paper.top.value >= 0f && paper.bottom.value <= 568f + 0.5f)
        val skipBefore = compose.onNodeWithTag("tap-passage-skip", useUnmergedTree = true).getBoundsInRoot()
        val titleBefore = compose.onNodeWithText(L10n.Card.Tap.passageTitle, useUnmergedTree = true).fetchSemanticsNode().positionInRoot.y
        assertTrue("略過 inside the paper", skipBefore.bottom <= paper.bottom)
        compose.onNodeWithTag("tap-passages", useUnmergedTree = true).performTouchInput { swipeUp() }
        compose.waitForIdle()
        val skipAfter = compose.onNodeWithTag("tap-passage-skip", useUnmergedTree = true).getBoundsInRoot()
        val titleAfter = compose.onNodeWithText(L10n.Card.Tap.passageTitle, useUnmergedTree = true).fetchSemanticsNode().positionInRoot.y
        // The title went with the rows; 略過 stayed where it was.
        assertTrue("the title scrolled away ($titleBefore → $titleAfter)", titleAfter < titleBefore - 10f)
        assertEquals(skipBefore.top.value, skipAfter.top.value, 0.5f)
        assertEquals(paper, compose.onNode(paperMatcher, useUnmergedTree = true).getBoundsInRoot())
    }

    @Test fun aRuleStandsBetweenTwoRowsNeverAboveTheFirstFromTheWordsStartToTheirEnd() {
        assertFalse(passageRuleAbove(0))
        assertTrue(passageRuleAbove(1))
        assertTrue(passageRuleAbove(2))
        // From the paper's edge to the words: the rule's inset is the words', not the paper's edges (24 since round 33).
        assertEquals(24f, PassageBand.wordsInset.value)
        // The house hairline and the Divider's ink: the source names no width or colour of its own.
        val source = File("src/main/kotlin/com/resonance/app/ui/TapPassages.kt").readText()
        assertTrue(source.contains("wavyRuleAbove(PassageBand.wordsInset, rule"))
        assertTrue(source.contains("val rule = DividerInk"))
    }
}
