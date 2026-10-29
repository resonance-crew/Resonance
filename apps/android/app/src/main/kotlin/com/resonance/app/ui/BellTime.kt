package com.resonance.app.ui

import android.icu.text.DateFormat
import android.icu.text.DisplayContext
import android.icu.text.RelativeDateTimeFormatter
import android.icu.util.TimeZone
import android.icu.util.ULocale
import com.resonance.app.NotificationsStore
import com.resonance.kit.l10n.L10n
import java.time.Instant
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.Date
import java.util.Locale

/** The bell's parts, newest first: the viewer's today, the six days before it, and everything older. */
internal enum class BellGroup {
    Today, ThisWeek, Earlier;

    /** The part's heading: 今天 · 這週 · 更早. */
    val title: String get() = when (this) {
        Today -> L10n.App.Notifications.today
        ThisWeek -> L10n.App.Notifications.thisWeek
        Earlier -> L10n.App.Notifications.earlier
    }
}

/**
 * When a bell row happened, as its part and its words say it (round 21; the web's bellTime.ts, iOS's
 * twin): the parts by the viewer's calendar days, not 24-hour spans — and the words in step with the
 * part, so a row under 這週 never says "2 小時前", whatever the clock says.
 */
internal object BellTime {
    /** Whole calendar days between two moments in [zone] (yesterday 23:59 is one day before today 00:01). */
    fun calendarDays(at: Instant, now: Instant, zone: ZoneId): Long =
        ChronoUnit.DAYS.between(at.atZone(zone).toLocalDate(), now.atZone(zone).toLocalDate())

    /** Which part a row stands in: the same calendar day; one to six days before; else earlier. */
    fun group(at: Instant, now: Instant, zone: ZoneId = ZoneId.systemDefault()): BellGroup {
        val days = calendarDays(at, now, zone)
        return when {
            days <= 0 -> BellGroup.Today
            days < 7 -> BellGroup.ThisWeek
            else -> BellGroup.Earlier
        }
    }

    /**
     * When it happened, in [locale] (the platform's relative formatter, short): under 今天 the minutes or
     * hours (under a minute — or a clock behind the server's — [justNow]); under 這週 the calendar days
     * (昨天, 前天 where the language has it, 3 天前); earlier the numeric date, the year too when it isn't
     * this year's.
     */
    fun words(at: Instant, now: Instant, locale: Locale, justNow: String, zone: ZoneId = ZoneId.systemDefault()): String {
        val days = calendarDays(at, now, zone)
        val icu = ULocale.forLocale(locale)
        if (days < 7) {
            val relative = RelativeDateTimeFormatter.getInstance(icu, null, RelativeDateTimeFormatter.Style.SHORT, DisplayContext.CAPITALIZATION_NONE)
            if (days <= 0) {
                val minutes = maxOf(0L, ChronoUnit.MINUTES.between(at, now))
                return when {
                    minutes < 1 -> justNow
                    minutes < 60 -> relative.format(minutes.toDouble(), RelativeDateTimeFormatter.Direction.LAST, RelativeDateTimeFormatter.RelativeUnit.MINUTES)
                    else -> relative.format((minutes / 60).toDouble(), RelativeDateTimeFormatter.Direction.LAST, RelativeDateTimeFormatter.RelativeUnit.HOURS)
                }
            }
            if (days == 1L) relative.format(RelativeDateTimeFormatter.Direction.LAST, RelativeDateTimeFormatter.AbsoluteUnit.DAY)?.let { return it }
            if (days == 2L) relative.format(RelativeDateTimeFormatter.Direction.LAST_2, RelativeDateTimeFormatter.AbsoluteUnit.DAY)?.let { return it }
            return relative.format(days.toDouble(), RelativeDateTimeFormatter.Direction.LAST, RelativeDateTimeFormatter.RelativeUnit.DAYS)
        }
        val sameYear = at.atZone(zone).year == now.atZone(zone).year
        val format = DateFormat.getInstanceForSkeleton(if (sameYear) "Md" else "yMd", icu)
        format.timeZone = TimeZone.getTimeZone(zone.id)
        return format.format(Date.from(at))
    }
}

/**
 * The rows in their parts, newest first (the list is already), each part with its rows; an empty part
 * isn't there. A row whose time the server hasn't written yet (just arrived) is today's.
 */
internal fun bellParts(items: List<NotificationsStore.Item>, now: Instant, zone: ZoneId = ZoneId.systemDefault()): List<Pair<BellGroup, List<NotificationsStore.Item>>> =
    items.groupBy { BellTime.group(it.createdAt?.toInstant() ?: now, now, zone) }
        .toList()
        .sortedBy { it.first.ordinal }

/** Stands in for the pen name while the sentence is formatted, so the name can be set apart wherever it falls. */
private const val NAME = "⁣"

/**
 * A row's sentence, its pen name apart (the web's `bellSentence`): the name set bold, the words around it
 * as the language puts them (「{handle} 寄來一張小紙條」, "{handle} sent you a little note"). A row with
 * nobody behind it (a summary, a translation, an expired invite) is all [before].
 */
internal data class BellSentence(val before: String, val handle: String?, val after: String) {
    val whole: String get() = before + handle.orEmpty() + after
}

internal fun bellSentence(item: NotificationsStore.Item): BellSentence {
    val named: ((String) -> String)? = when (item.type) {
        "invite" -> L10n.App.Notifications::invite
        "invite_accepted" -> L10n.App.Notifications::inviteAccepted
        "message" -> L10n.App.Notifications::message
        "resonance" -> L10n.App.Notifications::resonance
        "note" -> L10n.App.Notifications::note
        "card_link" -> L10n.App.Notifications::cardLink
        else -> null
    }
    if (named != null) {
        val parts = named(NAME).split(NAME, limit = 2)
        return BellSentence(parts.getOrElse(0) { "" }, item.fromHandle.orEmpty(), parts.getOrElse(1) { "" })
    }
    val whole = when (item.type) {
        "resonance_summary" -> L10n.App.Notifications.resonanceSummary(item.count ?: 0)
        "translation_done" -> L10n.App.Notifications.translationDone
        "invite_expired" -> L10n.App.Notifications.inviteExpired
        else -> item.type
    }
    return BellSentence(whole, null, "")
}
