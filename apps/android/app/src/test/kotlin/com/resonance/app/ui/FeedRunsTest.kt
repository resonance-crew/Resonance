package com.resonance.app.ui

import com.resonance.api.models.FeedCard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Picks that come once the latest cards are on screen go on top of them (FeedLoader), and the
 * cards already showing keep everything they had: their grid blocks and the blocks' keys (the list
 * keeps the block being read in place by its key), their colour families and their shapes' seeds.
 * A reader at the very top is shown the feed's new head; it is said once per new head. A reader
 * further down is told when that head is today's picks gone on top out of sight (the toast's
 * 今天的推薦來了 · 往上看) — never for picks that lead the feed, nor for a head that changed for
 * anything else.
 */
class FeedRunsTest {
    private fun card(id: String, hue: Double? = null) = FeedCard(
        id = id, slug = id, title = id, excerpt = "…", tags = emptyList(), publishedAt = "2026-09-01T08:00:00.000Z",
        author = null, anonymous = false, visibility = FeedCard.Visibility.`public`, imageUrl = null, imageLabel = null,
        accentHue = hue, readMinutes = 1, referenceCardId = null, reason = null,
    )

    @Test fun theLatestKeepTheirBlocksAndTheirKeysWhenPicksComeOnTop() {
        // Three columns, three rows to a block: twenty latest cards, then four picks above them.
        val before = gridBlocks(size = 20, perBlock = 9)
        val after = gridBlocks(size = 24, perBlock = 9, leading = 4)
        assertEquals(listOf("0", "1", "2"), before.map { it.key })
        assertEquals(listOf("lead0", "0", "1", "2"), after.map { it.key })
        // The same cards in every block of the latest, only further down the list.
        assertEquals(before.map { b -> b.indices.map { it + 4 } }, after.drop(1).map { it.indices })
        assertEquals(listOf(0, 1, 2, 3), after.first().indices)
    }

    @Test fun aListWithoutPicksOnTopIsOneRunAsBefore() {
        assertEquals(listOf("0", "1"), gridBlocks(size = 12, perBlock = 9).map { it.key })
        // All of them leading (picks only) is one run too.
        assertEquals(gridBlocks(size = 5, perBlock = 9).map { it.indices }, gridBlocks(size = 5, perBlock = 9, leading = 5).map { it.indices })
        assertEquals(listOf("0"), gridBlocks(size = 5, perBlock = 9, leading = 5).map { it.key })
    }

    @Test fun theLatestKeepTheirColoursAndTheirSeeds() {
        // No covers: a card's family is its position's, so a run counted from the list's head would recolour them all.
        val latest = (1..7).map { card("l$it") }
        val picks = listOf(card("p1"), card("p2"), card("p3", hue = 215.0))
        val shown = picks + latest
        assertEquals(cardFamilies(latest), cardRunFamilies(shown, leading = picks.size).drop(picks.size))
        assertEquals(cardFamilies(picks), cardRunFamilies(shown, leading = picks.size).take(picks.size))
        assertEquals(listOf(0, 1, 2, 0, 1, 2, 3, 4, 5, 6), shown.indices.map { runPosition(it, picks.size, shown.size) })
        // One run: as the list always was.
        assertEquals(cardFamilies(shown), cardRunFamilies(shown, leading = 0))
        assertEquals(shown.indices.toList(), shown.indices.map { runPosition(it, 0, shown.size) })
    }

    @Test fun aNewHeadIsToldOnceAndNeverForTheFeedsFirstCards() {
        val lead = LeadingCard()
        // The first cards in (from the skeleton, or none yet): nothing to bring into view.
        assertFalse(lead.changedTo(null))
        assertFalse(lead.changedTo("a"))
        assertFalse(lead.changedTo("a"))
        // Picks on top: a new head, once.
        assertTrue(lead.changedTo("p1"))
        assertFalse(lead.changedTo("p1"))
        // Emptied (everyone blocked) and back: no jump for either.
        assertFalse(lead.changedTo(null))
        assertFalse(lead.changedTo("p1"))
    }

    @Test fun picksGoneOnTopOutOfSightAreToldThoseInViewShown() {
        // The latest came first; the reader scrolled into them; the picks then went on top.
        val scrolled = FeedHead()
        assertEquals(FeedHead.Move.None, scrolled.next("l1", emptyList(), atTop = true))
        assertEquals(FeedHead.Move.OfferPicks, scrolled.next("p1", listOf("p1", "p2"), atTop = false))
        // Said once: the same picks above again (a recomposition, a re-read keeping them) say nothing.
        assertEquals(FeedHead.Move.None, scrolled.next("p1", listOf("p1", "p2"), atTop = false))
        // At the very top when they come: they are simply the first thing in view.
        val atTop = FeedHead()
        atTop.next("l1", emptyList(), atTop = true)
        assertEquals(FeedHead.Move.ShowTop, atTop.next("p1", listOf("p1"), atTop = true))
    }

    @Test fun aHeadThatChangedForAnythingElseIsntTodaysPicks() {
        // Picks that came first lead the feed: nothing went on top.
        val leading = FeedHead()
        assertEquals(FeedHead.Move.None, leading.next("p1", emptyList(), atTop = true))
        // A re-read's newer latest card at the head of a feed without picks on top, the reader further down.
        assertEquals(FeedHead.Move.None, leading.next("l0", emptyList(), atTop = false))
        // Picks on top already, and a pick the latest now hold leaves the head to the next one: nothing new arrived.
        val above = FeedHead()
        above.next("l1", emptyList(), atTop = true)
        above.next("p1", listOf("p1", "p2"), atTop = false)
        assertEquals(FeedHead.Move.None, above.next("p2", listOf("p2"), atTop = false))
        // Tomorrow's picks in their place: today's arrived again.
        assertEquals(FeedHead.Move.OfferPicks, above.next("q1", listOf("q1", "q2"), atTop = false))
    }
}
