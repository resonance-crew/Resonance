package com.resonance.app.ui

import com.resonance.design.MenuSheet
import com.resonance.design.messageActionsHeight
import com.resonance.kit.l10n.Strings
import java.io.File
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * Round 17 on Android, the rules that aren't drawing alone: the held message's list is the one menu sheet
 * (§1–§2: its height for the glide), the link editor as a modal (§6: its title and whether its foot offers
 * 移除連結).
 */
class RoundSeventeenTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    // §1–§2: the held message's list, as tall as the sheet it is

    @Test fun theHeldListIsTheMenuSheetWithItsFoot() {
        // 6 over the first row, a row of 44 each, the time's 24-tall line and 10 under it: the glide makes room for that much.
        assertEquals(6f + 3 * 44f + 24f + 10f, messageActionsHeight(3).value, 0.01f)
        assertEquals(MenuSheet.height(3, footer = true), messageActionsHeight(3))
        // A menu with no foot keeps 6 under its last row, as over its first.
        assertEquals(6f + 2 * 44f + 6f, MenuSheet.height(2, footer = false).value, 0.01f)
    }

    // §6: the link editor

    @Test fun theLinkEditorIsTitledForWhatItDoesAndOffersRemovalOnlyForALinkThere() {
        val fresh = LinkSheetRequest(null, canCard = true, LinkDisplay.Card)
        assertEquals("插入連結", linkDialogTitle(fresh))
        assertFalse(linkDialogRemoves(fresh))
        val there = LinkSheetRequest(IslandLink("https://example.com/rain", LinkDisplay.Text, standalone = false, words = "雨"), canCard = false, LinkDisplay.Text)
        assertEquals("編輯連結", linkDialogTitle(there))
        assertTrue(linkDialogRemoves(there))
        // No wider than 400: on a phone the modal's own 16 from each side makes it the window less 32.
        assertEquals(400f, LinkDialogWidth.value, 0f)
    }
}
