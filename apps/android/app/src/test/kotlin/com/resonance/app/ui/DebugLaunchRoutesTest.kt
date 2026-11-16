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

    @Test fun aSettingsPageOpensByIosName() {
        // Round 25's settings-language screen: `--es route /settings/language`, the page a tap on 語言's row opens
        // (Navigation stacks it on the list). Every section answers to its iOS name; a name nobody has opens the list.
        val names = mapOf(
            "profile" to SettingsSection.Profile, "account" to SettingsSection.Account, "privacy" to SettingsSection.Privacy,
            "notifications" to SettingsSection.Notifications, "language" to SettingsSection.Language,
            "appearance" to SettingsSection.Appearance, "terms" to SettingsSection.Terms, "delete" to SettingsSection.Delete,
        )
        assertEquals(SettingsSection.entries.toSet(), names.values.toSet())
        for ((name, section) in names) assertEquals(name, Tab.CardBox to Route.SettingsSection(section), debugLaunchPlace("/settings/$name"))
        assertEquals(Tab.CardBox to Route.SettingsSection(SettingsSection.Language), debugLaunchPlace("/zh-TW/settings/language"))
        assertEquals(Tab.CardBox to Route.Settings, debugLaunchPlace("/settings/nowhere"))
    }

    @Test fun thePushAndLinkRoutesAreLeftAsTheyWere() {
        for (path in listOf("/card/rain-walk", "/u/bob", "/messages/bob", "/me/thought-map", "", "/privacy", "/me/trash")) {
            assertNull(path, debugLaunchPlace(path))
        }
    }
}
