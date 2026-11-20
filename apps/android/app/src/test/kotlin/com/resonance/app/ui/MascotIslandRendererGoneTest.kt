package com.resonance.app.ui

import android.os.Looper
import android.webkit.RenderProcessGoneDetail
import androidx.compose.ui.geometry.Offset
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf

/**
 * The browser's renderer going takes the puppets with it: a tap where one stood is the card's again,
 * not swallowed by the island's last `hits`.
 */
@RunWith(RobolectricTestRunner::class)
class MascotIslandRendererGoneTest {
    private val gone = object : RenderProcessGoneDetail() {
        override fun didCrash() = false
        override fun rendererPriorityAtExit() = 0
    }

    // What the island's bridge hands the main thread (a detached view's `post` would wait for a window).
    private fun say(island: MascotIsland, json: String) {
        MascotIsland::class.java.getDeclaredMethod("heard", MascotMessage::class.java)
            .apply { isAccessible = true }
            .invoke(island, MascotMessage.parse(json)!!)
    }

    @Test
    fun aTapWhereAPuppetStoodIsNoLongerTheIslandsOnceItsRendererWent() {
        val island = MascotIsland(ApplicationProvider.getApplicationContext())
        say(island, """{"type":"hits","rects":[[10,20,40,60]]}""")
        val puppet = Offset(30f, 50f)
        assertEquals(puppet, island.hitAt(puppet))

        val view = island.webView
        val client = shadowOf(view).webViewClient
        assertTrue(client.onRenderProcessGone(view, gone))
        shadowOf(Looper.getMainLooper()).idle()

        assertTrue(island.hits.isEmpty())
        assertNull(island.hitAt(puppet))
    }
}
