package com.resonance.app.ui

import com.resonance.api.models.CardDetail
import com.resonance.api.models.ReadingReportRequest
import com.resonance.kit.reading.CardReads
import com.resonance.kit.story.ReadTime
import kotlinx.serialization.builtins.MapSerializer
import kotlinx.serialization.builtins.serializer
import kotlinx.serialization.json.Json
import java.util.UUID
import kotlin.math.max
import kotlin.math.min

/**
 * How one page view of someone else's card is read (round 26 §U7; the web's lib/data/readingReport, iOS's
 * ReadingReport): its **active seconds** — while the page is in front and the reader touched, scrolled or typed
 * within the last [IDLE_MS] (opening the page and coming back to it count as a touch) — and its **progress**, the
 * largest share of the story scrolled through. Its end row coming into view is [sawEnd]; it is *read to the end*
 * once that has happened and the active time is at least [END_SHARE] of the story's reading time ([expectedSeconds],
 * ReadTime.seconds — a short card shown whole is not read to the end at once). [shared] once the page's share was
 * used.
 *
 * A report holds the page view's running totals under its [id] ([report]): sent each time the page hides, never as
 * deltas — the server keeps each session's largest and adds sessions up (§R3), so sending twice counts once.
 */
internal class ReadingSession(val id: String, private val expectedSeconds: Double, start: Long) {
    private var activeMs = 0L
    private var lastInput = start
    private var lastTick = start
    private var inFront = true
    private var progress = 0.0
    private var endSeen = false
    var shared = false
        private set

    /** Counts the time since the last tick up to [now] that was active. */
    fun advance(now: Long) {
        if (inFront) {
            val until = min(now, lastInput + IDLE_MS)
            // The last input is never after the last tick (each input ticks first).
            if (until > lastTick) activeMs += until - lastTick
        }
        lastTick = max(lastTick, now)
    }

    /** A touch, a scroll or a key at [now]. */
    fun input(now: Long) {
        advance(now)
        lastInput = now
    }

    /** The page went behind something (the app in the background, another screen over it) or came back. */
    fun front(now: Long, shown: Boolean) {
        advance(now)
        inFront = shown
        if (shown) {
            lastInput = now
            lastTick = now
        }
    }

    /** The story's share scrolled through now (0…1): the largest is kept. */
    fun progressed(share: Double) {
        progress = max(progress, share.coerceIn(0.0, 1.0))
    }

    fun sawEnd() {
        endSeen = true
    }

    fun didShare() {
        shared = true
    }

    val activeSeconds: Double get() = activeMs / 1000.0

    /** Read to the end: its end in view with [END_SHARE] of the reading time spent. */
    val readToEnd: Boolean get() = endSeen && activeSeconds >= expectedSeconds * END_SHARE

    /** The running totals as of [now], to send (`reachedEnd` only once [readToEnd]). */
    fun report(now: Long): ReadingReportRequest {
        advance(now)
        return ReadingReportRequest(
            session = id,
            activeSeconds = Math.round(activeSeconds * 10) / 10.0,
            progress = Math.round(progress * 1000) / 1000.0,
            reachedEnd = readToEnd,
            shared = shared.takeIf { it },
        )
    }

    companion object {
        /** Past this long without a touch, a scroll or a key, the time isn't counted (30 s). */
        const val IDLE_MS = 30_000L

        /** The share of the reading time a view that reached the end must have spent (the server's END_ACTIVE_SHARE). */
        const val END_SHARE = 0.4

        /** A page view of [d], or none: no report is sent for the author, nor for a card the server wouldn't count. */
        fun of(d: CardDetail, now: Long, id: String = newId()): ReadingSession? =
            if (!CardReads.counts(d)) null else ReadingSession(id, ReadTime.seconds(d.story), now)

        /** A page view's id: 8–40 of A–Z a–z 0–9 and -, as the contract asks. */
        fun newId(): String = UUID.randomUUID().toString()
    }
}

/**
 * Reading reports not sent yet (§U7.2): each page view's latest running totals, kept on the device per account
 * (`reading-reports.xml`) before they are sent, and sent again at the next launch until the server has them — it is
 * idempotent per session, so sending one twice is harmless. Emptied with the account.
 */
class ReadingReports(private val storage: Storage) {
    interface Storage {
        fun read(account: String): String?
        fun write(account: String, value: String?)
    }

    /** One report on its way: the card and the page view's totals. */
    data class Pending(val cardId: String, val report: ReadingReportRequest)

    private val json = Json { ignoreUnknownKeys = true }
    private val shape = MapSerializer(String.serializer(), ReadingReportRequest.serializer())

    @Synchronized
    fun keep(account: String, cardId: String, report: ReadingReportRequest) {
        val all = load(account).toMutableMap()
        all[key(cardId, report.session)] = report
        // A device that never reaches the server keeps the latest few, not every page it ever showed.
        save(account, all.entries.toList().takeLast(MAX_KEPT).associate { it.key to it.value })
    }

    /** The server has [report] (or one at least as far along) for [cardId]. */
    @Synchronized
    fun sent(account: String, cardId: String, report: ReadingReportRequest) {
        val all = load(account)
        val k = key(cardId, report.session)
        // A later report of the same view kept meanwhile still goes.
        if (all[k] == report) save(account, all - k)
    }

    @Synchronized
    fun pending(account: String): List<Pending> =
        load(account).map { (k, report) -> Pending(k.substringBefore(SEPARATOR), report) }

    fun forget(account: String) = storage.write(account, null)

    private fun key(cardId: String, session: String) = cardId + SEPARATOR + session

    private fun load(account: String): Map<String, ReadingReportRequest> =
        storage.read(account)?.let { runCatching { json.decodeFromString(shape, it) }.getOrNull() }.orEmpty()

    private fun save(account: String, all: Map<String, ReadingReportRequest>) =
        storage.write(account, if (all.isEmpty()) null else json.encodeToString(shape, all))

    companion object {
        const val FILE = "reading-reports"
        const val MAX_KEPT = 40
        private const val SEPARATOR = "|"
    }
}
