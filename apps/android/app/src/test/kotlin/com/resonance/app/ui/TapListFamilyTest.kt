package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.semantics.SemanticsProperties
import androidx.compose.ui.test.SemanticsMatcher
import androidx.compose.ui.test.getBoundsInRoot
import androidx.compose.ui.test.hasText
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithText
import androidx.compose.ui.test.onNodeWithText
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
import kotlinx.coroutines.delay
import org.junit.After
import org.junit.Assert.assertEquals
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
 * Round 33 §Q1 (the owner: 「谁共振了」弹窗仍有高度闪动 … 同家族一并排查): who resonated — a reader's list and the author's —
 * opens as who picked a sentence has since round 32: a press waits up to [TAP_LIST_OPEN_WAIT_MS] for the first page, then
 * the dialog opens complete, so its first frame is its settled height for one, two and three people — their quotes and
 * notes too. A page slower than that: as many rows as the faces known, never a default.
 */
@RunWith(RobolectricTestRunner::class)
@Config(application = Application::class, qualifiers = "w390dp-h844dp-mdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class TapListFamilyTest {
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

    /** Rows taller than a bare one: a quote and a note under the name (what the old loading shapes never were). */
    private fun person(id: String) = TapPerson(author(id), TapNote("讀到搬家那段，好像看見自己。"), passage = TapPassageQuote("清晨六點的城市還沒醒"))

    private val paper = SemanticsMatcher.keyIsDefined(SemanticsProperties.PaneTitle)

    private fun paperHeight(): Float? =
        runCatching { compose.onNode(paper, useUnmergedTree = true).getBoundsInRoot() }.getOrNull()?.let { (it.bottom - it.top).value }

    private enum class Kind { Reader, Author }

    @Composable
    private fun Opened(kind: Kind, list: TapPeople, faces: List<Author>) {
        // As ReaderTapList and AuthorTapList open: once the first page answered, or after the family's wait.
        if (!rememberFirstPageReady(list)) return
        when (kind) {
            Kind.Reader -> ReaderTapDialog(list, onDismiss = {}, lines = { TapRowLines(quote = it.passage?.text) }, expected = faces) {}
            Kind.Author -> AuthorTapDialog(list, anonymous = false, onDismiss = {}, expected = faces) {}
        }
    }

    /** [ms] of frames, one at a time (a dialog's window comes up between them). */
    private fun frames(ms: Long) {
        var t = 0L
        while (t < ms) {
            compose.mainClock.advanceTimeByFrame()
            t += 16
        }
    }

    private class Case(val kind: Kind, val list: TapPeople, val faces: List<Author>)

    private var case: androidx.compose.runtime.MutableState<Case?>? = null

    /** Shows [next] from its first frame: the content set once, a case swapped in (and the last one gone) after. */
    private fun open(next: Case) {
        compose.mainClock.autoAdvance = false
        val state = case
        if (state == null) {
            val made = androidx.compose.runtime.mutableStateOf<Case?>(next)
            case = made
            compose.setContent {
                CompositionLocalProvider(LocalWindowLayout provides WindowLayout(390.dp)) {
                    made.value?.let { now -> androidx.compose.runtime.key(now) { Opened(now.kind, now.list, now.faces) } }
                }
            }
        } else {
            compose.mainClock.autoAdvance = true
            compose.runOnIdle { state.value = null }
            compose.waitForIdle()
            assertEquals("the last case's dialog gone", null, paperHeight())
            compose.mainClock.autoAdvance = false
            compose.runOnIdle { state.value = next }
        }
    }

    /** Every height the paper takes from the press until [until] ms, a frame at a time, the page answering after [answerMs]. */
    private fun heightsSeen(kind: Kind, n: Int, answerMs: Long, until: Long): List<Float> {
        val people = listOf("gus", "bob", "ann").take(n).map(::person)
        val list = TapPeople { delay(answerMs); TapList(people, nextPageToken = null) }
        open(Case(kind, list, people.map { it.author }))
        val seen = mutableListOf<Float>()
        var t = 0L
        while (t < until) {
            compose.mainClock.advanceTimeByFrame()
            t += 16
            paperHeight()?.let { if (seen.lastOrNull() != it) seen += it }
        }
        return seen
    }

    @Test fun withinTheWaitTheReadersListOpensAtItsSettledHeightForOneTwoAndThree() {
        for (n in 1..3) {
            val seen = heightsSeen(Kind.Reader, n, answerMs = 120, until = 900)
            assertEquals("reader, $n: one height from its first frame ($seen)", 1, seen.size)
            compose.onAllNodesWithText(L10n.Card.Tap.passageQuote("清晨六點的城市還沒醒"), useUnmergedTree = true).fetchSemanticsNodes().size.let {
                assertEquals(n, it)
            }
        }
    }

    @Test fun withinTheWaitTheAuthorsListOpensAtItsSettledHeightForOneTwoAndThree() {
        for (n in 1..3) {
            val seen = heightsSeen(Kind.Author, n, answerMs = 120, until = 900)
            assertEquals("author, $n: one height from its first frame ($seen)", 1, seen.size)
            // Round 34 (10): the quote, never the note.
            assertEquals(n, compose.onAllNodesWithText(L10n.Card.Tap.passageQuote("清晨六點的城市還沒醒"), useUnmergedTree = true).fetchSemanticsNodes().size)
            assertEquals(0, compose.onAllNodesWithText("讀到搬家那段，好像看見自己。", useUnmergedTree = true).fetchSemanticsNodes().size)
        }
    }

    @Test fun nothingIsDrawnBeforeThePageOrTheWait() {
        val people = listOf(person("gus"))
        val list = TapPeople { delay(10_000); TapList(people, nextPageToken = null) }
        open(Case(Kind.Reader, list, people.map { it.author }))
        compose.mainClock.advanceTimeBy(TAP_LIST_OPEN_WAIT_MS - 50)
        assertEquals(null, paperHeight())
        compose.mainClock.advanceTimeBy(100)
        assertTrue("open after the wait", paperHeight() != null)
        assertEquals(300L, TAP_LIST_OPEN_WAIT_MS)
        // The reader's and the author's lists open as this harness does (who picked, since round 32, too); their callers
        // hand them the faces they know.
        val faces = File("src/main/kotlin/com/resonance/app/ui/TapFaces.kt").readText()
        assertEquals(2, Regex("""if \(!rememberFirstPageReady\(list\)\) return""").findAll(faces).count())
        assertTrue(faces.contains("expected = faces.shown"))
        assertTrue(File("src/main/kotlin/com/resonance/app/ui/PickedPeople.kt").readText().contains("rememberFirstPageReady(list)"))
        assertTrue(File("src/main/kotlin/com/resonance/app/ui/CardViewerActions.kt").readText().contains("expected = faces.shown"))
    }

    /** A page slower than the wait, for [n] known faces: the rows drawn meanwhile are those n, as tall as their rows read. */
    private fun slower(n: Int) {
        val faces = listOf("gus", "bob", "ann").take(n).map(::author)
        // A page that hasn't come by the wait: the dialog with the known faces' rows…
        val gate = kotlinx.coroutines.CompletableDeferred<Unit>()
        val list = TapPeople { gate.await(); TapList(faces.map { TapPerson(it, null) }, nextPageToken = null) }
        open(Case(Kind.Reader, list, faces))
        frames(TAP_LIST_OPEN_WAIT_MS + 100)
        assertTrue(!list.loaded)
        val reading = paperHeight()
        // …and when those n people come, bare rows, the same height: n rows, not a default three.
        gate.complete(Unit)
        frames(200)
        assertTrue(list.loaded)
        val read = paperHeight()
        assertTrue("$n: drawn ($reading, $read)", reading != null && read != null)
        assertEquals("$n faces known: $n rows", read!!, reading!!, 0.5f)
    }

    @Test fun slowerThanTheWaitOneKnownFaceIsOneRow() = slower(1)

    @Test fun slowerThanTheWaitTwoKnownFacesAreTwoRows() = slower(2)

    @Test fun slowerThanTheWaitThreeKnownFacesAreThreeRows() = slower(3)

    // Round 34 (8) (the owner: 名单先出头像和名字，约 1 秒后每行的句子才出现): the page's round trip was longer than the
    // 300 ms wait, so the press opened the faces alone and the quotes came after. The reader's list is read while the
    // faces stand: a press after it answered opens complete.

    @Test fun aListReadAheadOpensWithEveryQuoteOnItsFirstFrame() {
        val people = listOf("gus", "bob", "ann").map(::person)
        var reads = 0
        val list = TapPeople { reads++; delay(1_000); TapList(people, nextPageToken = null) }
        val opened = androidx.compose.runtime.mutableStateOf(false)
        compose.mainClock.autoAdvance = false
        compose.setContent {
            CompositionLocalProvider(LocalWindowLayout provides WindowLayout(390.dp)) {
                // As CardViewerActions: read while the faces stand…
                androidx.compose.runtime.LaunchedEffect(list) { prefetchFirstPage(list) }
                // …and opened by a press later.
                if (opened.value) Opened(Kind.Reader, list, people.map { it.author })
            }
        }
        frames(1_200)
        assertTrue(list.loaded)
        compose.runOnIdle { opened.value = true }
        var firstQuotes = -1
        val seen = mutableListOf<Float>()
        repeat(40) {
            compose.mainClock.advanceTimeByFrame()
            paperHeight()?.let { h ->
                if (firstQuotes < 0) firstQuotes = compose.onAllNodesWithText(L10n.Card.Tap.passageQuote("清晨六點的城市還沒醒"), useUnmergedTree = true).fetchSemanticsNodes().size
                if (seen.lastOrNull() != h) seen += h
            }
        }
        assertEquals("every row's quote on the dialog's first frame", 3, firstQuotes)
        assertEquals("one height ($seen)", 1, seen.size)
        assertEquals("read once, ahead — not again at the press", 1, reads)
        // The page reads it ahead and hands it to the dialog.
        val page = File("src/main/kotlin/com/resonance/app/ui/CardViewerActions.kt").readText()
        assertTrue(page.contains("prefetchFirstPage(readerList)"))
        assertTrue(page.contains("list = readerList"))
    }
}
