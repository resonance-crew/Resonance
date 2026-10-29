package com.resonance.app.ui

import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.app.NoteSends
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.api.isTrashed
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.io.File
import java.io.IOException
import java.time.Instant

/**
 * Round 21: a move from a card's ⋯ is drawn at once, before the server answers — on its page (in the
 * trash with its banner, private, answering nothing) and on the card box's shelves (made private, it
 * goes from 已發布 to the 私人卡 shelf) — and a failed note says why in the toast that offers 再寄一次.
 */
class OptimisticMovesTest {
    private val language = Strings.language

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    private fun card(id: String, reference: String? = null, visibility: FeedCard.Visibility = FeedCard.Visibility.`public`) = FeedCard(
        id = id, slug = id, title = "雨中散步", excerpt = "…", tags = emptyList(),
        publishedAt = "2026-09-01T08:00:00Z", author = null, anonymous = false, visibility = visibility,
        imageUrl = null, imageLabel = null, accentHue = null, readMinutes = 1, referenceCardId = reference, reason = null,
    )

    private fun detail(c: FeedCard, original: FeedCard? = null) = CardDetail(
        card = c, story = "", visibility = CardDetail.Visibility.`public`, anonymous = false, resonanceCount = 0,
        coreInsight = null, isOwner = true, referenceCard = original,
    )

    @Test fun theCardPageShowsTheMoveAtOnce() {
        val now = Instant.parse("2026-10-29T08:00:00Z")
        val page = detail(card("c1", reference = "o1"), original = card("o1"))
        val trashed = CardPageModel.moved(page, CardMove.Trash, now)
        // Its banner at once, its 30 days from now.
        assertTrue(ownTrashed(trashed))
        assertTrue(trashed.card.isTrashed)
        assertEquals("30 天後永久刪除 · 只有你看得到", trashBannerCaption(trashed.card, now))
        val private = CardPageModel.moved(page, CardMove.MakePrivate, now)
        assertTrue(isPrivateCard(private))
        assertEquals(CardDetail.Visibility.`private`, private.visibility)
        val alone = CardPageModel.moved(page, CardMove.Unresonate, now)
        assertNull(alone.card.referenceCardId)
        assertNull(alone.referenceCard)
    }

    @Test fun madePrivateItLeavesThePublishedShelfForThePrivateOne() {
        val shelves = mapOf(
            TabGetCardBox.published to listOf(card("a"), card("b")),
            TabGetCardBox.`private` to listOf(card("p", visibility = FeedCard.Visibility.`private`)),
            TabGetCardBox.draft to emptyList(),
        )
        val after = movedOnShelves("b", CardMove.MakePrivate, shelves)
        assertEquals(listOf("a"), after.getValue(TabGetCardBox.published).map { it.id })
        assertEquals(listOf("b", "p"), after.getValue(TabGetCardBox.`private`).map { it.id })
        assertEquals(FeedCard.Visibility.`private`, after.getValue(TabGetCardBox.`private`).first().visibility)
        // The one 私人卡 shelf on screen shows it first (the most recently changed).
        assertEquals("b", draftShelf(after[TabGetCardBox.`private`], after[TabGetCardBox.draft])?.first()?.id)
    }

    @Test fun answeringNothingItLosesItsLinkOnEveryShelf() {
        val shelves = mapOf(TabGetCardBox.published to listOf(card("a", reference = "o1"), card("b", reference = "o2")))
        val after = movedOnShelves("a", CardMove.Unresonate, shelves)
        assertEquals(listOf(null, "o2"), after.getValue(TabGetCardBox.published).map { it.referenceCardId })
        // The trash's own way off a shelf is the card box's `leave`: nothing moves here.
        assertEquals(shelves, movedOnShelves("a", CardMove.Trash, shelves))
    }

    @Test fun aNoteThatDidntGoSaysWhyInItsToast() {
        assertEquals("紙條沒寄出", noteFailure(IOException("offline")))
        assertEquals("紙條沒寄出", noteFailure(ApiFailure("internal", "HTTP 500", 500)))
        assertEquals("你留的紙條對方還沒回覆，先等等對方吧", noteFailure(ApiFailure("conflict", "Wait for a reply.", 409)))
        assertEquals("找不到這張卡片", noteFailure(ApiFailure("not_found", "No such card.", 404)))
        assertFalse(noteFailure(IOException()).isEmpty())
    }

    @Test fun aFailedNotesTryAgainOpensItsComposerOnItsPageUnderTheSameClientId() {
        val sends = NoteSends()
        var opened = 0
        // Its page on screen: the composer opens there.
        sends.host("c1", true)
        sends.requestReopen("c1") { opened++ }
        assertEquals("c1", sends.reopen.value)
        assertEquals(0, opened)
        sends.took("c1")
        assertNull(sends.reopen.value)
        // Left: the card's page opens, and its actions take the request.
        sends.host("c1", false)
        sends.requestReopen("c1") { opened++ }
        assertEquals(1, opened)
        assertEquals("c1", sends.reopen.value)
        // The same words again go under the same id: a retry, never a second note.
        assertEquals(sends.attempt("c1").clientId("c1", "謝謝"), sends.attempt("c1").clientId("c1", "謝謝 "))
    }
}
