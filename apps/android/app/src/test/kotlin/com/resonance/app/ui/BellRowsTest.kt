package com.resonance.app.ui

import com.resonance.app.NotificationsStore
import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File
import java.time.LocalDateTime
import java.time.ZoneId
import java.util.Date
import java.util.Locale

/**
 * The bell's rows (round 21; the web's bellTime.test.ts): parted by the viewer's calendar days, their
 * times in step with their part — a row under 這週 never says "2 小時前" — and each sentence with its pen
 * name set apart wherever the language puts it.
 */
@RunWith(RobolectricTestRunner::class)
class BellRowsTest {
    private val language = Strings.language
    private val zone = ZoneId.of("Asia/Taipei")
    private val zh = Locale.forLanguageTag("zh-Hant-TW")
    private val now = at(2026, 10, 29, 0, 30)

    private fun at(y: Int, m: Int, d: Int, h: Int = 12, min: Int = 0) = LocalDateTime.of(y, m, d, h, min).atZone(zone).toInstant()

    @Before fun catalogs() {
        Strings.load { File("../../../src/messages/${it.tag}.json").readText() }
        Strings.language = Strings.Language.ZhTW
    }

    @After fun restore() {
        Strings.language = language
    }

    @Test fun partsTheListByCalendarDaysNotByTwentyFourHourSpans() {
        assertEquals(BellGroup.Today, BellTime.group(at(2026, 10, 29, 0, 10), now, zone))
        // An hour ago, but yesterday: this week, and said as yesterday.
        assertEquals(BellGroup.ThisWeek, BellTime.group(at(2026, 10, 28, 23, 30), now, zone))
        assertEquals("昨天", BellTime.words(at(2026, 10, 28, 23, 30), now, zh, "剛剛", zone))
        assertEquals(BellGroup.ThisWeek, BellTime.group(at(2026, 10, 23), now, zone))
        assertEquals(BellGroup.Earlier, BellTime.group(at(2026, 10, 22), now, zone))
    }

    @Test fun saysTheMinutesAndHoursTodayTheDaysThisWeekThenTheDate() {
        assertEquals("剛剛", BellTime.words(at(2026, 10, 29, 0, 30), now, zh, "剛剛", zone))
        assertEquals("20 分鐘前", BellTime.words(at(2026, 10, 29, 0, 10), now, zh, "剛剛", zone))
        val evening = at(2026, 10, 29, 21, 0)
        assertEquals("2 小時前", BellTime.words(at(2026, 10, 29, 18, 30), evening, zh, "剛剛", zone))
        assertEquals("3 days ago", BellTime.words(at(2026, 10, 26), now, Locale.ENGLISH, "Just now", zone))
        assertEquals("3 天前", BellTime.words(at(2026, 10, 26), now, zh, "剛剛", zone))
        assertEquals("10/20", BellTime.words(at(2026, 10, 20), now, zh, "剛剛", zone))
        assertEquals("12/20/2025", BellTime.words(at(2025, 12, 20), now, Locale.ENGLISH, "Just now", zone))
        // A clock a little behind the server's: never "in 1 minute".
        assertEquals("Just now", BellTime.words(now.plusSeconds(30), now, Locale.ENGLISH, "Just now", zone))
    }

    @Test fun thePartsComeNewestFirstAndARowNotYetTimedIsTodays() {
        val rows = listOf(
            row("a", null),
            row("b", at(2026, 10, 29, 0, 5)),
            row("c", at(2026, 10, 27)),
            row("d", at(2026, 9, 1)),
        )
        val parts = bellParts(rows, now, zone)
        assertEquals(listOf(BellGroup.Today, BellGroup.ThisWeek, BellGroup.Earlier), parts.map { it.first })
        assertEquals(listOf("a", "b"), parts[0].second.map { it.id })
        assertEquals(listOf("c"), parts[1].second.map { it.id })
        assertEquals("今天", BellGroup.Today.title)
    }

    @Test fun theSentenceSetsThePenNameApartWhereverTheLanguagePutsIt() {
        val note = row("n", now, type = "note")
        assertEquals(BellSentence("", "阿澄", " 寄來一張小紙條"), bellSentence(note))
        Strings.language = Strings.Language.En
        assertEquals(BellSentence("", "阿澄", " sent you a little note"), bellSentence(note))
        assertEquals("阿澄 sent you a little note", bellSentence(note).whole)
        // Nobody behind it: the whole sentence, no name.
        val summary = bellSentence(row("s", now, type = "translation_done"))
        assertNull(summary.handle)
        assertEquals("", summary.after)
    }

    private fun row(id: String, at: java.time.Instant?, type: String = "resonance") = NotificationsStore.Item(
        id = id, type = type, fromHandle = "阿澄", fromUserId = "u1", cardId = "c1", preview = null, noteId = null,
        count = null, readAt = null, createdAt = at?.let { Date.from(it) },
    )
}
