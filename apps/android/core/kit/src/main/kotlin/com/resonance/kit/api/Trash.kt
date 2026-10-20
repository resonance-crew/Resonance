package com.resonance.kit.api

import com.resonance.api.models.FeedCard
import java.time.Duration
import java.time.Instant
import java.time.OffsetDateTime

/**
 * The trash's clock — the twin of src/lib/cards/trash.ts. A card moved to the trash keeps
 * `trashedAt` (the server's time when it went in) and is deleted for good [DAYS] days later; the
 * API hands its owner `purgeAt` beside it (and `restoresTo`, the visibility a restore brings back).
 * A card past its purge date is gone to its owner too, even before the server's daily purge reaches it.
 */
object Trash {
    /** How long a card waits in the trash (the server's TRASH_DAYS). */
    const val DAYS = 30
    private val DAY: Duration = Duration.ofDays(1)

    /** What the trash says of a card's time left: within its last day, else whole days. */
    data class DaysLeft(
        /** Within its last day: 「一天內永久刪除」 (`me.trashLastDay`). */
        val lastDay: Boolean,
        /** Whole days, rounded up, never fewer than one: 「{count} 天後永久刪除」 (`me.trashDaysLeft`). */
        val days: Int,
    )

    /** When a card moved to the trash at [trashedAt] is deleted for good. */
    fun purgeAtOf(trashedAt: Instant): Instant = trashedAt.plus(Duration.ofDays(DAYS.toLong()))

    /** Whether a card that is deleted for good at [purgeAt] is past it at [now]. */
    fun expired(purgeAt: Instant, now: Instant = Instant.now()): Boolean = !purgeAt.isAfter(now)

    /** The time a card deleted for good at [purgeAt] has left at [now], as the trash words it. */
    fun daysLeft(purgeAt: Instant, now: Instant = Instant.now()): DaysLeft {
        val left = Duration.between(now, purgeAt).toMillis()
        val day = DAY.toMillis()
        // Math.ceil(left / day), never under one.
        val days = maxOf(1L, Math.floorDiv(left + day - 1, day))
        return DaysLeft(lastDay = left <= day, days = days.toInt())
    }

    internal fun parse(iso: String?): Instant? = iso?.let { runCatching { OffsetDateTime.parse(it).toInstant() }.getOrNull() }
}

/** Whether your card is in the trash (`trashedAt`: only ever on your own card, the server's alone to set). */
val FeedCard.isTrashed: Boolean get() = trashedAt != null

/** When your card in the trash went in, or null when it isn't there. */
val FeedCard.trashedInstant: Instant? get() = Trash.parse(trashedAt)

/** When your card in the trash is deleted for good: the server's `purgeAt`, else [Trash.DAYS] after it went in. */
val FeedCard.purgeInstant: Instant? get() = Trash.parse(purgeAt) ?: trashedInstant?.let(Trash::purgeAtOf)
