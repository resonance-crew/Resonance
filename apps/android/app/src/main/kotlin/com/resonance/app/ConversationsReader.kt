package com.resonance.app

import com.resonance.api.models.Conversation
import com.resonance.kit.api.InboxApi
import com.resonance.kit.realtime.Signals

/**
 * The conversation list's read on the API path (the web's `conversationsReader`, client/messages;
 * the twin of iOS's): whatever moves a list row — a message, a note, an unsend, a read, a deletion —
 * raises the viewer's `inbox` counter and that conversation's `threads[pair]` in the same touch
 * (server domain/realtime), so a pull reads only the conversations whose counters moved since its
 * last read (GET /conversations?pairs=: about two reads a conversation, where the whole first page
 * is a hundred) and merges them into the list it holds; one asked for that the answer leaves out is
 * gone. It reads the list whole instead when no one can say what moved (nothing held yet, the
 * listener not answered yet or failed: [SignalHub.live]), when `inbox` moved with no conversation's
 * counter (a touch of the list alone), when more moved than a delta asks for, when a list the pages
 * cut short lost a conversation (the next one in is only the server's to say), and every
 * [FULL_READ_MILLIS] besides — for what no signal tells of (a renamed person, a touch that failed).
 * A pull with nothing moved while the listener is live reads nothing.
 *
 * Unlike the web, a whole read made before the listener first answered never stands for that answer:
 * the answer pulls again (Android's flows say a counter's first value too), and that pull reads whole
 * — an early 304 when nothing moved — so nothing that moved between the two is missed.
 *
 * Pulls are made one at a time (launchPulls); a new reader for each start.
 */
class ConversationsReader(
    private val whole: suspend () -> InboxApi.Listed,
    private val some: suspend (List<String>) -> List<Conversation>,
    private val heard: () -> Signals?,
    private val now: () -> Long = System::currentTimeMillis,
) {
    constructor(inbox: InboxApi, heard: () -> Signals?) : this({ inbox.conversationList() }, { inbox.conversations(it) }, heard)

    /** What a pull did. */
    sealed interface Read {
        val conversations: List<Conversation>

        /** The list was read whole. */
        data class Whole(override val conversations: List<Conversation>) : Read

        /** Only [pairs] were read (and merged into the list held). */
        data class Delta(override val conversations: List<Conversation>, val pairs: Set<String>) : Read

        /** Nothing moved: nothing was read, the list held stands. */
        data class Same(override val conversations: List<Conversation>) : Read
    }

    private var held: List<Conversation>? = null
    /** The pages ran out before the read's limit did: every conversation is held (false: a later page holds more). */
    private var complete = true
    /** How many a list cut short holds: a conversation that moved past its end is a later page's. */
    private var cut = 0
    /** The counters as they stood when [held] was last read (null: unknown). */
    private var heardAt: Signals? = null
    private var fullAt = 0L

    suspend fun read(): Read {
        // Taken before the read: a touch heard while it is on its way is compared again by the next pull.
        val counters = heard()
        val held = held
        val was = heardAt
        if (held == null || counters == null || was == null || now() - fullAt >= FULL_READ_MILLIS) return readWhole(counters)
        if (counters.inbox <= was.inbox) {
            heardAt = counters
            return Read.Same(held)
        }
        val moved = counters.threads.filter { (pair, n) -> n > was.thread(pair) }.keys.sorted()
        if (moved.isEmpty() || moved.size > InboxApi.PAIRS_MAX) return readWhole(counters)
        val asked = moved.toSet()
        val came = some(moved).filter { it.id in asked }.associateBy { it.id }
        if (!complete && held.any { it.id in asked && it.id !in came }) return readWhole(counters)
        var next = (held.filter { it.id !in asked } + came.values).sortedWith(ACTIVE_FIRST)
        // A list cut short stays as long: one that moved behind its last is a later page's.
        if (!complete) next = next.take(cut)
        this.held = next
        heardAt = counters
        return Read.Delta(next, asked)
    }

    private suspend fun readWhole(counters: Signals?): Read {
        val listed = whole()
        held = listed.conversations
        complete = listed.complete
        cut = listed.conversations.size
        heardAt = counters
        fullAt = now()
        return Read.Whole(listed.conversations)
    }

    companion object {
        /** How long the list goes on reading only what moved before it reads whole again (the server's early 304 trusts a list as long). */
        const val FULL_READ_MILLIS = 10 * 60_000L

        /** Most recently active first, as the API pages them: updatedAt (ISO to the microsecond), then id. */
        private val ACTIVE_FIRST = compareByDescending<Conversation> { it.updatedAt.orEmpty() }.thenByDescending { it.id }
    }
}
