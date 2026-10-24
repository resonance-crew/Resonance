package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The owner's ⋯ on a card (the web's CardActionsMenu, round 8 §1.2): a card readers have — public,
 * or kept for connections — is offered 轉為草稿; every 草稿, never published or published and kept
 * private, is published from the writer's step, so its ⋯ is the same three: 編輯 · (取消共振) · 刪除.
 */
class CardActionsMenuTest {
    @Test fun readersHaveACardThatIsPublishedAndNotPrivate() {
        assertTrue(seenByReaders(published = true, visibility = "public"))
        assertTrue(seenByReaders(published = true, visibility = "connections"))
        assertFalse(seenByReaders(published = true, visibility = "private"))
        // A draft is no one's but its writer's, whatever audience it was given.
        assertFalse(seenByReaders(published = false, visibility = "public"))
    }

    @Test fun aCardReadersHaveIsOfferedToBecomeADraft() {
        assertEquals(listOf(MenuRow.Edit, MenuRow.Visibility, MenuRow.Delete), menuRows(seen = true, answering = false))
        assertEquals(
            listOf(MenuRow.Edit, MenuRow.Visibility, MenuRow.Unresonate, MenuRow.Delete),
            menuRows(seen = true, answering = true),
        )
    }

    @Test fun everyDraftHasNoVisibilityRow() {
        // Never published, or published and kept private: the same rows.
        for (published in listOf(false, true)) {
            val seen = seenByReaders(published, "private")
            assertEquals(listOf(MenuRow.Edit, MenuRow.Delete), menuRows(seen, answering = false))
            assertEquals(listOf(MenuRow.Edit, MenuRow.Unresonate, MenuRow.Delete), menuRows(seen, answering = true))
        }
    }
}
