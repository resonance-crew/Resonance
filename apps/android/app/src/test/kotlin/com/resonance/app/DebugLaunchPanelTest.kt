package com.resonance.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * A debug build's `--es threadPanel …` (the release screenshots, scripts/visual/screens.ts): the sticker panel, the
 * ＋'s attach panel (where a fresh install's gallery asks for access, 允許存取 — the button a large display size hid,
 * round 24) or the field with the soft keyboard up. Any other word opens nothing.
 */
class DebugLaunchPanelTest {
    @Test fun theScreensWordsOpenTheirPanels() {
        assertEquals(DebugLaunch.LaunchPanel.Stickers, DebugLaunch.launchPanel("stickers"))
        assertEquals(DebugLaunch.LaunchPanel.Attach, DebugLaunch.launchPanel("attach"))
        assertEquals(DebugLaunch.LaunchPanel.Keyboard, DebugLaunch.launchPanel(" Keyboard "))
    }

    @Test fun anythingElseOpensNothing() {
        for (word in listOf(null, "", "sticker", "photos", "tall")) assertNull(word, DebugLaunch.launchPanel(word))
    }
}
