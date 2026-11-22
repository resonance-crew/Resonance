package com.resonance.app.ui

import android.app.Application
import android.content.ComponentName
import androidx.activity.ComponentActivity
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.getBoundsInRoot
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
import kotlinx.coroutines.runBlocking
import okhttp3.mockwebserver.MockResponse
import okhttp3.mockwebserver.MockWebServer
import org.junit.After
import org.junit.Assert.assertEquals
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
        // The note's first line under bob's name.
        compose.onNodeWithText("讀到搬家那段，好像看見自己。").assertExists()
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

    @Test fun aRowSaysTheNoteNeverThePickAndLeadsWhereTheAuthorsListLeads() {
        val bob = row("bob", note = "謝謝")
        assertEquals(TapRowLines(excerpt = "謝謝"), pickedRowLines(bob, anonymous = false))
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
}
