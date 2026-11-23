package com.resonance.app

import com.resonance.api.models.Author
import com.resonance.api.models.BellItem
import com.resonance.api.models.BellPage
import com.resonance.kit.api.InboxApi
import com.resonance.kit.realtime.Signals

/**
 * The bell's read on the API path (the web's `bellReader`, client/notifications; the twin of
 * ConversationsReader): the newest page is read whole once with `changes=1`, keeping its
 * `updatedCursor`; after that, when the viewer's `bell` counter moved since the last read, only the
 * rows changed since that cursor (`updatedAfter`) — a row made, read, rung again — merged by id into
 * the rows held, newest first (made, then id), cut to [limit]. An answer without `delta` (more changed
 * than a page, a cursor too old) is the page whole. It reads whole when no one can say what moved
 * (nothing held yet, no cursor, the listener not answered yet or failed: [SignalHub.live]) and every
 * [FULL_READ_MILLIS] besides; a pull with nothing moved while the listener is live reads nothing.
 *
 * As ConversationsReader, a whole read made before the listener first answered never stands for that
 * answer: the answer pulls again, and that pull reads whole (a 304 when nothing moved).
 *
 * Pulls are made one at a time (launchPulls); a new reader for each start.
 */
class BellReader(
    /** One page of the bell: null, the newest page whole with a cursor (`changes=1`); a cursor, what changed since it. */
    private val page: suspend (updatedAfter: String?) -> BellPage,
    private val heard: () -> Signals?,
    private val limit: Int,
    private val now: () -> Long = System::currentTimeMillis,
) {
    constructor(inbox: InboxApi, heard: () -> Signals?, limit: Int) :
        this({ cursor -> inbox.bell(limit, updatedAfter = cursor, changes = true) }, heard, limit)

    /** What a pull did: the rows held now, and the people the answer named (none when nothing was read). */
    sealed interface Read {
        val items: List<BellItem>
        val people: List<Author>

        /** The newest page was read whole. */
        data class Whole(override val items: List<BellItem>, override val people: List<Author>) : Read

        /** Only the rows [changed] were read (and merged into the rows held). */
        data class Delta(override val items: List<BellItem>, override val people: List<Author>, val changed: Set<String>) : Read

        /** Nothing moved: nothing was read, the rows held stand. */
        data class Same(override val items: List<BellItem>) : Read {
            override val people: List<Author> get() = emptyList()
        }
    }

    private var held: List<BellItem>? = null
    private var cursor: String? = null
    /** The counters as they stood when [held] was last read (null: unknown). */
    private var heardAt: Signals? = null
    private var fullAt = 0L

    suspend fun read(): Read {
        // Taken before the read: a touch heard while it is on its way is compared again by the next pull.
        val counters = heard()
        val held = held
        val cursor = cursor
        val was = heardAt
        if (held == null || cursor == null || counters == null || was == null || now() - fullAt >= FULL_READ_MILLIS) return readWhole(counters)
        if (counters.bell <= was.bell) {
            heardAt = counters
            return Read.Same(held)
        }
        val body = page(cursor)
        this.cursor = body.updatedCursor
        heardAt = counters
        if (body.delta != true) {
            val items = body.items.take(limit)
            this.held = items
            fullAt = now()
            return Read.Whole(items, body.people)
        }
        val came = body.items.associateBy { it.id }
        val next = (held.filter { it.id !in came } + came.values).sortedWith(NEWEST_FIRST).take(limit)
        this.held = next
        return Read.Delta(next, body.people, came.keys)
    }

    private suspend fun readWhole(counters: Signals?): Read {
        val body = page(null)
        val items = body.items.take(limit)
        held = items
        cursor = body.updatedCursor
        heardAt = counters
        fullAt = now()
        return Read.Whole(items, body.people)
    }

    companion object {
        /** How long the bell goes on reading only what changed before it reads whole again (the web's BELL_FULL_READ_MS). */
        const val FULL_READ_MILLIS = 10 * 60_000L

        /** Newest first, as the server orders the bell: made (ISO to the microsecond, as the API writes it), then id. */
        private val NEWEST_FIRST = compareByDescending<BellItem> { it.createdAt }.thenByDescending { it.id }
    }
}
