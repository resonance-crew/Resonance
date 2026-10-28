package com.resonance.app.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.withFrameNanos
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.resonance.app.AppearanceStore
import com.resonance.app.DebugLaunch
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.CompositionLocalProvider
import com.resonance.design.LocalMascotMarks
import com.resonance.design.LocalWindowLayout
import com.resonance.design.MascotMarks
import com.resonance.design.TabBarHeight
import com.resonance.design.brandBarHeight
import com.resonance.design.mascotMark
import com.resonance.app.Session
import com.resonance.design.CardPalette
import com.resonance.design.FeedEndMark
import com.resonance.design.FeedMoreButton
import com.resonance.design.EmptyAction
import com.resonance.design.HeaderEdgeHeight
import com.resonance.design.LocalToasts
import com.resonance.design.OrganicEmptyState
import com.resonance.design.Toasts
import com.resonance.design.cardListLayout
import com.resonance.design.generated.IconName
import com.resonance.design.prefersReducedMotion
import com.resonance.design.storyCardSkeletons
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.FeedLoader
import com.resonance.kit.reading.withoutAuthors
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch

/**
 * The feed's page state: kept while the feed's tab root is (always, until sign-out), and through a
 * rotation. The reader's last feed is kept on the device too, so a cold start draws it at once.
 */
class FeedModel(session: Session) : ViewModel() {
    val feed = DebugLaunch.feedPicks(session.reading)?.let { standIns ->
        // Stand-ins are kept nowhere (nor is a kept feed drawn first): each launch is a cold load.
        FeedLoader(session.reading, viewModelScope, recommended = standIns)
    } ?: FeedLoader(session.reading, viewModelScope, storeFor = { uid -> session.kept(uid) })
}

/**
 * The home feed as the web runs it (home/page.tsx): today's picks first;
 * 「顯示更多」 shows the latest public cards deduped against the picks. After
 * that it shows what is already here (round 19): the next page is fetched
 * quietly as the reader nears the feed's foot (within a screen and a half of
 * it), a tap shows it at once — the cards it brought rising into place — and
 * only a tap before it has come makes the button busy until it does.
 * Neither waits for the other: the latest cards show as soon as they arrive,
 * and picks that come after them go on top of them at once — read from the
 * top, the feed then starts with the first of them; scrolled into it, what is
 * being read stays where it is, the picks above it, and the shell's toast says
 * 今天的推薦來了 · 往上看 (a tap takes the feed to its top). The recommender's reasons
 * stay hidden, as on the web. [FeedLoader] holds it all (in [FeedModel]), so
 * coming back finds the feed as it was, scrolled where it was left, without
 * reading it again.
 */
@Composable
fun FeedScreen(session: Session, open: (Route) -> Unit) {
    val feed = viewModel { FeedModel(session) }.feed
    val state by feed.state.collectAsStateWithLifecycle()
    // Your own card written, published or re-shelved, or a block: the feed reads again (keeping what it shows meanwhile);
    // so does a feed read long ago, when the app comes back to it.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    LaunchedEffect(changes, foregrounded) { feed.refresh(session.uid, changes) }
    val list = rememberLazyListState()
    // Never a card by someone blocked — not even one kept from before the block.
    val blocked by session.blocked.collectAsStateWithLifecycle()
    val cards = remember(state.cards, blocked) { state.cards.withoutAuthors(blocked) }
    // Picks that came on top of the latest cards are a run of their own (rows and colours), so the latest keep theirs.
    val picksAbove = remember(state, blocked) { if (state.picksAbove) state.picksShown.withoutAuthors(blocked).map { it.id } else emptyList() }
    val leading = picksAbove.size
    val leadingCard = cards.firstOrNull()?.id
    val head = remember { FeedHead() }
    val toasts = LocalToasts.current
    val scope = rememberCoroutineScope()
    val reduced = LocalContext.current.prefersReducedMotion()
    // The toast saying today's picks went on top, out of sight (its id while it may show).
    var picksToast by remember { mutableStateOf<Long?>(null) }
    // Before the list takes the new cards in (it keeps its first item by key, so cards put above it land out of sight):
    // a reader at the very top sees the feed's new head; one scrolled into it keeps what they are reading, and is
    // told when that head is today's picks — 往上看 takes them up to it.
    SideEffect {
        when (head.next(leadingCard, picksAbove, list.atVeryTop())) {
            FeedHead.Move.ShowTop -> list.requestScrollToItem(0)
            FeedHead.Move.OfferPicks -> picksToast = toasts.show(
                L10n.Home.Recommended.arrived,
                action = Toasts.Action(
                    L10n.Home.Recommended.arrivedAction,
                    "${L10n.Home.Recommended.arrived} · ${L10n.Home.Recommended.arrivedAction}",
                    IconName.ArrowUp,
                ) { scope.launch { if (reduced) list.scrollToItem(0) else list.animateScrollToItem(0) } },
            )
            FeedHead.Move.None -> {}
        }
    }
    // Reaching the top by hand while it shows takes it down: its job is done. Leaving the feed takes it too.
    LaunchedEffect(picksToast) {
        val id = picksToast ?: return@LaunchedEffect
        snapshotFlow { list.atVeryTop() }.first { it }
        toasts.dismiss(id)
        picksToast = null
    }
    DisposableEffect(toasts) { onDispose { picksToast?.let(toasts::dismiss) } }
    // The cards the last 「顯示更多」 brought in rise into place (not under reduced motion). Kept with the
    // reveal's own time, so a rotation or a return to the tab doesn't play it again.
    val reveal = state.reveal
    val entrance = remember(reveal, reduced) {
        reveal?.takeIf { !reduced }?.let { r ->
            cards.indexOfFirst { it.id in r.ids }.takeIf { it >= 0 }?.let { CardEntrance(it, r.at) }
        }
    }
    // Nearing the feed's foot: the next page is fetched ahead, quietly (one at most; FeedLoader keeps to it).
    // Asked again after each scroll and after each change of what the feed wants — read a frame later, once the
    // list has laid out what a tap brought in.
    LaunchedEffect(list, feed) {
        combine(
            snapshotFlow { list.firstVisibleItemIndex to list.firstVisibleItemScrollOffset },
            feed.state.map { it.wantsAhead }.distinctUntilChanged(),
        ) { _, wants -> wants }.collect { wants ->
            if (!wants) return@collect
            withFrameNanos {}
            if (list.nearFoot()) feed.fetchAhead()
        }
    }
    val view = LocalView.current
    // Bands on a phone, a centred column of them on a medium window, the bordered grid on an expanded one.
    val layout = cardListLayout()

    // 外觀's 小精靈 (round 19): the paper puppets' island over the feed, only while it is on.
    val mascots by remember { AppearanceStore.shared.state.map { it.mascots } }.collectAsStateWithLifecycle(AppearanceStore.shared.state.value.mascots)
    val marks = remember(mascots) { if (mascots) MascotMarks() else null }
    val barTop = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + brandBarHeight() + HeaderEdgeHeight
    val tabsBelow = if (LocalWindowLayout.current.topTabs) 0.dp else TabBarHeight
    val footInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding() + tabsBelow

    // No page title: the brand bar is the feed's only heading, and the first card starts right under its wave.
    CompositionLocalProvider(LocalMascotMarks provides marks) {
    TabScreen(
        null,
        list = list,
        overlay = marks?.let { m -> { frame -> MascotOverlay(list, m, insetTop = barTop, insetBottom = footInset, modifier = frame) } },
        // Reading down the feed, the phone's tab bar slides away (round 16 §2).
        hidesTabBar = true,
        // Pulled down: read again now, from the server rather than the HTTP cache. Nothing back: the feed stays, and says why.
        onRefresh = {
            session.readAfresh()
            feed.reload()?.let { view.announce(it.message) }
        },
        refreshEnabled = state.phase != FeedLoader.Phase.Loading,
        // A band starts at the bar's line (the first card, or its skeleton): the pull's gap wears its paper.
        // Not over the bordered grid, nor when a note parts the first card from the bar.
        pullPaper = when {
            layout.isGrid -> null
            state.phase == FeedLoader.Phase.Loading -> CardPalette(null, 0).interior
            state.phase == FeedLoader.Phase.Loaded && cards.isNotEmpty() && state.refreshFailure == null ->
                CardPalette.of(cardFamilies(cards.take(1))[0]).interior
            else -> null
        },
    ) {
        when (state.phase) {
            // The web's FeedSkeleton: the real cards' bands with shimmering blocks, so nothing jumps on arrival.
            FeedLoader.Phase.Loading -> storyCardSkeletons(if (layout.isGrid) layout.columns * 3 else 6, firstUnderBar = true, layout = layout)
            FeedLoader.Phase.Failed -> item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { feed.load() }, action = EmptyAction.Outline) }
            FeedLoader.Phase.Loaded -> {
                if (cards.isEmpty()) {
                    item {
                        // Under the bar's band, as the first card would be.
                        OrganicEmptyState(
                            L10n.Home.Empty.subtitle, L10n.Home.Empty.cta, { open(Route.Write()) }, title = L10n.Home.Empty.title,
                            modifier = Modifier.padding(top = HeaderEdgeHeight),
                        )
                    }
                } else {
                    refreshNote(state.refreshFailure, underBar = true)
                    // A note over the cards parts the first one from the bar: it keeps its own top rule then.
                    storyCards(cards, open, firstUnderBar = state.refreshFailure == null, layout = layout, leading = leading, entering = entrance)
                    item(key = FEED_FOOT) {
                        Column(Modifier.fillMaxWidth().padding(top = 48.dp, start = 20.dp, end = 20.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                            // While more can load, only the way on (no sentence); the end mark in its place once nothing more can.
                            if (state.canLoadMore) {
                                FeedMoreButton(state.waiting, Modifier.mascotMark("more")) { feed.showMore() }
                            } else if (state.latestVisible) {
                                FeedEndMark(L10n.Home.feedEnd, Modifier.mascotMark("end"))
                            }
                        }
                    }
                }
            }
        }
    }
    }
}

/**
 * What the feed does as its head changes (round 6; round 7 §2): a reader at the very top is shown the
 * new head; one scrolled into the feed keeps what they are reading where it is — and when what went
 * on top, out of their sight, is today's picks (picks the feed didn't hold above the latest before),
 * the shell's toast says so (今天的推薦來了 · 往上看). A head that changes for anything else (a re-read's
 * newer latest card) says nothing.
 */
internal class FeedHead {
    enum class Move { None, ShowTop, OfferPicks }

    private val lead = LeadingCard()
    private var above: Set<String> = emptySet()

    /** The feed now leads with [leadingCard]; [picksAbove]: the picks it shows on top of the latest (none when they lead it). */
    fun next(leadingCard: String?, picksAbove: List<String>, atTop: Boolean): Move {
        val changed = lead.changedTo(leadingCard)
        val arrived = picksAbove.any { it !in above }
        above = picksAbove.toSet()
        return when {
            !changed -> Move.None
            atTop -> Move.ShowTop
            arrived -> Move.OfferPicks
            else -> Move.None
        }
    }
}

/** The card the feed last led with, kept across recompositions: says when another one takes the head. */
internal class LeadingCard {
    private var id: String? = null

    /** Whether the feed's head is now [next] after another card led it (not the first cards, nor no card). */
    fun changedTo(next: String?): Boolean {
        val before = id
        id = next
        return before != null && next != null && next != before
    }
}

/** The feed's foot (the way on, or the end mark): the list's last item. */
private const val FEED_FOOT = "feed-foot"

/**
 * Whether the feed's foot is within a screen and a half below the list's end (or in view): the web's
 * IntersectionObserver with a 150 % bottom margin. Out of view, the rows between are taken at the
 * visible rows' average height.
 */
private fun LazyListState.nearFoot(): Boolean {
    val info = layoutInfo
    val items = info.visibleItemsInfo
    if (items.isEmpty()) return false
    val reach = (info.viewportEndOffset - info.viewportStartOffset) * 1.5f
    if (items.any { it.key == FEED_FOOT }) return true
    val last = items.last()
    val between = (info.totalItemsCount - 1 - last.index - 1).coerceAtLeast(0)
    val average = items.sumOf { it.size } / items.size.toFloat()
    return (last.offset + last.size - info.viewportEndOffset) + between * average <= reach
}

/** At the very top of the list: its first item showing from its own top (not a pixel scrolled). */
private fun LazyListState.atVeryTop(): Boolean = firstVisibleItemIndex == 0 && firstVisibleItemScrollOffset == 0
