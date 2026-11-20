package com.resonance.app.ui

import android.os.Looper
import android.webkit.RenderProcessGoneDetail
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotSame
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/**
 * A3: the browser's renderer going (the system taking it back while the photo picker is up) no longer
 * takes the app with it — the writer's client says it handled the loss, a new island takes the dead
 * one's place, and it opens with what the old one held: the title, the story as its last `change`
 * said it, the link previews.
 */
@RunWith(RobolectricTestRunner::class)
class StoryEditorRendererGoneTest {
    private val gone = object : RenderProcessGoneDetail() {
        override fun didCrash() = false
        override fun rendererPriorityAtExit() = 0
    }

    private fun bridge() = StoryEditorBridge(ApplicationProvider.getApplicationContext(), "從那個⋯", canvas = true, locale = "zh-TW")

    @Test
    fun aNewIslandOpensWithWhatTheDeadOneHeld() {
        val bridge = bridge()
        val preview = HostLinkPreview("https://example.com/a", "A page", "https://resonance.channel/api/link-image?u=1")
        bridge.setTitle("一個標題")
        bridge.setMarkdown("第一段")
        bridge.setLinkPreviews(listOf(preview))
        bridge.handle(IslandMessage.Ready)
        assertTrue(bridge.ready)
        // Typed into since it opened: the island's own `change` is what it holds now.
        bridge.handle(IslandMessage.Change("第一段\n\n第二段"))

        val dead = bridge.webView
        val client = shadowOf(dead).webViewClient
        assertTrue("the loss is handled, so the app lives on", client.onRenderProcessGone(dead, gone))
        shadowOf(Looper.getMainLooper()).idle()

        val fresh = bridge.webView
        assertNotSame(dead, fresh)
        assertFalse(bridge.ready)

        bridge.handle(IslandMessage.Ready)
        val opened = shadowOf(fresh).lastEvaluatedJavascript.orEmpty()
        assertTrue(opened, opened.contains("E.open(o)"))
        assertTrue(opened, opened.contains("第一段\\n\\n第二段"))
        assertTrue(opened, opened.contains("一個標題"))
        assertTrue(opened, opened.contains("https://example.com/a"))
    }

    @Test
    fun aGoneViewThatIsNoLongerTheIslandIsLeftAlone() {
        val bridge = bridge()
        val first = bridge.webView
        val client = shadowOf(first).webViewClient
        client.onRenderProcessGone(first, gone)
        shadowOf(Looper.getMainLooper()).idle()
        val second = bridge.webView
        // A second report for the view already replaced changes nothing.
        client.onRenderProcessGone(first, gone)
        shadowOf(Looper.getMainLooper()).idle()
        assertEquals(second, bridge.webView)
    }

    @Test
    fun theOpeningScriptSaysOnlyWhatIsHeld() {
        assertNull(IslandContent().openScript())
        val script = IslandContent(markdown = "words").openScript()!!
        assertTrue(script.contains("\"markdown\":\"words\""))
        assertFalse(script.contains("\"title\""))
        assertFalse(script.contains("\"previews\""))
    }

    @Test
    fun storedPreviewsKeepOnlyOurOwnPictures() {
        val raw = listOf(
            mapOf("url" to "https://a.example/x", "title" to "A", "image" to "/api/link-image?u=x"),
            mapOf("url" to "https://b.example/y", "title" to "B", "image" to "https://tracker.example/p.png"),
            mapOf("url" to "", "title" to "C"),
            mapOf("url" to "https://d.example", "title" to " "),
        )
        val previews = IslandContent.linkPreviews(raw, "https://resonance.channel/")
        assertEquals(
            listOf(
                HostLinkPreview("https://a.example/x", "A", "https://resonance.channel/api/link-image?u=x"),
                HostLinkPreview("https://b.example/y", "B", null),
            ),
            previews,
        )
    }
}
