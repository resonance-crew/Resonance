package com.resonance.app.ui

import com.resonance.api.models.Author
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.api.models.ReadingReportRequest
import com.resonance.kit.story.ReadTime
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Measuring reading (round 26 §U7): active seconds (in front, and a touch, scroll or key within 30 s), the share of the
 * story scrolled through, the end; a short card shown whole is not read to the end before 0.4 of its reading time;
 * hiding twice sends running totals, never deltas; nothing is sent for the author.
 */
class ReadingReportTest {
    private fun page(story: String, isOwner: Boolean = false, published: Boolean = true) = CardDetail(
        card = FeedCard(
            id = "rain", slug = "rain-walk", title = "一場雨後的散步", excerpt = "", tags = emptyList(),
            publishedAt = if (published) "2026-11-01T00:00:00Z" else null, author = Author("bob", "bob", "BO", "#c96442", null, null, false, null),
            anonymous = false, visibility = FeedCard.Visibility.`public`, imageUrl = null, imageLabel = null, accentHue = null, readMinutes = 1,
            referenceCardId = null, reason = null,
        ),
        story = story, visibility = CardDetail.Visibility.`public`, anonymous = false, resonanceCount = 0, coreInsight = null,
        isOwner = isOwner, referenceCard = null,
    )

    /** 64 characters: 12 seconds at 320 a minute. */
    private val short = "那天下午雨停了，我們沿著河堤一路走到橋下，誰也沒有說話。".repeat(3).take(64)

    @Test fun theExpectedTimeIsTheStorysUnrounded() {
        assertEquals(12.0, ReadTime.seconds(short), 0.001)
        // The list's minute stays a minute.
        assertEquals(1, ReadTime.minutes(short))
    }

    @Test fun aShortCardShownWholeIsNotReadToTheEndAtOnce() {
        val view = ReadingSession.of(page(short), now = 0L, id = "view-0001")!!
        // The whole story and its end on screen from the first frame.
        view.progressed(1.0)
        view.sawEnd()
        view.input(1_000L)
        assertFalse(view.report(4_000L).reachedEnd)
        // 0.4 × 12 s = 4.8 s of reading.
        assertTrue(view.report(5_000L).reachedEnd)
        assertEquals(1.0, view.report(5_000L).progress, 0.0)
    }

    @Test fun hidingTwiceSendsRunningTotalsNotDeltas() {
        val view = ReadingSession.of(page(short), now = 0L, id = "view-0002")!!
        view.input(0L)
        view.front(10_000L, shown = false)
        val first = view.report(10_000L)
        assertEquals(10.0, first.activeSeconds, 0.0)
        // In the background: nothing counts.
        view.front(60_000L, shown = true)
        view.input(65_000L)
        view.front(70_000L, shown = false)
        val second = view.report(70_000L)
        assertEquals("view-0002", second.session)
        assertEquals(20.0, second.activeSeconds, 0.0)
        assertTrue(second.activeSeconds > first.activeSeconds)
    }

    @Test fun thirtySecondsWithoutATouchStopTheClock() {
        val view = ReadingSession.of(page(short), now = 0L, id = "view-0003")!!
        // Opened, then left on the table for five minutes.
        assertEquals(30.0, view.report(300_000L).activeSeconds, 0.0)
        view.input(300_000L)
        assertEquals(35.0, view.report(305_000L).activeSeconds, 0.0)
    }

    @Test fun nothingIsSentForTheAuthorNorForADraft() {
        assertNull(ReadingSession.of(page(short, isOwner = true), now = 0L))
        assertNull(ReadingSession.of(page(short, published = false), now = 0L))
        assertNotNull(ReadingSession.of(page(short), now = 0L))
    }

    @Test fun aShareIsSaidOnceUsed() {
        val view = ReadingSession.of(page(short), now = 0L, id = "view-0004")!!
        assertNull(view.report(1_000L).shared)
        view.didShare()
        assertEquals(true, view.report(2_000L).shared)
    }

    @Test fun aSessionIdIsOneTheContractTakes() {
        val id = ReadingSession.newId()
        assertTrue(id.length in 8..40)
        assertTrue(id.all { it.isLetterOrDigit() || it == '-' })
    }

    @Test fun reportsWaitOnTheDeviceUntilTheServerHasThem() {
        val stored = HashMap<String, String?>()
        val reports = ReadingReports(object : ReadingReports.Storage {
            override fun read(account: String) = stored[account]
            override fun write(account: String, value: String?) { stored[account] = value }
        })
        val first = ReadingReportRequest("view-0005", 10.0, 0.5, false)
        val later = first.copy(activeSeconds = 20.0)
        reports.keep("alice", "rain", first)
        reports.keep("alice", "rain", later)
        // The same view keeps only its latest totals.
        assertEquals(listOf(ReadingReports.Pending("rain", later)), reports.pending("alice"))
        // An older answer doesn't take away the later report.
        reports.sent("alice", "rain", first)
        assertEquals(1, reports.pending("alice").size)
        reports.sent("alice", "rain", later)
        assertTrue(reports.pending("alice").isEmpty())
        // Another account's are its own.
        reports.keep("bob", "rain", first)
        assertTrue(reports.pending("alice").isEmpty())
        reports.forget("bob")
        assertTrue(reports.pending("bob").isEmpty())
    }
}
