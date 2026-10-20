package com.resonance.app.ui

import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The writer's bare page talks to the editor island as native/editor/src/island.ts says: the canvas
 * address (`layout=canvas`, the UI's `locale`), what the island posts — how the story is set
 * (`script`, for the title field), where the caret is (`caret`), its height and toolbar state — a
 * type it doesn't know left alone; and the page scrolls only when the caret leaves the band above
 * the keyboard's format bar.
 */
class StoryCanvasTest {
    @Test fun theWritersPageAsksForTheCanvasInTheUisLocale() {
        assertEquals(
            "/android_asset/editor.html?embed=1&fonts=&placeholder=%E5%BE%9E%E9%82%A3%E5%80%8B%E2%8B%AF&layout=canvas&locale=zh-TW",
            StoryEditorBridge.editorQuery("從那個⋯", canvas = true, locale = "zh-TW"),
        )
        // The framed field older screens had: neither.
        assertEquals("/android_asset/editor.html?embed=1&fonts=&placeholder=Start%20here", StoryEditorBridge.editorQuery("Start here", canvas = false, locale = "en"))
    }

    @Test fun theIslandSaysHowTheStoryIsSet() {
        assertEquals(IslandMessage.Script(StoryScript.Latin, "en"), IslandMessage.parse("""{"type":"script","script":"latin","lang":"en"}"""))
        assertEquals(IslandMessage.Script(StoryScript.Cjk, null), IslandMessage.parse("""{"type":"script","script":"cjk","lang":null}"""))
        assertEquals(IslandMessage.Script(StoryScript.Cjk, "zh-TW"), IslandMessage.parse("""{"type":"script","script":"cjk","lang":"zh-TW"}"""))
    }

    @Test fun theIslandSaysWhereTheCaretIs() {
        assertEquals(IslandMessage.Caret(412f, 440f), IslandMessage.parse("""{"type":"caret","top":412,"bottom":440}"""))
        assertEquals(IslandMessage.Caret(12.5f, 40.25f), IslandMessage.parse("""{"type":"caret","top":12.5,"bottom":40.25}"""))
        // Half a caret is none.
        assertNull(IslandMessage.parse("""{"type":"caret","top":12}"""))
    }

    @Test fun theOtherMessagesReadAsBefore() {
        assertEquals(IslandMessage.Ready, IslandMessage.parse("""{"type":"ready","ms":120}"""))
        assertEquals(IslandMessage.Change("# 雨"), IslandMessage.parse("""{"type":"change","markdown":"# 雨"}"""))
        assertEquals(IslandMessage.Height(318), IslandMessage.parse("""{"type":"height","px":318.6}"""))
        assertEquals(IslandMessage.Focus(true), IslandMessage.parse("""{"type":"focus","focused":true}"""))
        val state = IslandMessage.parse("""{"type":"state","active":{"bold":true,"h2":true},"canUndo":true,"canRedo":false}""")
        assertTrue(state is IslandMessage.State)
        val active = (state as IslandMessage.State).active
        assertTrue(active.bold && active.h2 && !active.italic)
    }

    @Test fun whatTheHostDoesntKnowIsLeftAlone() {
        assertNull(IslandMessage.parse("""{"type":"selection","from":1}"""))
        assertNull(IslandMessage.parse("not json"))
        assertNull(IslandMessage.parse("""{"no":"type"}"""))
    }

    @Test fun thePageScrollsOnlyWhenTheCaretLeavesTheBandItCanSee() {
        // Inside the band (under the bar's 100, over the keyboard bar's 600): nothing.
        assertEquals(0f, caretScroll(top = 300f, bottom = 330f, bandTop = 100f, bandBottom = 600f))
        // Under the band: up by as much as it went under.
        assertEquals(40f, caretScroll(top = 610f, bottom = 640f, bandTop = 100f, bandBottom = 600f))
        // Above it (scrolled past): down to it.
        assertEquals(-20f, caretScroll(top = 80f, bottom = 110f, bandTop = 100f, bandBottom = 600f))
    }
}
