package com.resonance.kit.chat

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs

/** Where a message sits in a run of messages from one person: it picks the corners the bubble tucks. */
enum class RunPosition {
    /** Alone: all four corners round. */
    Single,
    /** The first of a run: the corner facing the next message is tucked. */
    First,
    /** In the middle: both corners facing a neighbour are tucked. */
    Middle,
    /** The last of a run: the corner facing the one before is tucked. */
    Last;

    /** A neighbour above it in the run: the corner on the sender's side, top, is tucked. */
    val joinsAbove: Boolean get() = this == Middle || this == Last
    /** A neighbour below it in the run: the corner on the sender's side, bottom, is tucked. */
    val joinsBelow: Boolean get() = this == First || this == Middle
}

/**
 * One message of the thread with what the list needs around it: its place in a run (Messenger's
 * stacking), and the labels that lead it.
 *
 * [dayLabel] leads the first message of a day. [timeLabel] leads a message that comes
 * [ThreadRows.TIME_LABEL_GAP_MILLIS] or more after the one before it on the same day. A label is a
 * break: nothing stacks across one.
 */
data class ThreadRow(
    val message: ChatMessage,
    val position: RunPosition,
    val dayLabel: Boolean,
    val timeLabel: Boolean,
    /**
     * The pictures of an album drawn as one grid on this row (round 22), in their order — [message]
     * first, the one with the lowest place (it carries the words and the quote) — or none: one message.
     */
    val album: List<ChatMessage> = emptyList(),
) {
    /** It stacks under the message before it (a tight gap instead of the one between runs). */
    val joinsAbove: Boolean get() = position.joinsAbove

    /** Every message this row draws: [message], or the album's pictures. */
    val members: List<ChatMessage> get() = album.ifEmpty { listOf(message) }

    /** Whether this row draws the message with id or key [idOrKey]. */
    fun holds(idOrKey: String): Boolean = members.any { it.id == idOrKey || it.key == idOrKey }
}

/**
 * Lays the thread out in runs, the way Messenger stacks messages sent close together: consecutive
 * messages from the same sender, less than [RUN_GAP_MILLIS] apart on the same day, with no label
 * between them, are one run; a reply opens a run (it leads with the quote it answers), so does a note
 * (it leads with the card it was left on), and a message that failed to send ends the run it is in
 * (its "not sent" line sits under it). Used on the main thread; pure.
 */
object ThreadRows {
    /** Messages further apart than this don't stack. */
    const val RUN_GAP_MILLIS = 3 * 60_000L
    /** A message this long after the one before it (on the same day) gets a time label. */
    const val TIME_LABEL_GAP_MILLIS = 15 * 60_000L

    /**
     * [messages] oldest first, as [ThreadMessages.build] returns them. Only those [drawn] says the
     * thread draws have rows: one that draws nothing ([Carried.Nothing]: a card the viewer can't
     * see, sent without words) shapes no run — the bubble before it keeps its round corner and their
     * face — and leads no label.
     */
    fun build(messages: List<ChatMessage>, zone: ZoneId = ZoneId.systemDefault(), drawn: (ChatMessage) -> Boolean = { true }): List<ThreadRow> {
        val groups = AlbumRows.group(messages.filter(drawn))
        @Suppress("NAME_SHADOWING") val messages = groups.map { it.first() }
        if (messages.isEmpty()) return emptyList()
        val days = messages.map { day(it, zone) }
        val day = BooleanArray(messages.size) { it == 0 || days[it] != days[it - 1] }
        val time = BooleanArray(messages.size) { i ->
            i > 0 && !day[i] && messages[i].sentAt.time - messages[i - 1].sentAt.time >= TIME_LABEL_GAP_MILLIS
        }
        val joins = BooleanArray(messages.size) { i ->
            val m = messages[i]
            val before = messages.getOrNull(i - 1)
            before != null && !day[i] && !time[i] &&
                // A reply opens with the quote it answers, a note with the card it was left on: each starts a run of its own.
                m.replyTo == null && !m.isNote &&
                before.senderId == m.senderId && before.delivery != Delivery.Failed &&
                // A message still on its way carries this phone's clock: a few seconds off the server's doesn't unstack it.
                abs(m.sentAt.time - before.sentAt.time) < RUN_GAP_MILLIS
        }
        return messages.mapIndexed { i, m ->
            val above = joins[i]
            val below = i + 1 < messages.size && joins[i + 1]
            val position = when {
                above && below -> RunPosition.Middle
                above -> RunPosition.Last
                below -> RunPosition.First
                else -> RunPosition.Single
            }
            ThreadRow(m, position, day[i], time[i], album = groups[i].takeIf { it.size > 1 }.orEmpty())
        }
    }

    private fun day(m: ChatMessage, zone: ZoneId): LocalDate = Instant.ofEpochMilli(m.sentAt.time).atZone(zone).toLocalDate()
}

/**
 * Albums (round 22 §3): one sender's consecutive pictures of one album are drawn as one grid. A member
 * still on its way from the other side, unsent or one that failed (its own row, with its retry) just
 * leaves the grid smaller; a lone member left is an ordinary picture.
 */
object AlbumRows {
    /** Whether [m] can stand in an album's grid. */
    fun groupable(m: ChatMessage): Boolean = m.album != null && m.image != null && !m.isUnsent && m.delivery != Delivery.Failed

    /**
     * [messages] (oldest first) in groups: each a single message, or an album's consecutive pictures in
     * their order (by [ChatAlbum.index]) — the one that carries the words first. A picture of the album
     * that can't stand in the grid (unsent, failed) doesn't break it: it follows the grid as its own row
     * (its ghost, its retry), so the grid is only smaller.
     */
    fun group(messages: List<ChatMessage>): List<List<ChatMessage>> {
        val out = ArrayList<List<ChatMessage>>()
        var current: MutableList<ChatMessage>? = null
        val after = ArrayList<ChatMessage>()
        fun close() {
            current?.let { g -> out.add(if (g.size > 1) g.sortedBy { it.album?.index ?: 0 } else g) }
            after.forEach { out.add(listOf(it)) }
            current = null
            after.clear()
        }
        for (m in messages) {
            val head = current?.first()
            if (head != null && head.senderId == m.senderId && m.album != null && head.album?.id == m.album.id) {
                if (groupable(m)) current!!.add(m) else after.add(m)
                continue
            }
            close()
            if (groupable(m)) current = mutableListOf(m) else out.add(listOf(m))
        }
        close()
        return out
    }
}

/**
 * Where each picture of an album's grid goes (round 22 §3), in a grid [width] wide with [gap] between
 * pictures: 2 side by side, 3 one big with two stacked beside it, 4 two by two, 5 to 10 in rows of three
 * (a last row of one or two shares the width). All in the grid's own units.
 */
object AlbumLayout {
    data class Cell(val x: Float, val y: Float, val width: Float, val height: Float)

    /** The cells for [count] pictures, in order, and the grid's height. */
    fun cells(count: Int, width: Float, gap: Float): Pair<List<Cell>, Float> {
        if (count <= 0) return emptyList<Cell>() to 0f
        if (count == 1) return listOf(Cell(0f, 0f, width, width * 0.75f)) to width * 0.75f
        if (count == 2) {
            val w = (width - gap) / 2
            val h = w * 1.25f
            return listOf(Cell(0f, 0f, w, h), Cell(w + gap, 0f, w, h)) to h
        }
        if (count == 3) {
            val big = (width - gap) * 2 / 3
            val small = width - gap - big
            val h = big
            val half = (h - gap) / 2
            return listOf(Cell(0f, 0f, big, h), Cell(big + gap, 0f, small, half), Cell(big + gap, half + gap, small, half)) to h
        }
        if (count == 4) {
            val s = (width - gap) / 2
            return listOf(Cell(0f, 0f, s, s), Cell(s + gap, 0f, s, s), Cell(0f, s + gap, s, s), Cell(s + gap, s + gap, s, s)) to s * 2 + gap
        }
        val side = (width - 2 * gap) / 3
        val cells = ArrayList<Cell>(count)
        val rows = (count + 2) / 3
        for (r in 0 until rows) {
            val inRow = minOf(3, count - r * 3)
            val w = (width - (inRow - 1) * gap) / inRow
            for (c in 0 until inRow) cells.add(Cell(c * (w + gap), r * (side + gap), w, side))
        }
        return cells to rows * side + (rows - 1) * gap
    }
}
