package com.resonance.app.ui

import com.resonance.kit.l10n.Strings
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.ZoneId
import java.time.ZonedDateTime
import java.util.Date
import java.util.TimeZone

/** The words a thread puts between messages and in search results: a day, a time of day, the full time of a long-press. */
class ThreadLabelsTest {
    private val zone = ZoneId.of("Asia/Taipei")
    private val before = TimeZone.getDefault()
    private val language = Strings.language

    @Before fun taipei() = TimeZone.setDefault(TimeZone.getTimeZone(zone))

    @After fun restore() {
        TimeZone.setDefault(before)
        Strings.language = language
    }

    private fun at(year: Int, month: Int, day: Int, h: Int, m: Int) = Date.from(ZonedDateTime.of(year, month, day, h, m, 0, 0, zone).toInstant())

    @Test fun theTimeOfDayInChinese() {
        Strings.language = Strings.Language.ZhTW
        // One time of day across the chat (round 16 review F5): no space, no leading zero.
        assertEquals("下午3:04", timeLabel(at(2026, 9, 29, 15, 4)))
        assertEquals("上午9:30", timeLabel(at(2026, 9, 29, 9, 30)))
    }

    @Test fun theTimeOfDayInEnglish() {
        Strings.language = Strings.Language.En
        assertEquals("3:04 PM", timeLabel(at(2026, 9, 29, 15, 4)))
        assertEquals("9:30 AM", timeLabel(at(2026, 9, 29, 9, 30)))
    }

    @Test fun theDayInBothLanguages() {
        Strings.language = Strings.Language.ZhTW
        assertEquals("9月29日", dayLabel(at(2026, 9, 29, 15, 4)))
        Strings.language = Strings.Language.En
        assertEquals("September 29", dayLabel(at(2026, 9, 29, 15, 4)))
    }

    @Test fun aLongPressShowsTheFullTime() {
        Strings.language = Strings.Language.En
        assertEquals("September 29 at 3:04 PM", fullTime(at(2026, 9, 29, 15, 4)))
        Strings.language = Strings.Language.ZhTW
        assertEquals("9月29日 下午3:04", fullTime(at(2026, 9, 29, 15, 4)))
    }

    @Test fun theListTheThreadAndTheMenuSayATimeOfDayAlike() {
        // Today's row in the conversation list, the label between messages and the menu's foot: one formatter.
        val today = at(2026, 9, 29, 9, 5)
        val day = java.time.LocalDate.of(2026, 9, 29)
        Strings.language = Strings.Language.ZhTW
        assertEquals("上午9:05", rowTime(today, day))
        assertEquals(timeLabel(today), rowTime(today, day))
        assertTrue(fullTime(today).endsWith(timeLabel(today)))
        Strings.language = Strings.Language.En
        assertEquals("9:05 AM", rowTime(today, day))
        assertTrue(fullTime(today).endsWith(timeLabel(today)))
        // Another day: the date.
        assertEquals("9/28", rowTime(at(2026, 9, 28, 21, 0), day))
    }

    @Test fun aSearchResultSaysWhenItWasWrittenAsBrieflyAsItCan() {
        Strings.language = Strings.Language.En
        val now = Date()
        // Today: the time. Another year: the day and the year.
        assertEquals(timeLabel(now), resultTime(now))
        assertEquals("2019 · March 5", resultTime(at(2019, 3, 5, 10, 0)))
    }
}
