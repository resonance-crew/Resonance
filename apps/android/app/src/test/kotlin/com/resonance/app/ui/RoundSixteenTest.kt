package com.resonance.app.ui

import android.view.KeyCharacterMap
import android.view.KeyEvent
import com.resonance.design.generated.ReactionId
import com.resonance.design.ReactionChipItem
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Round 16 on Android, the rules that aren't drawing alone: the tag field's segment and its hardware-only
 * Backspace (§1), the tab bar's hide-on-scroll (§2), where a held message goes so its reactions stand
 * right above it and its actions right under it (§3), the chips and what a screen reader hears of them
 * (§3–§4), and an unsent message's words in its row and in the conversation list.
 */
class RoundSixteenTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    // §1 tags

    @Test fun theSegmentAddsOnlyACommittedWord() {
        assertFalse(TagEntry.ready("", composing = false))
        assertFalse(TagEntry.ready("   ", composing = false))
        // An IME still composing: AI 建議 stays until the word is committed.
        assertFalse(TagEntry.ready("ㄩˇ", composing = true))
        assertTrue(TagEntry.ready("雨", composing = false))
    }

    @Test fun onlyAHardwareKeyboardsFirstBackspaceTakesATagBack() {
        val physical = 3
        assertTrue(TagEntry.hardwareBackspace(0, physical, 0, virtualDevice = false))
        // Held: the words clear, then it stops — never the tags.
        assertFalse(TagEntry.hardwareBackspace(1, physical, 0, virtualDevice = false))
        // A soft keyboard's, however it arrives.
        assertFalse(TagEntry.hardwareBackspace(0, KeyCharacterMap.VIRTUAL_KEYBOARD, 0, virtualDevice = null))
        assertFalse(TagEntry.hardwareBackspace(0, physical, KeyEvent.FLAG_SOFT_KEYBOARD, virtualDevice = false))
        assertFalse(TagEntry.hardwareBackspace(0, physical, 0, virtualDevice = true))
    }

    @Test fun theNewStringsKeepTheCopyRule() {
        assertEquals("AI 建議", Strings.string("write.tagsSuggestShort"))
        assertEquals("已加入 2 個標籤", com.resonance.kit.l10n.L10n.Write.tagsAdded(2))
        assertEquals("新增標籤：雨", com.resonance.kit.l10n.L10n.Write.tagsAddLabel("雨"))
    }

    // §2 the tab bar slides away while the feed is read

    private val hideAfter = 24f
    private val showAfter = 12f

    @Test fun readingDownPastTheLeadHidesTheBarAndAShortWayUpBringsItBack() {
        val rule = TabBarHideRule()
        var hidden = false
        fun scroll(dy: Float, pastLead: Boolean = true, top: Boolean = false, end: Boolean = false, allowed: Boolean = true) {
            hidden = rule.scrolled(hidden, dy, pastLead, top, end, hideAfter, showAfter, allowed)
        }
        // Within the first 80 nothing counts.
        scroll(60f, pastLead = false)
        assertFalse(hidden)
        scroll(20f)
        assertFalse(hidden)
        scroll(5f)
        assertTrue(hidden)
        // Up 10 isn't enough; a turn back down starts the up count afresh.
        scroll(-10f)
        assertTrue(hidden)
        scroll(4f)
        scroll(-10f)
        assertTrue(hidden)
        scroll(-3f)
        assertFalse(hidden)
        // A broken run down counts afresh.
        scroll(20f)
        scroll(-2f)
        scroll(20f)
        assertFalse(hidden)
        scroll(10f)
        assertTrue(hidden)
        // The top or the end of the feed brings it back.
        scroll(30f, end = true)
        assertFalse(hidden)
        scroll(30f)
        assertTrue(hidden)
        scroll(-1f, top = true)
        assertFalse(hidden)
    }

    @Test fun theBarNeverHidesForAScreenReaderOrSwitchAccess() {
        val hide = TabBarAutoHide()
        hide.allowed = false
        repeat(10) { hide.scrolled(40f, pastLead = true, atTop = false, atEnd = false, hideAfter = hideAfter, showAfter = showAfter) }
        assertFalse(hide.hidden)
        hide.allowed = true
        hide.scrolled(40f, pastLead = true, atTop = false, atEnd = false, hideAfter = hideAfter, showAfter = showAfter)
        assertTrue(hide.hidden)
        hide.show()
        assertFalse(hide.hidden)
    }

    // §3 the held message moves, never its menus

    private val tray = 52
    private val list = 200

    @Test fun aMessageWithRoomAroundItStaysWhereItIs() {
        val p = placeHeldMessage(top = 600, bottom = 680, tray = tray, trayGap = 8, list = list, listGap = 10, safeTop = 100, safeBottom = 1500)
        assertEquals(0, p.shift)
        assertNull(p.shown)
        assertEquals(600 - 8 - tray, p.trayTop)
        assertEquals(680 + 10, p.listTop)
    }

    @Test fun aLowMessageGlidesUpJustEnoughForItsList() {
        val p = placeHeldMessage(top = 1300, bottom = 1380, tray = tray, trayGap = 8, list = list, listGap = 10, safeTop = 100, safeBottom = 1500)
        // The list's foot lands on the room's foot.
        assertEquals(1500 - list - 10 - 1380, p.shift)
        assertEquals(1500, p.listTop + list)
        assertEquals(1300 + p.shift - 8 - tray, p.trayTop)
    }

    @Test fun aHighMessageGlidesDownJustEnoughForItsTray() {
        val p = placeHeldMessage(top = 110, bottom = 190, tray = tray, trayGap = 8, list = list, listGap = 10, safeTop = 100, safeBottom = 1500)
        assertEquals(100, p.trayTop)
        assertEquals(100 + tray + 8 - 110, p.shift)
        // Without a tray (a message reactions can't reach) it needn't move.
        assertEquals(0, placeHeldMessage(110, 190, 0, 8, list, 10, 100, 1500).shift)
    }

    @Test fun aMessageTallerThanTheRoomIsShownFromItsTop() {
        val p = placeHeldMessage(top = 50, bottom = 1650, tray = tray, trayGap = 8, list = list, listGap = 10, safeTop = 100, safeBottom = 1500, least = 48)
        assertEquals(1400 - tray - 8 - 10 - list, p.shown)
        assertEquals(100, p.trayTop)
        assertEquals(100 + tray + 8 - 50, p.shift)
        assertEquals(1500, p.listTop + list)
    }

    @Test fun theTrayIsFlushWithTheMessagesSideInsideTheMargins() {
        // Yours: right edges flush; theirs: left edges flush.
        assertEquals(1000 - 232, trayLeft(mine = true, left = 700, right = 1000, tray = 232, width = 1080, margin = 12))
        assertEquals(60, trayLeft(mine = false, left = 60, right = 300, tray = 232, width = 1080, margin = 12))
        // A narrow message near an edge: the tray keeps 12 from the window's edges.
        assertEquals(12, trayLeft(mine = true, left = 20, right = 120, tray = 232, width = 1080, margin = 12))
        assertEquals(1080 - 12 - 232, trayLeft(mine = false, left = 1000, right = 1070, tray = 232, width = 1080, margin = 12))
    }

    // §3–§4 chips, their words, an unsent message

    @Test fun chipsAreKnownStickersAndAScreenReaderHearsWhoReactedHow() {
        assertEquals(
            listOf(ReactionChipItem(ReactionId.Heart, 1), ReactionChipItem(ReactionId.Laugh, 1)),
            reactionChips(mapOf("bob" to "laugh", "alice" to "heart", "carol" to "sparkler"), "alice"),
        )
        assertEquals(listOf(ReactionChipItem(ReactionId.Hug, 2)), reactionChips(mapOf("bob" to "hug", "alice" to "hug"), "alice"))
        assertEquals("你回應了愛心，bob 回應了大笑", reactionsSpoken(mapOf("bob" to "laugh", "alice" to "heart"), "alice", "bob"))
        assertEquals("讚", reactionName(ReactionId.Thumbs))
    }

    @Test fun anUnsentMessageReadsTheSameInItsRowAndInTheList() {
        assertEquals("你收回了一則訊息", unsentWords(mine = true, handle = "bob"))
        assertEquals("bob 收回了一則訊息", unsentWords(mine = false, handle = "bob"))
        assertEquals("你收回了一則訊息", conversationPreview(null, image = false, fromMe = true, unsent = true, handle = "bob"))
        assertEquals("bob 收回了一則訊息", conversationPreview(null, image = false, fromMe = false, unsent = true, handle = "bob"))
        // Not unsent: as before.
        assertEquals("你：早安", conversationPreview("早安", image = false, fromMe = true))
    }
}
