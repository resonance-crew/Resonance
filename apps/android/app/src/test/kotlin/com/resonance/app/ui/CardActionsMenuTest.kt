package com.resonance.app.ui

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The owner's ⋯ on a card (the web's CardActionsMenu): a draft publishes nothing from here — its
 * audience is chosen in the writer's publish step — so it is offered no 轉為公開·私人.
 */
class CardActionsMenuTest {
    @Test fun aDraftHasNoVisibilityRow() {
        assertEquals(listOf(MenuRow.Edit, MenuRow.Delete), menuRows(published = false, answering = false))
        assertEquals(listOf(MenuRow.Edit, MenuRow.Unresonate, MenuRow.Delete), menuRows(published = false, answering = true))
    }

    @Test fun aPublishedCardKeepsIt() {
        assertEquals(listOf(MenuRow.Edit, MenuRow.Visibility, MenuRow.Delete), menuRows(published = true, answering = false))
        assertEquals(
            listOf(MenuRow.Edit, MenuRow.Visibility, MenuRow.Unresonate, MenuRow.Delete),
            menuRows(published = true, answering = true),
        )
    }
}
