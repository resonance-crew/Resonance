package com.resonance.app

import com.resonance.app.ui.AuthorCardsBefore
import com.resonance.design.GridBlockRows
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * A debug build's `--es scrollToCard <slug>` (round 25's profile-translated screen, scripts/visual/screens.ts): on a
 * phone carol's first card fills the screenful (and on a tablet the cards' feet lie under the fold), so her page
 * scrolls to the card the screen is for — its place in the list counts what the page lists ahead of its cards, a
 * tablet's cards come in blocks, and the ask is kept until that card is in.
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

    @Test fun aTabletsCardsComeInBlocks() {
        // two columns, GridBlockRows rows to a block: the first six cards are the list's third item, the seventh starts the next
        val perBlock = 2 * GridBlockRows
        val cards = (1..7).map { "card-$it" }
        assertEquals(2, DebugLaunch.cardScrollIndex("card-2", cards, AuthorCardsBefore, perBlock))
        assertEquals(2, DebugLaunch.cardScrollIndex("card-6", cards, AuthorCardsBefore, perBlock))
        assertEquals(3, DebugLaunch.cardScrollIndex("card-7", cards, AuthorCardsBefore, perBlock))
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
