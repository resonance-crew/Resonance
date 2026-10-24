package com.resonance.app.ui

import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * My own shelves (published, private, drafts) are read together in one request — the shelf in
 * view, and the others of them not read lately; the others' shelves one at a time, when shown. The
 * private and draft shelves are one 草稿 shelf on screen (round 8 §1.1): always read together, merged
 * by when each card was last changed, at most 40; there is no 私人卡 shelf, and one kept from before
 * opens 草稿 — where every card opens the writer.
 */
class CardBoxShelvesTest {
    @Test fun anOwnShelfBringsTheOtherOwnShelvesThatAreDue() {
        assertEquals(
            listOf(TabGetCardBox.published, TabGetCardBox.`private`, TabGetCardBox.draft),
            shelvesToRead(TabGetCardBox.published) { false },
        )
        // 草稿 is the drafts and the private cards, both asked for whatever was read lately.
        assertEquals(
            listOf(TabGetCardBox.draft, TabGetCardBox.`private`, TabGetCardBox.published),
            shelvesToRead(TabGetCardBox.draft) { it == TabGetCardBox.`private` },
        )
        // Asked for again (a retry), what the shelf in view shows comes even when the others are current.
        assertEquals(listOf(TabGetCardBox.draft, TabGetCardBox.`private`), shelvesToRead(TabGetCardBox.draft) { true })
        assertEquals(listOf(TabGetCardBox.published), shelvesToRead(TabGetCardBox.published) { true })
    }

    @Test fun othersShelvesComeOneAtATime() {
        for (shelf in listOf(TabGetCardBox.resonated, TabGetCardBox.linked, TabGetCardBox.bookmarks)) {
            assertEquals(listOf(shelf), shelvesToRead(shelf) { false })
        }
    }

    @Test fun thereIsNoPrivateShelfAndOneKeptFromBeforeOpensDrafts() {
        assertFalse(TabGetCardBox.`private` in ShelfOrder)
        assertEquals(
            listOf(TabGetCardBox.published, TabGetCardBox.draft, TabGetCardBox.resonated, TabGetCardBox.linked, TabGetCardBox.bookmarks, TabGetCardBox.trash),
            ShelfOrder,
        )
        assertEquals(TabGetCardBox.draft, shelfShown(TabGetCardBox.`private`))
        assertEquals(TabGetCardBox.trash, shelfShown(TabGetCardBox.trash))
    }

    private fun card(id: String, editedAt: String?, publishedAt: String? = null) = FeedCard(
        id = id, slug = null, title = id, excerpt = "", tags = emptyList(), publishedAt = publishedAt,
        author = null, anonymous = false, visibility = FeedCard.Visibility.`private`, imageUrl = null, imageLabel = null,
        accentHue = null, readMinutes = 1, referenceCardId = null, reason = null, editedAt = editedAt,
    )

    @Test fun draftsAndPrivateCardsAreOneShelfTheLatestChangedFirst() {
        val drafts = listOf(card("d1", "2026-10-24T08:00:00.000Z"), card("d2", "2026-10-20T08:00:00.000Z"))
        val private = listOf(
            card("p1", "2026-10-22T08:00:00.000Z", publishedAt = "2026-09-01T00:00:00.000Z"),
            // Without editedAt (an older server): by when it was published.
            card("p2", null, publishedAt = "2026-10-23T00:00:00.000Z"),
        )
        assertEquals(listOf("d1", "p2", "p1", "d2"), draftShelf(private, drafts)!!.map { it.id })
        // A draft with neither goes last, as it came.
        val bare = listOf(card("d3", null), card("d4", null))
        assertEquals(listOf("d1", "d2", "d3", "d4"), draftShelf(emptyList(), drafts + bare)!!.map { it.id })
        // Offsets read as the same moment.
        assertEquals(
            listOf("late", "early"),
            draftShelf(listOf(card("early", "2026-10-24T09:00:00+08:00")), listOf(card("late", "2026-10-24T02:00:00Z")))!!.map { it.id },
        )
    }

    @Test fun theShelfIsReadOnceEitherHalfIsAndHoldsAtMostForty() {
        assertNull(draftShelf(null, null))
        assertEquals(listOf("d1"), draftShelf(null, listOf(card("d1", "2026-10-24T08:00:00Z")))!!.map { it.id })
        val many = (1..30).map { card("d$it", "2026-10-%02dT08:00:00Z".format(it)) }
        val more = (1..30).map { card("p$it", "2026-09-%02dT08:00:00Z".format(it)) }
        val shelf = draftShelf(more, many)!!
        assertEquals(DRAFT_SHELF_MAX, shelf.size)
        assertEquals("d30", shelf.first().id)
        assertEquals("p21", shelf.last().id)
        // A card on both (a write between the two reads) shows once.
        assertEquals(listOf("x"), draftShelf(listOf(card("x", "2026-10-02T00:00:00Z")), listOf(card("x", "2026-10-01T00:00:00Z")))!!.map { it.id })
    }

    @Test fun onDraftsEveryCardOpensTheWriterAPublishedPrivateOneToo() {
        // 草稿: a draft resumes, and a published card kept private is edited where it is published from (the web's /write/{id}).
        assertEquals(Route.Write(cardId = "d1"), managedTap(card("d1", null), TabGetCardBox.draft))
        val kept = card("p1", null, publishedAt = "2026-09-01T00:00:00Z")
        assertEquals(Route.Write(cardId = "p1"), managedTap(kept, TabGetCardBox.draft))
        // 已發布: a card's page.
        val live = card("l1", null, publishedAt = "2026-09-02T00:00:00Z").copy(visibility = FeedCard.Visibility.`public`)
        assertEquals(Route.Card("l1", live), managedTap(live, TabGetCardBox.published))
        // A draft has no page, whatever shelf it is on.
        assertEquals(Route.Write(cardId = "d2"), managedTap(card("d2", null), TabGetCardBox.published))
    }
}
