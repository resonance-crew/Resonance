package com.resonance.kit.reading

import com.resonance.api.models.FeedCard
import com.resonance.kit.api.NextPage
import com.resonance.kit.api.ReadingApi
import com.resonance.kit.api.next
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.time.Duration
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.minutes
import kotlin.time.Duration.Companion.seconds

/**
 * The home feed (home/page.tsx): the latest public cards and today's picks,
 * asked for together, each shown as soon as it arrives. Picks that come first
 * — or within [picksGrace] of the latest — lead the feed (「顯示更多」 then
 * shows the latest, deduped against them). Picks that come once the latest
 * cards are on screen go on top of them at once ([State.picksAbove]), less any
 * the latest already show: the latest stay exactly as they were below them, so
 * scrolling up finds the new cards and nothing being read moves (no hint to
 * tap first). A failed pick request (the day's first, while the server still
 * builds them, can outlast the client's timeout) is asked once more a little
 * later, and goes on top the same way.
 *
 * With a [FeedStore] for the reader, a first read starts from the feed as it
 * was last read (on a cold start too) instead of the skeleton, and keeps what
 * each read brings for the next time.
 *
 * 「顯示更多」 shows what is already here (round 19): the feed keeps one page of
 * the latest cards fetched ahead of what it shows ([fetchAhead], asked for as
 * the reader nears the feed's foot, quietly), and a tap ([showMore]) shows it
 * at once. Tapped before it has come, the button is busy ([State.waiting]) and
 * the page shows the moment it arrives. Never more than one page ahead.
 *
 * A pull ([reload]) that brings nothing back — neither list — keeps the feed on
 * screen and says why ([State.refreshFailure]) until the next answer.
 */
class FeedLoader(
    private val api: ReadingApi,
    private val scope: CoroutineScope,
    private val retryPicksAfter: Duration = 20.seconds,
    private val picksGrace: Duration = 400.milliseconds,
    /** How long the quiet fetch ahead waits after one failed (a tap never waits). */
    private val aheadRetryAfter: Duration = 5.seconds,
    /** Where a reader's feed is kept between launches (null: nowhere). */
    private val storeFor: (viewer: String) -> FeedStore? = { null },
    /** Today's picks (the recommended feed; a debug build's stand-ins for the emulator, which has none). */
    private val recommended: suspend () -> List<FeedCard> = { api.recommended() },
) {
    enum class Phase { Loading, Loaded, Failed }

    data class State(
        val phase: Phase = Phase.Loading,
        val recommended: List<FeedCard> = emptyList(),
        val latest: List<FeedCard> = emptyList(),
        /** Where the latest cards' next page starts (null: no more). */
        val next: NextPage? = null,
        /** The reader asked for the latest cards below the picks. */
        val showLatest: Boolean = false,
        /**
         * The picks came once the latest cards were on screen and went on top of them: the latest
         * keep every card they showed, where it was, and the picks above leave out the ones they hold.
         */
        val picksAbove: Boolean = false,
        /** The next page of the latest cards is being fetched (quietly: the button isn't busy for it). */
        val loadingMore: Boolean = false,
        /** The page fetched ahead of what shows (deduped against it): what the next 「顯示更多」 shows. Null: none here. */
        val ahead: List<FeedCard>? = null,
        /** 「顯示更多」 was tapped before the page ahead came: the button is busy, and the page shows when it arrives. */
        val waiting: Boolean = false,
        /**
         * The last time a tap brought cards in: how many taps so far, and the cards it brought (the
         * screen lets them rise into place). Null until the first.
         */
        val reveal: Reveal? = null,
        /** The last pull brought nothing back (and why): the feed on screen stayed as it was. Gone with the next answer. */
        val refreshFailure: RefreshFailure? = null,
        internal val latestSettled: Boolean = false,
        internal val latestFailed: Boolean = false,
        /** Why the latest cards' last read failed. */
        internal val latestFailure: RefreshFailure? = null,
        internal val picksSettled: Boolean = false,
        /** The picks' last read (its first try) failed. */
        internal val picksFailed: Boolean = false,
    ) {
        /** With no picks there is nothing to hold back: the latest cards show at once. */
        val latestVisible: Boolean get() = recommended.isEmpty() || showLatest

        /** The picks as the feed shows them, at its head: all of them, or — above the latest — those the latest don't hold. */
        val picksShown: List<FeedCard>
            get() {
                if (!picksAbove || !latestVisible) return recommended
                val shown = latest.mapTo(HashSet()) { it.id }
                return recommended.filter { it.id !in shown }
            }

        /** The latest cards as the feed shows them, after the picks: none until visible; above them, the picks they hold stay out. */
        val latestShown: List<FeedCard>
            get() {
                if (!latestVisible) return emptyList()
                if (picksAbove) return latest
                val picked = recommended.mapTo(HashSet()) { it.id }
                return latest.filter { it.id !in picked }
            }

        /** What the feed shows, in order. */
        val cards: List<FeedCard> get() = picksShown + latestShown

        /** Something more to show: the latest under the picks, the page fetched ahead, or one the server still has. */
        val canLoadMore: Boolean get() = !latestVisible || ahead != null || next != null

        /** The reader nearing the foot should have the next page fetched now: none ahead, none on its way, and more to fetch. */
        val wantsAhead: Boolean get() = latestVisible && ahead == null && !loadingMore && next != null

        /** Loading until either list has something to show, or both have answered. */
        internal fun settled(): State {
            val next = when {
                cards.isNotEmpty() -> Phase.Loaded
                !latestSettled || !picksSettled -> if (phase == Phase.Loaded) Phase.Loaded else Phase.Loading
                latestFailed -> Phase.Failed
                else -> Phase.Loaded
            }
            return copy(phase = next)
        }
    }

    /** A tap's cards: the [seq]th tap, the cards it brought in ([ids]), and when they came in ([at], [System.nanoTime]). */
    data class Reveal(val seq: Int, val ids: Set<String>, val at: Long = System.nanoTime())

    private val _state = MutableStateFlow(State())
    val state: StateFlow<State> = _state

    private var loading: Job? = null
    private var generation = 0
    private var loadedFor: String? = null
    private var loadedVersion: Int? = null
    private var loadedAt = 0L
    private var store: FeedStore? = null
    /** Before this (epoch ms) the quiet fetch ahead doesn't ask: the last one failed. */
    private var quietAfter = 0L

    /**
     * Reads the feed when what it holds isn't current: for another reader, after a change to
     * the reader's own cards (`version`: the session's count of them, which a change to the
     * blocks bumps too), after a failure, or once it is older than [maxAge] (the app back after
     * a while). Otherwise the screen comes back to it as it was left.
     */
    fun refresh(viewer: String?, version: Int, now: Long = System.currentTimeMillis(), maxAge: Duration = STALE_AFTER) {
        val current = viewer == loadedFor && version == loadedVersion && now - loadedAt < maxAge.inWholeMilliseconds
        if (current && _state.value.phase != Phase.Failed) return
        val restoring = if (viewer != loadedFor) {
            loading?.cancel()
            _state.value = State()
            store = viewer?.let(storeFor)
            store
        } else null
        loadedFor = viewer
        loadedVersion = version
        loadedAt = now
        if (restoring != null) restoreAndLoad(restoring) else load()
    }

    /**
     * Reads the feed. A first read (or a retry after a failure) shows the
     * skeleton; a re-read keeps what is on screen until the new lists arrive.
     */
    fun load(): Job {
        loading?.cancel()
        val run = ++generation
        reading()
        return scope.launch { read(run) }.also { loading = it }
    }

    /**
     * Reads the feed again now, asked for by hand (a pull): what is on screen stays until the new
     * lists arrive. Returns once both have answered or failed — picks asked for again a little
     * later don't hold it — or after [limit] at most: with why, when neither came back while the
     * feed showed cards (it stays, and [State.refreshFailure] says so); null otherwise — with
     * nothing on screen, a failure is the page's own.
     */
    suspend fun reload(now: Long = System.currentTimeMillis(), limit: Duration = RELOAD_LIMIT): RefreshFailure? {
        loadedAt = now
        val showing = _state.value.let { it.phase == Phase.Loaded && it.cards.isNotEmpty() }
        load()
        val settled = withTimeoutOrNull(limit) { _state.first { it.latestSettled && it.picksSettled } } ?: return null
        if (!showing || !settled.latestFailed || !settled.picksFailed) return null
        val failure = settled.latestFailure ?: RefreshFailure.Failed
        _state.update { it.copy(refreshFailure = failure) }
        return failure
    }

    /** A new reader's first read: the feed as they last saw it shows while it goes. */
    private fun restoreAndLoad(saved: FeedStore): Job {
        loading?.cancel()
        val run = ++generation
        return scope.launch {
            val latest = runCatching { saved.latest() }.getOrNull()
            val picks = runCatching { saved.picks() }.getOrNull()
            _state.update { s ->
                val kept = State(
                    phase = Phase.Loaded,
                    recommended = picks.orEmpty(),
                    latest = latest?.cards.orEmpty(),
                    next = latest?.next,
                    latestSettled = true,
                    picksSettled = true,
                )
                // Nothing kept (or the server was quicker): as it is.
                if (s.phase != Phase.Loading || kept.cards.isEmpty()) s else kept
            }
            reading()
            read(run)
        }.also { loading = it }
    }

    private fun reading() = _state.update { s ->
        // A fetch ahead still on its way belongs to the read before (its answer is dropped): none is now.
        if (s.phase == Phase.Loaded) s.copy(
            latestSettled = false, latestFailed = false, latestFailure = null, picksSettled = false, picksFailed = false,
            loadingMore = false, waiting = false,
        )
        else State()
    }

    private suspend fun read(run: Int) {
        val keep = store
        coroutineScope {
            launch {
                var failure: RefreshFailure? = null
                val page = try {
                    api.feed()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    failure = RefreshFailure.of(e)
                    null
                }
                // Picks answering a moment later still lead: a first read waits that moment for them (never longer).
                if (page != null && _state.value.phase == Phase.Loading) {
                    withTimeoutOrNull(picksGrace) { _state.first { it.picksSettled } }
                }
                _state.update { s ->
                    if (page == null) s.copy(latestSettled = true, latestFailed = true, latestFailure = failure).settled()
                    // A re-read starts the latest again from their first page: nothing fetched ahead of it, nothing awaited.
                    else s.copy(
                        latest = page.cards, next = page.next, ahead = null, waiting = false, loadingMore = false,
                        latestSettled = true, latestFailed = false, refreshFailure = null,
                    ).settled()
                }
                if (page != null) keep?.let { runCatching { it.saveLatest(page) } }
            }
            launch {
                val picks = picks()
                _state.update { s ->
                    // Picks that came are an answer: whatever a pull failed to bring before is behind it.
                    val answered = if (picks == null) s.copy(picksFailed = true) else s.copy(picksFailed = false, refreshFailure = null)
                    answered.withPicks(picks.orEmpty()).copy(picksSettled = true).settled()
                }
                if (picks != null) keep?.let { runCatching { it.savePicks(picks) } }
                if (picks == null) {
                    delay(retryPicksAfter)
                    val again = picks() ?: return@launch
                    if (run == generation) {
                        _state.update { s -> s.withPicks(again).copy(refreshFailure = null).settled() }
                        keep?.let { runCatching { it.savePicks(again) } }
                    }
                }
            }
        }
    }

    /**
     * 「顯示更多」: first shows the latest cards (already fetched) under the picks; after that, the
     * page fetched ahead, at once — or, tapped before it has come, waits for it ([State.waiting])
     * and shows it the moment it arrives.
     */
    fun showMore() {
        var fetch = false
        _state.update { s ->
            when {
                !s.latestVisible -> s.copy(showLatest = true).revealing(s.latestShownAfterShowing())
                s.ahead != null -> s.withAheadShown()
                s.next != null && !s.waiting -> {
                    fetch = !s.loadingMore
                    s.copy(waiting = true)
                }
                else -> s
            }
        }
        if (fetch) fetch()
    }

    /**
     * Fetches the page after what the feed holds, quietly, when none is ahead or on its way
     * ([State.wantsAhead]; the screen asks as the reader nears the feed's foot). It shows only on
     * a tap — at once if the tap came first ([State.waiting]). After a fetch that failed, the quiet
     * one waits [aheadRetryAfter] (a tap asks at once).
     */
    fun fetchAhead(now: Long = System.currentTimeMillis()) {
        if (now < quietAfter) return
        fetch()
    }

    private fun fetch() {
        val s = _state.value
        if (!s.latestVisible || s.ahead != null || s.loadingMore) return
        val next = s.next ?: return
        val run = generation
        _state.update { it.copy(loadingMore = true) }
        scope.launch {
            val page = try {
                api.feed(after = next)
            } catch (e: CancellationException) {
                if (run == generation) _state.update { it.copy(loadingMore = false) }
                throw e
            } catch (e: Exception) {
                null
            }
            // Read again meanwhile (a pull, a change of the reader's): that read's first page is what holds.
            if (run != generation) return@launch
            _state.update { st ->
                // Nothing came: the button can be tapped again (and the foot asks again a little later).
                if (page == null) {
                    quietAfter = System.currentTimeMillis() + aheadRetryAfter.inWholeMilliseconds
                    return@update st.copy(loadingMore = false, waiting = false)
                }
                val known = st.latest.mapTo(HashSet()) { it.id }
                val fresh = page.cards.filter { it.id !in known }
                val fetched = st.copy(loadingMore = false, next = page.next, refreshFailure = null, ahead = fresh.ifEmpty { null })
                when {
                    !st.waiting -> fetched
                    fresh.isNotEmpty() -> fetched.withAheadShown()
                    // A page of cards already shown: nothing to bring in yet — the next one, if any, is asked for.
                    else -> fetched.copy(waiting = page.next != null)
                }
            }
            if (_state.value.waiting) fetch()
        }
    }

    /** The page ahead joins the latest cards on screen. */
    private fun State.withAheadShown(): State {
        val page = ahead ?: return this
        val known = latest.mapTo(HashSet()) { it.id }
        val before = latestShown.size
        val shown = copy(latest = latest + page.filter { it.id !in known }, ahead = null, waiting = false)
        // Appended to the latest, so they are what the latest as shown gained at its end.
        return shown.revealing(shown.latestShown.drop(before))
    }

    /** The latest cards the feed would show under the picks once asked for. */
    private fun State.latestShownAfterShowing(): List<FeedCard> = copy(showLatest = true).latestShown

    /** Marks [brought] (a tap's cards, as shown) as the newest reveal. */
    private fun State.revealing(brought: List<FeedCard>): State {
        if (brought.isEmpty()) return this
        return copy(reveal = Reveal((reveal?.seq ?: 0) + 1, brought.mapTo(HashSet()) { it.id }))
    }

    private suspend fun picks(): List<FeedCard>? = try {
        recommended()
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        null
    }

    private fun State.withPicks(picks: List<FeedCard>): State = when {
        picks.isEmpty() -> this
        // Already leading the feed (a re-read): they stay where they are.
        recommended.isNotEmpty() -> copy(recommended = picks)
        // The latest cards are on screen: the picks go on top of them now, the latest staying as they are below.
        phase == Phase.Loaded && cards.isNotEmpty() -> copy(recommended = picks, showLatest = true, picksAbove = true)
        else -> copy(recommended = picks)
    }

    companion object {
        /** A feed read longer ago than this is read again when the screen (or the app) comes back to it. */
        val STALE_AFTER: Duration = 15.minutes

        /** The longest a [reload] keeps its caller waiting (the reads still finish behind it). */
        val RELOAD_LIMIT: Duration = 20.seconds
    }
}
