package com.resonance.app.ui

import com.resonance.app.NotificationsStore
import com.resonance.app.PushCenter
import com.resonance.app.bellItem
import com.resonance.kit.l10n.Strings
import com.resonance.kit.push.NotificationSwitch
import org.junit.Assert.assertFalse
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.util.Date

/**
 * The bell's rows of round 26 (§U8): 「{handle} 與你的卡片共振了」 — the newest named in bold, 「和另外 {count} 人」 for the rest
 * — and the weekly 「上週有 {count} 個人把這張卡讀到最後」 with the sparkle; both open the card, named or anonymous alike,
 * never a thread. The app says it draws them (its device's capabilities), so the server writes them.
 */
class BellTimeTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun tap(vararg people: String, anonymous: Boolean = false) = bellItem(
        "rtap_walk_20261119", "resonance_tap",
        mapOf("cardId" to "walk", "fromUserIds" to people.toList()) + (if (anonymous) mapOf("anonymous" to true) else emptyMap()),
        readAt = null, createdAt = Date(0),
    )

    @Test fun aTapRowNamesItsNewestByWhoTheyAre() {
        val row = tap("carol", "alice")
        assertEquals("carol", row.fromUserId)
        assertEquals(1, row.others)
        assertNull(row.fromHandle)
        val sentence = bellSentence(row, handle = "小安")
        assertEquals("小安", sentence.handle)
        assertEquals("小安 和另外 1 人與你的卡片共振了", sentence.whole)
        assertEquals("小安 與你的卡片共振了", bellSentence(tap("carol"), handle = "小安").whole)
    }

    @Test fun inEnglishTheOthersArePlural() {
        Strings.language = Strings.Language.En
        assertEquals("carol resonated with your card", bellSentence(tap("c"), handle = "carol").whole)
        assertEquals("carol and 2 others resonated with your card", bellSentence(tap("c", "a", "b"), handle = "carol").whole)
        assertEquals("carol and 1 other resonated with your card", bellSentence(tap("c", "a"), handle = "carol").whole)
    }

    @Test fun theWeeklySummaryNamesNoOne() {
        val row = bellItem("rsum_walk_20261116", "read_summary", mapOf("cardId" to "walk", "readers" to 5L, "reread" to false), null, Date(0))
        val sentence = bellSentence(row)
        assertNull(sentence.handle)
        assertEquals("上週有 5 個人把這張卡讀到最後", sentence.whole)
        val again = bellItem("rsum_walk_20261116", "read_summary", mapOf("cardId" to "walk", "readers" to 3L, "reread" to true), null, Date(0))
        assertEquals("上週有 3 個人把這張卡讀到最後，有人回來又讀了一遍", bellSentence(again).whole)
    }

    @Test fun bothOpenTheCardNeverAThread() {
        assertEquals(Route.Card("walk"), notificationRoute(tap("carol")))
        assertEquals(Route.Card("walk"), notificationRoute(tap("carol", anonymous = true)))
        val summary = bellItem("rsum_walk_20261116", "read_summary", mapOf("cardId" to "walk", "readers" to 4L), null, Date(0))
        assertEquals(Route.Card("walk"), notificationRoute(summary))
    }

    @Test fun theyStandInTheirDaysParts() {
        val now = java.time.Instant.parse("2026-11-19T12:00:00Z")
        val row: NotificationsStore.Item = tap("carol").copy(createdAt = Date.from(now.minusSeconds(3600)))
        assertEquals(BellGroup.Today, BellTime.group(row.createdAt!!.toInstant(), now, java.time.ZoneOffset.UTC))
    }

    @Test fun thisBuildSaysItDrawsTheNewRows() {
        assertTrue("bell-tap" in PushCenter.CAPABILITIES)
        assertTrue("bell-read-summary" in PushCenter.CAPABILITIES)
        assertTrue("chat-push" in PushCenter.CAPABILITIES)
    }

    @Test fun someoneResonatingRingsOnTheBellsOwnChannel() {
        // 有人共振 comes as the bell's pushes do: the picks' channel turned off alone doesn't hold it back.
        assertTrue(canShow(NotificationSwitch.ResonanceTaps, PushCenter.PicksBlock.Channel))
        assertTrue(canShow(NotificationSwitch.ResonanceTaps, PushCenter.PicksBlock.None))
        assertFalse(canShow(NotificationSwitch.ResonanceTaps, PushCenter.PicksBlock.App))
    }
}
