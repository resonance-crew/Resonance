package com.resonance.app.ui

import com.resonance.design.PaletteFormula
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.ResonanceColors
import com.resonance.kit.story.StoryScript
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The writer's bare page talks to the editor island as native/editor/src/island.ts says: the canvas
 * address (`layout=canvas`, the UI's `locale`), what the island posts — how the story is set
 * (`script`, for the title field), where the caret is (`caret`), its height and toolbar state — a
 * type it doesn't know left alone; the page scrolls only when the caret leaves the band above
 * the keyboard's format bar; and the story tells the page its caret's line as its focused area, so
 * a page shrinking under the keyboard keeps that line in view, not the story's top or foot (round 8 §6.4).
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

    @Test fun theIslandIsToldItsSchemeAndThemeNeverLeftToGuess() {
        // Light terracotta: the scheme said all the same, no theme attribute, no colours of the host's.
        val light = StoryEditorBridge.islandAppearance(ResonanceColors.LightTerracotta)
        assertTrue(light, "h.setAttribute('data-scheme','light')" in light)
        assertTrue(light, "h.removeAttribute('data-accent')" in light)
        assertTrue(light, "v={}" in light)
        // A theme in dark: the island's own stylesheet knows it by name.
        val sage = StoryEditorBridge.islandAppearance(ResonanceColors.of(PaletteTheme.Sage, dark = true))
        assertTrue(sage, "h.setAttribute('data-scheme','dark')" in sage)
        assertTrue(sage, "h.setAttribute('data-accent','sage')" in sage)
        // The wallpaper's: no name the stylesheet knows, so every token goes on <html> in sRGB.
        val wallpaper = StoryEditorBridge.islandAppearance(PaletteFormula.wallpaperPalette(250.0, 0.11, dark = true))
        assertTrue(wallpaper, "h.removeAttribute('data-accent')" in wallpaper)
        for (token in ResonanceColors.TOKENS) assertTrue(token, "\"--$token\":\"rgb(" in wallpaper)
        // Each time, what the host set before is taken off first.
        assertTrue(wallpaper, "removeProperty" in wallpaper)
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

    @Test fun theStorysFocusedAreaIsItsCaretsLineWithTheBarsKeptClear() {
        // The caret's line, with what the bars cover above (the bar) and below (the format bar) kept clear of it.
        assertEquals(300..470, focusedSpan(line = 400..430, touchY = 120, above = 100, below = 40, touchHalf = 20))
        // Until the island says where the caret is: the line the finger came down on.
        assertEquals(0..160, focusedSpan(line = null, touchY = 120, above = 100, below = 20, touchHalf = 20))
        // Neither: an empty line at the story's top, which a page shrinking under the keyboard never scrolls for.
        assertEquals(0..0, focusedSpan(line = null, touchY = null, above = 100, below = 40, touchHalf = 20))
    }

    @Test fun aRequestToShowTheWholeStoryShowsItsCaretsLineInstead() {
        // A view taking the focus, the browser's editable taking it: (nearly) the whole 2000 px story — the caret's line instead.
        assertEquals(300..470, requestedSpan(top = 0, bottom = 2000, height = 2000, line = 400..430, touchY = 120, above = 100, below = 40, touchHalf = 20))
        assertEquals(300..470, requestedSpan(top = 100, bottom = 1900, height = 2000, line = 400..430, touchY = null, above = 100, below = 40, touchHalf = 20))
        // Before the island says where the caret is: the line the finger came down on.
        assertEquals(0..160, requestedSpan(top = 0, bottom = 2000, height = 2000, line = null, touchY = 120, above = 100, below = 20, touchHalf = 20))
        // Neither: nothing to scroll to, so the request is dropped.
        assertNull(requestedSpan(top = 0, bottom = 2000, height = 2000, line = null, touchY = null, above = 100, below = 40, touchHalf = 20))
    }

    @Test fun aSmallerRequestStandsWithTheBarsKeptClearOfIt() {
        // The browser's own caret rect (or an accessibility node): as asked, plus what the bars cover.
        assertEquals(1100..1270, requestedSpan(top = 1200, bottom = 1230, height = 2000, line = 400..430, touchY = null, above = 100, below = 40, touchHalf = 20))
        // A story not yet laid out (0 high) asks nothing whole of anyone.
        assertEquals(-100..70, requestedSpan(top = 0, bottom = 30, height = 0, line = null, touchY = null, above = 100, below = 40, touchHalf = 20))
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
