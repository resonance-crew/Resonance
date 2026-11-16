package com.resonance.app

import com.resonance.app.ui.AuthorCardsBefore
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * A debug build's `--es scrollToCard <slug>` (round 25's profile-translated screen, scripts/visual/screens.ts): on a
 * phone carol's first card fills the screenful, so her page scrolls to the card the screen is for — its place in
 * the list counts what the page lists ahead of its cards, and the ask is kept until that card is in.
 */
class DebugLaunchScrollTest {
    @After fun clear() {
        DebugLaunch.scrollToCard = null
    }

    @Test fun theCardsPlaceCountsWhatThePageListsAheadOfItsCards() {
        val cards = listOf("stranger-word", "bridge-rain")
        // the masthead and 公開文章, then the cards: the second card is the list's fourth item
        assertEquals(3, DebugLaunch.cardScrollIndex("bridge-rain", cards, AuthorCardsBefore))
        assertEquals(2, DebugLaunch.cardScrollIndex(" stranger-word ", cards, AuthorCardsBefore))
        assertNull(DebugLaunch.cardScrollIndex("harbour-lamp", cards, AuthorCardsBefore))
        for (none in listOf(null, "", "  ")) assertNull(DebugLaunch.cardScrollIndex(none, cards, AuthorCardsBefore))
    }

    @Test fun theAskWaitsForTheCardAndIsTakenOnce() {
        DebugLaunch.scrollToCard = "bridge-rain"
        // the page's cards aren't in yet: nothing to scroll to, and the ask is kept
        assertNull(DebugLaunch.takeCardScroll(emptyList(), AuthorCardsBefore))
        assertEquals(3, DebugLaunch.takeCardScroll(listOf("stranger-word", "bridge-rain"), AuthorCardsBefore))
        // a page opened afterwards opens at its top
        assertNull(DebugLaunch.takeCardScroll(listOf("stranger-word", "bridge-rain"), AuthorCardsBefore))
    }
}
