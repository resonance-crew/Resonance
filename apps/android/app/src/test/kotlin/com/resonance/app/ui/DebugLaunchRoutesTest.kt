package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * A debug build's `--es route …` (the release screenshots) opens every place the site has a
 * path for: a tab's root, settings, the writer. Those are never a push's or a link's route, so
 * the routes pushes and App Links carry are left to [Route.fromPath] as before.
 */
class DebugLaunchRoutesTest {
    @Test fun tabsOpenByTheirSitePaths() {
        assertEquals(Tab.Feed to null, debugLaunchPlace("/home"))
        assertEquals(Tab.Messages to null, debugLaunchPlace("/messages"))
        assertEquals(Tab.Notifications to null, debugLaunchPlace("/notifications"))
        assertEquals(Tab.CardBox to null, debugLaunchPlace("/me"))
        assertEquals(Tab.CardBox to null, debugLaunchPlace("/zh-TW/me"))
    }

    @Test fun settingsAndTheWriterOpenAsPages() {
        assertEquals(Tab.CardBox to Route.Settings, debugLaunchPlace("/settings"))
        assertEquals(Tab.Feed to Route.Write(), debugLaunchPlace("/write"))
        assertEquals(Tab.CardBox to Route.Write(cardId = "alice-draft"), debugLaunchPlace("/en/write/alice-draft"))
    }

    @Test fun thePushAndLinkRoutesAreLeftAsTheyWere() {
        for (path in listOf("/card/rain-walk", "/u/bob", "/messages/bob", "/me/thought-map", "", "/privacy", "/me/trash")) {
            assertNull(path, debugLaunchPlace(path))
        }
    }
}
