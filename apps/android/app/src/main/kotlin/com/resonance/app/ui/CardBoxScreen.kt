package com.resonance.app.ui

import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout

import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.foundation.ScrollState
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.BlendMode
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.CompositingStrategy
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import com.resonance.api.apis.DefaultApi.TabGetCardBox
import com.resonance.api.models.FeedCard
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CardPalette
import com.resonance.design.StoryCard
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OklchColor
import com.resonance.design.OrganicEmptyState
import com.resonance.design.EmptyAction
import com.resonance.design.OrganicIconButton
import com.resonance.design.OrganicButton
import com.resonance.design.ButtonVariant
import com.resonance.design.Skeleton
import com.resonance.design.plainClickable
import com.resonance.design.cardListLayout
import com.resonance.design.CardListLayout
import com.resonance.design.storyCardSkeletons
import com.resonance.design.WobRectShape
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.ApiCache
import com.resonance.kit.reading.FeedLoader
import com.resonance.kit.reading.RefreshFailure
import kotlinx.coroutines.CancellationException
import com.resonance.design.OrganicConfirmDialog
import com.resonance.kit.api.Trash
import com.resonance.kit.api.purgeInstant
import java.time.Instant
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Job
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.launch

/**
 * The card box's shelves as read, kept while the tab's root is (always, until sign-out): coming
 * back to a shelf shows it as it was. A change to a card (or the blocks) has every shelf read
 * again, the one in view at once, still showing meanwhile; so does a shelf read long ago. My own
 * shelves (published, private, drafts) are read together, in one request (GET /me/cardbox), so
 * moving between them shows each at once — the private and draft shelves always together, since
 * they are one 草稿 shelf on screen ([cardsOf], round 8 §1.1). The published shelf is also kept on
 * the device, so a cold start draws it at once. A refresh asked for by hand that brings nothing back
 * for the shelf on screen keeps it, and says why over that shelf only ([refreshFailure]).
 */
class CardBoxModel internal constructor(
    private val uid: String?,
    /** Reads shelves (GET /me/cardbox, or /me/cards for one of others' cards). */
    private val readShelves: suspend (List<TabGetCardBox>) -> Map<TabGetCardBox, List<FeedCard>>,
    /** Where the account's published shelf is kept between launches (null: nowhere). */
    private val kept: () -> ApiCache.Account?,
    scope: CoroutineScope?,
) : ViewModel() {
    constructor(session: Session) : this(session.uid, { session.reading.cardBox(it) }, { session.uid?.let(session::kept) }, null)

    /** A pull of [shelf] that brought nothing back while it showed, and why. */
    data class ShelfFailure(val shelf: TabGetCardBox, val failure: RefreshFailure)

    private val scope: CoroutineScope = scope ?: viewModelScope
    val shelves = mutableStateMapOf<TabGetCardBox, List<FeedCard>>()
    var failed by mutableStateOf(false)
        private set
    /** The last refresh by hand that brought nothing back for the shelf it was asked for while that showed: gone with its next answer, or another shelf shown. */
    var refreshFailure by mutableStateOf<ShelfFailure?>(null)
        private set
    /** The shelf on screen ([shelfShown]): a pull's failure is said only while the shelf it was for still is. */
    private var shown: TabGetCardBox? = null
    private val readAt = HashMap<TabGetCardBox, Long>()
    /** The read each shelf waits for: one that answers after a newer one began doesn't overwrite it. */
    private val readBy = HashMap<TabGetCardBox, Int>()
    private var reads = 0
    private var seenChanges: Int? = null

    init {
        if (uid != null) this.scope.launch {
            val kept = kept()?.published() ?: return@launch
            if (!shelves.containsKey(TabGetCardBox.published)) shelves[TabGetCardBox.published] = kept
        }
    }

    /** Why the last refresh of [shelf] by hand brought nothing back — said over that shelf only, while it shows. */
    fun failureOver(shelf: TabGetCardBox): RefreshFailure? =
        refreshFailure?.takeIf { it.shelf == shelf && shown == shelf && cardsOf(shelf) != null }?.failure

    /**
     * What [shelf] shows (null: not read yet): 草稿 ([TabGetCardBox.draft]) is the drafts and the
     * published private cards together ([draftShelf]); every other shelf as it was read.
     */
    fun cardsOf(shelf: TabGetCardBox): List<FeedCard>? =
        if (shelf == TabGetCardBox.draft) draftShelf(shelves[TabGetCardBox.`private`], shelves[TabGetCardBox.draft]) else shelves[shelf]

    /** [shelf] is the one on screen: what a refresh of the one before couldn't bring is no longer said. */
    fun shelfShown(shelf: TabGetCardBox) {
        shown = shelf
        if (refreshFailure?.shelf != shelf) refreshFailure = null
    }

    /**
     * A pull of [shelf] brought nothing back: said over it — unless another shelf was chosen while
     * the pull was on its way (that one isn't what failed, and coming back to this one later, the
     * line would speak of a pull long over).
     */
    private fun pullFailed(shelf: TabGetCardBox, failure: RefreshFailure) {
        if (shown == shelf) refreshFailure = ShelfFailure(shelf, failure)
    }

    /**
     * Reads `shelf` unless it was read since the last change (`changes`) and lately; `retry` always
     * does. One of my own shelves brings the others of them that are due too. Returns the read
     * (null: none was needed), for a pull to wait on. A `retry` while the shelf shows (a pull, the
     * Refresh action) that brings nothing back for it keeps it, and says why ([failureOver]).
     */
    fun refresh(shelf: TabGetCardBox, changes: Int, retry: Boolean = false, now: Long = System.currentTimeMillis()): Job? {
        if (changes != seenChanges) {
            seenChanges = changes
            readAt.clear()
        }
        val current = { s: TabGetCardBox -> readAt[s]?.let { now - it < FeedLoader.STALE_AFTER.inWholeMilliseconds } == true }
        if (!retry && shelvesOnScreen(shelf).all(current)) return null
        val asked = shelvesToRead(shelf, current)
        val read = ++reads
        val pulled = retry && cardsOf(shelf) != null
        for (s in asked) {
            readAt[s] = now
            readBy[s] = read
        }
        return scope.launch {
            try {
                val answered = readShelves(asked)
                failed = false
                for (s in asked) {
                    if (readBy[s] != read) continue
                    val cards = answered[s]
                    if (cards == null) {
                        // Not in the answer: asked for again when next shown.
                        readAt.remove(s)
                        if (pulled && s == shelf) pullFailed(shelf, RefreshFailure.Failed)
                        continue
                    }
                    shelves[s] = cards
                    if (refreshFailure?.shelf == s) refreshFailure = null
                    if (s == TabGetCardBox.published && uid != null) kept()?.savePublished(cards)
                }
            } catch (e: CancellationException) {
                throw e
            } catch (e: Exception) {
                failed = true
                for (s in asked) if (readBy[s] == read) readAt.remove(s)
                if (pulled && readBy[shelf] == read) pullFailed(shelf, RefreshFailure.of(e))
            }
        }
    }
}

/**
 * The shelves a read of `shelf` asks for: what it shows ([shelvesOnScreen]: 草稿 is the private and
 * draft shelves both), and — one of my own shelves — the others of them not read lately (`current`),
 * which the server reads side by side with it.
 */
internal fun shelvesToRead(shelf: TabGetCardBox, current: (TabGetCardBox) -> Boolean): List<TabGetCardBox> {
    val shown = shelvesOnScreen(shelf)
    return if (shelf !in OwnedShelves) shown
    else shown + OwnedShelves.filter { it !in shown && !current(it) }
}

/** The shelves the server answers for what [shelf] shows: 草稿 is the drafts and the published private cards. */
internal fun shelvesOnScreen(shelf: TabGetCardBox): List<TabGetCardBox> = when (shelf) {
    TabGetCardBox.draft, TabGetCardBox.`private` -> listOf(TabGetCardBox.draft, TabGetCardBox.`private`)
    else -> listOf(shelf)
}

/** The 草稿 shelf's most: the drafts' and the private cards' 40 each, cut to one shelf's. */
internal const val DRAFT_SHELF_MAX = 40

/**
 * The one 草稿 shelf (round 8 §1.1): the drafts and the published private cards together — every
 * card only its writer sees, finished or not — the most recently changed first ([FeedCard.editedAt];
 * a card without it by when it was published; one with neither last, as it came), at most
 * [DRAFT_SHELF_MAX]. Null until either has been read.
 */
internal fun draftShelf(private: List<FeedCard>?, drafts: List<FeedCard>?): List<FeedCard>? {
    if (private == null && drafts == null) return null
    return (drafts.orEmpty() + private.orEmpty())
        .distinctBy { it.id }
        .sortedWith(compareByDescending(nullsFirst()) { card: FeedCard -> instantOf(card.editedAt) ?: instantOf(card.publishedAt) })
        .take(DRAFT_SHELF_MAX)
}

/** An ISO 8601 time as the contract writes it (`Z` or an offset), or null. */
private fun instantOf(value: String?): Instant? = value?.let {
    runCatching { Instant.parse(it) }.getOrNull() ?: runCatching { java.time.OffsetDateTime.parse(it).toInstant() }.getOrNull()
}

/**
 * My card box (me/page.tsx): who I am, then my cards on six shelves — 已發布, 草稿 (drafts and
 * private cards, one shelf: round 8 §1.1), the cards I resonated with, cards linking to mine,
 * bookmarks, and the trash (垃圾桶, always last: what I deleted, for 30 days). The twin of iOS's
 * CardBoxScreen; [CardBoxModel] keeps the shelves.
 */
@Composable
fun CardBoxScreen(session: Session, open: (Route) -> Unit) {
    val profile by session.profile.collectAsStateWithLifecycle()
    val model = viewModel { CardBoxModel(session) }
    var chosen by rememberSaveable { mutableStateOf(TabGetCardBox.published) }
    // A shelf kept from before there was one 草稿 shelf (私人卡, restored with the process) opens 草稿.
    val shelf = shelfShown(chosen)
    // The writer, a card's ⋯ or a block changed something: every shelf may have moved, so they are read again.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    val shelves = model.shelves
    val failed = model.failed
    val scope = rememberCoroutineScope()
    // Another shelf: what a refresh of the one before couldn't bring isn't said over this one.
    LaunchedEffect(shelf) { model.shelfShown(shelf) }
    LaunchedEffect(shelf, changes, foregrounded) { model.refresh(shelf, changes) }
    val view = LocalView.current
    val layout = cardListLayout()

    // A phone's card box has 8 more under the bar's line, and 8 more either side of the shelves (round 5 E2).
    val cls = LocalWindowLayout.current.cls
    val air = CardBoxAir.of(cls)
    // 清空垃圾桶's question (asked over the shelf, whatever has scrolled), and whether its last try failed.
    var emptying by remember { mutableStateOf<Emptying?>(null) }
    TabScreen(
        L10n.App.Nav.me,
        titleInBar = true,
        phoneExtraTop = air.extraTop,
        // Pulled down: who I am and the shelf in view, read again now from the server rather than the HTTP cache.
        // Nothing back for the shelf: it stays, and says why — read out only while that shelf is still the one
        // on screen (another chosen meanwhile, the failure isn't about what is shown).
        onRefresh = {
            session.readAfresh()
            val asked = shelf
            coroutineScope {
                launch { session.loadMe() }
                model.refresh(asked, changes, retry = true)?.join()
            }
            if (shelf == asked) model.failureOver(asked)?.let { view.announce(it.message) }
        },
    ) {
        item {
            when (val p = profile) {
                is Session.Profile.Loaded -> Row(Modifier.padding(horizontal = layout.headerInset), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Box(Modifier.clickable(onClickLabel = L10n.Me.viewPublicProfile) { open(Route.Author(p.me.handle)) }) {
                        HandDrawnAvatar(p.me.initials, p.me.avatarUrl, OklchColor.parse(p.me.accentColor) ?: Tokens.TerracottaLight, 72.dp, seedFromString(p.me.id).toDouble())
                    }
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        BasicText(p.me.handle, style = AppFonts.heading(24f))
                        BasicText(p.me.bio ?: L10n.Me.bioEmpty, style = AppFonts.body(14f, color = Tokens.TextMuted))
                    }
                    // The identity row ends on the way to the profile settings. A phone: the person glyph alone (the pen
                    // means write), bare. A tablet has the room to say what it is, as the web's wide page does: the
                    // labelled tonal button.
                    if (LocalWindowLayout.current.cls == LayoutClass.Compact) {
                        OrganicIconButton(IconName.User, L10n.Me.editProfile, size = 20.dp) { open(Route.Settings) }
                    } else {
                        OrganicButton(L10n.Me.editProfile, variant = ButtonVariant.Tonal, icon = IconName.User, small = true) { open(Route.Settings) }
                    }
                }
                Session.Profile.Missing -> OrganicEmptyState(L10n.Auth.stepHandle)
                Session.Profile.Failed -> OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { scope.launch { session.loadMe() } }, action = EmptyAction.Outline)
                // Still loading: the identity row's shape in shimmering blocks.
                else -> Row(Modifier.padding(horizontal = layout.headerInset), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(16.dp)) {
                    Skeleton(height = 72.dp, circle = true)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Skeleton(Modifier.width(140.dp), height = 24.dp)
                        Skeleton(Modifier.fillMaxWidth(0.7f), height = 14.dp)
                    }
                }
            }
        }
        item { ShelfTabs(shelf, layout.headerInset, air, openMap = { open(Route.ThoughtMap) }) { chosen = it } }
        refreshNote(model.failureOver(shelf))
        val cards = model.cardsOf(shelf)
        when {
            cards == null && failed -> item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { model.refresh(shelf, changes, retry = true) }, action = EmptyAction.Outline) }
            cards == null -> storyCardSkeletons(if (layout.isGrid) layout.columns * 2 else 6, layout = layout)
            shelf == TabGetCardBox.trash -> trashShelf(cards, open, layout, compact = cls == LayoutClass.Compact) { emptying = Emptying.Asking }
            // An empty shelf: the shared empty state (its own words as the title; the bookmarks' as its line),
            // and the empty published shelf points at the first story (ux §4).
            cards.isEmpty() -> item {
                val bookmarks = shelf == TabGetCardBox.bookmarks
                OrganicEmptyState(
                    message = if (bookmarks) emptyText(shelf) else null,
                    title = if (bookmarks) null else emptyText(shelf),
                    actionTitle = L10n.Me.emptyPublishedCta.takeIf { shelf == TabGetCardBox.published },
                    onAction = { open(Route.Write()) },
                    icon = if (bookmarks) IconName.Bookmark else IconName.Cards,
                    seed = if (bookmarks) 59.0 else 53.0,
                    fill = true,
                )
            }
            // The linked shelf lists the pared-back cards, as the web's MiniCardGrid does.
            shelf == TabGetCardBox.linked -> miniCards(cards, open, keyPrefix = "linked:")
            shelf in OwnedShelves -> managedCards(session, cards, open, shelf, layout = layout)
            else -> storyCards(cards, open, layout = layout)
        }
    }
    emptying?.let { state -> EmptyTrashDialog(state) { emptying = it } }
}

/** 清空垃圾桶's question: asked, working, or asked again after a try that failed. */
internal enum class Emptying { Asking, Busy, Failed }

/**
 * 清空垃圾桶？ · 垃圾桶裡的卡片都會永久刪除，無法復原 · 先留著 | 清空垃圾桶, the verb red. It stays,
 * working, while the trash is emptied page by page; done, the shelf reads again and shows it empty.
 * A failure is read again first ([TrashCenter.emptyTrash]): a trash found empty closes the question
 * as if it had worked (the shelf its empty state); one still holding cards keeps it, saying so with
 * its buttons, until 先留著.
 */
@Composable
private fun EmptyTrashDialog(state: Emptying, set: (Emptying?) -> Unit) {
    val trash = LocalTrash.current ?: return
    OrganicConfirmDialog(
        title = L10n.Me.Actions.emptyTrashTitle,
        body = L10n.Me.Actions.emptyTrashBody,
        cancelLabel = L10n.Me.Actions.deleteCancel,
        confirmLabel = L10n.Me.Actions.emptyTrash,
        onCancel = { set(null) },
        onConfirm = {
            if (state != Emptying.Busy) {
                set(Emptying.Busy)
                trash.launch {
                    try {
                        emptyTrash()
                        set(null)
                    } catch (e: CancellationException) {
                        throw e
                    } catch (e: Exception) {
                        set(Emptying.Failed)
                    }
                }
            }
        },
        busy = state == Emptying.Busy,
        seed = 67.0,
        error = if (state == Emptying.Failed) L10n.Safety.actionError else null,
        destructive = true,
    )
}

/**
 * The trash shelf (TrashShelf.tsx): what I deleted, the latest in first — never one past its days,
 * which is gone to me too. Over it how long cards wait (and, while an anonymous card is here, that
 * its notes went with it) with 清空垃圾桶; each card says where it came from and when it goes
 * ([TrashWords]) and wears the trash's ⋯ (還原 · 永久刪除). A published card opens its page (its
 * trash banner), a draft the writer (its trashed notice) — never prefilled: a summary isn't the card.
 * Empty, the trash's own empty state.
 */
private fun LazyListScope.trashShelf(cards: List<FeedCard>, open: (Route) -> Unit, layout: CardListLayout, compact: Boolean, onEmpty: () -> Unit) {
    val now = Instant.now()
    val shown = inTrash(cards, now)
    if (shown.isEmpty()) {
        item {
            OrganicEmptyState(
                title = L10n.Me.emptyTrash, message = L10n.Me.emptyTrashLine(Trash.DAYS),
                icon = IconName.Trash, seed = 61.0, fill = true,
            )
        }
        return
    }
    item { TrashHeader(anonymousHere = shown.any { it.anonymous && it.publishedAt != null }, inset = layout.headerInset, compact = compact, onEmpty = onEmpty) }
    val tap: (FeedCard) -> Route = ::trashTap
    val palettes = cardFamilies(shown)
    val caption: @Composable (FeedCard) -> Unit = { card ->
        BasicText(TrashWords.caption(card, now), style = AppFonts.body(12.5f, lineHeight = 1.4f, color = Tokens.TextMuted), modifier = Modifier.padding(top = 8.dp))
    }
    if (layout.isGrid) return borderedCards(
        shown, open, null, false, layout, tap, keyPrefix = "trash:",
        overlay = { card, i ->
            val hue = CardPalette.of(palettes[i]).hue
            Box(Modifier.align(Alignment.TopEnd).padding(top = 14.dp - 3.dp, end = 14.dp - 3.dp)) {
                TrashActionsMenu(TrashRef(card.id, card.title), seed = hue, hue = hue)
            }
        },
        caption = caption,
    )
    itemsIndexed(shown, key = { _, c -> "trash:${c.id}" }) { i, card ->
        val hue = CardPalette.of(palettes[i]).hue
        Column(Modifier.fillMaxWidth()) {
            Box {
                StoryCard(card.story(), i, i == shown.lastIndex, Modifier.plainClickable { open(tap(card)) }, inset = layout.inset, palette = palettes[i])
                Box(Modifier.align(Alignment.TopEnd).padding(top = 14.dp - 3.dp, end = layout.inset - 4.dp - 3.dp)) {
                    TrashActionsMenu(TrashRef(card.id, card.title), seed = hue, hue = hue)
                }
            }
            Box(Modifier.padding(start = layout.inset, end = layout.inset, bottom = 8.dp)) { caption(card) }
        }
    }
}

/** What the trash shelf lists: the cards in the trash, never one past its days (gone to its owner too, before the server's purge reaches it). */
internal fun inTrash(cards: List<FeedCard>, now: Instant = Instant.now()): List<FeedCard> =
    cards.filter { c -> c.purgeInstant?.let { !Trash.expired(it, now) } ?: true }

/** Where a card in the trash opens: a published one its page (the banner), a draft the writer (its notice). */
internal fun trashTap(card: FeedCard): Route = if (card.publishedAt != null) Route.Card(card.routeKey) else Route.Write(cardId = card.id)

/**
 * The trash shelf's head: 卡片會在垃圾桶保留 30 天，之後永久刪除 (and, while an anonymous card is here,
 * 匿名卡片移到垃圾桶時，留在上面的紙條會一併刪除) at 13 muted, and 清空垃圾桶 in the tonal red at its
 * end — on a phone under the lines, at their start. It only opens a question, which is red.
 */
@Composable
private fun TrashHeader(anonymousHere: Boolean, inset: Dp, compact: Boolean, onEmpty: () -> Unit) {
    val lines: @Composable () -> Unit = {
        Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
            BasicText(L10n.Me.trashHint(Trash.DAYS), style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted))
            if (anonymousHere) BasicText(L10n.Me.trashAnonymousNotes, style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted))
        }
    }
    val empty: @Composable () -> Unit = {
        OrganicButton(L10n.Me.Actions.emptyTrash, variant = ButtonVariant.DangerTonal, small = true, onClick = onEmpty)
    }
    if (compact) Column(Modifier.padding(horizontal = inset).padding(bottom = 20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        lines()
        empty()
    } else Row(Modifier.padding(horizontal = inset).padding(bottom = 20.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        Box(Modifier.weight(1f)) { lines() }
        empty()
    }
}

/** The shelves of my own cards (OWNED_TABS): each card gets its ⋯. Read together, in this order. */
private val OwnedShelves = listOf(TabGetCardBox.published, TabGetCardBox.`private`, TabGetCardBox.draft)

/**
 * Where one of my own cards opens from [shelf]: on 草稿, every card opens the writer — a draft
 * resumes, a published private card is edited there, where it is published from (round 8 §1, the
 * web's /write/{id}); on 已發布, its page. A draft has no page, wherever it is.
 */
internal fun managedTap(card: FeedCard, shelf: TabGetCardBox): Route = when {
    shelf == TabGetCardBox.draft || shelf == TabGetCardBox.`private` || card.publishedAt == null -> Route.Write(cardId = card.id)
    else -> Route.Card(card.routeKey, card)
}

/** The shelf a choice shows: one kept from before 草稿 was one shelf (`private`) is 草稿. */
internal fun shelfShown(chosen: TabGetCardBox): TabGetCardBox = if (chosen == TabGetCardBox.`private`) TabGetCardBox.draft else chosen

/**
 * My own cards (ProfileTabs' managed shelves): each with the owner's ⋯ over
 * its top-right corner. An anonymous one wears the anonymous byline exactly
 * as everyone else sees it ([story]) — that is its mark here, no badge. On
 * the 草稿 shelf a tap opens the writer, a published private card's too; on
 * 已發布 a card's page ([managedTap]).
 */
private fun LazyListScope.managedCards(session: Session, cards: List<FeedCard>, open: (Route) -> Unit, shelf: TabGetCardBox, layout: CardListLayout) {
    val tap: (FeedCard) -> Route = { managedTap(it, shelf) }
    val palettes = cardFamilies(cards)
    if (layout.isGrid) return borderedCards(cards, open, null, false, layout, tap, overlay = { card, i ->
        val hue = CardPalette.of(palettes[i]).hue
        // 14 in from the card's corner, as on a band; the trigger's 44dp hit box reaches 3 past the chip.
        Box(Modifier.align(Alignment.TopEnd).padding(top = 14.dp - 3.dp, end = 14.dp - 3.dp)) {
            CardMenu(session, card, open, hue)
        }
    })
    itemsIndexed(cards, key = { _, c -> c.id }) { i, card ->
        val hue = CardPalette.of(palettes[i]).hue
        Column(Modifier.fillMaxWidth()) {
            Box {
                StoryCard(card.story(), i, i == cards.lastIndex, Modifier.plainClickable { open(tap(card)) }, inset = layout.inset, palette = palettes[i])
                // The chip 14 in from the card's corner (the card's box sits 20 in from the screen, or
                // its column's inset less the band's 18); the trigger's 44dp hit box reaches 3 past the 38dp chip.
                Box(Modifier.align(Alignment.TopEnd).padding(top = 14.dp - 3.dp, end = layout.inset - 4.dp - 3.dp)) {
                    CardMenu(session, card, open, hue)
                }
            }
        }
    }
}

/**
 * The owner's ⋯ on one of my shelved cards: 刪除 moves it to the trash with the undo toast — asking
 * first only for a published, public, named resonance (whose original's byline the shelf doesn't
 * know: looked up when it matters).
 */
@Composable
private fun CardMenu(session: Session, card: FeedCard, open: (Route) -> Unit, hue: Double) {
    CardActionsMenu(
        session, card.id, card.visibility.value, open, seed = hue, hue = hue, referenceCardId = card.referenceCardId,
        published = card.publishedAt != null, anonymous = card.anonymous, title = card.title,
    )
}

/**
 * My Card Box's air (round 5 E2): on a phone 8 more under the bar's line than the other tabs (in
 * [TabScreen]), and 8 more above and below the shelves' strip; a tablet's page starts as every
 * tablet page does (32 under the header's pen line) and keeps the strip's 20 / 28.
 */
internal data class CardBoxAir(val extraTop: Dp, val shelvesTop: Dp, val shelvesBottom: Dp) {
    companion object {
        fun of(cls: LayoutClass): CardBoxAir =
            if (cls == LayoutClass.Compact) CardBoxAir(8.dp, 28.dp, 36.dp) else CardBoxAir(0.dp, 20.dp, 28.dp)
    }
}

/** The shelves in the strip's order (OrganicTabs'), the trash always last before the thought map: no 私人卡 shelf (it is 草稿's). */
internal val ShelfOrder = listOf(
    TabGetCardBox.published, TabGetCardBox.draft, TabGetCardBox.resonated, TabGetCardBox.linked,
    TabGetCardBox.bookmarks, TabGetCardBox.trash,
)

/**
 * The shelves as OrganicTabs' scrollable `surface` strip: the chosen one on a
 * hand-drawn wash — a light terracotta fill, R 12, its wobble sized to the
 * tab, seed 23 + the key's length × 7 as on the web. The strip is no frame
 * and the tab is one of its own, so the wash marks it without a pen line.
 */
@Composable
private fun ShelfTabs(selection: TabGetCardBox, edge: Dp, air: CardBoxAir, openMap: () -> Unit, onSelect: (TabGetCardBox) -> Unit) {
    val haptic = LocalHapticFeedback.current
    val scroll = rememberScrollState()
    Row(
        Modifier.fadingEdges(scroll).horizontalScroll(scroll).padding(horizontal = edge, vertical = 7.dp).padding(top = air.shelvesTop, bottom = air.shelvesBottom),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ShelfOrder.forEach { s ->
            val selected = s == selection
            BasicText(
                shelfTitle(s),
                style = AppFonts.body(14f, if (selected) 600 else 500, lineHeight = 1.3f, color = if (selected) Tokens.Terracotta else Tokens.TextMuted),
                modifier = Modifier
                    .drawWithCache {
                        val o = WobRectShape(12.0, 23.0 + s.value.length * 7).createOutline(size, layoutDirection, this)
                        onDrawBehind {
                            if (selected) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.55f))
                        }
                    }
                    .semantics { this.selected = selected }
                    .plainClickable(role = Role.Tab) {
                        haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        onSelect(s)
                    }
                    .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 14.dp),
            )
        }
        // The thought map is the strip's last tab; it opens its own screen (OrganicTabs' thoughtMapHref).
        BasicText(
            L10n.Me.Tabs.thoughtMap,
            style = AppFonts.body(14f, 500, lineHeight = 1.3f, color = Tokens.TextMuted),
            modifier = Modifier
                .plainClickable(role = Role.Button, onClick = openMap)
                .padding(start = 16.dp, end = 16.dp, top = 10.dp, bottom = 14.dp),
        )
    }
}

private fun shelfTitle(s: TabGetCardBox) = when (s) {
    TabGetCardBox.published -> L10n.Me.Tabs.published
    TabGetCardBox.`private` -> L10n.Me.Tabs.private
    TabGetCardBox.draft -> L10n.Me.Tabs.draft
    TabGetCardBox.resonated -> L10n.Me.Tabs.resonated
    TabGetCardBox.linked -> L10n.Me.Tabs.linked
    TabGetCardBox.bookmarks -> L10n.Me.Tabs.bookmarks
    TabGetCardBox.trash -> L10n.Me.Tabs.trash
    // The generated client's stand-in for a value it doesn't know (an answer from a newer server); never a shelf here.
    TabGetCardBox.unknownDefaultOpenApi -> ""
}

private fun emptyText(s: TabGetCardBox) = when (s) {
    TabGetCardBox.published -> L10n.Me.emptyPublished
    TabGetCardBox.`private` -> L10n.Me.emptyPrivate
    TabGetCardBox.draft -> L10n.Me.emptyDraft
    TabGetCardBox.resonated -> L10n.Me.emptyResonated
    TabGetCardBox.linked -> L10n.Me.emptyLinked
    TabGetCardBox.bookmarks -> L10n.Me.emptyBookmarks
    TabGetCardBox.trash -> L10n.Me.emptyTrash
    TabGetCardBox.unknownDefaultOpenApi -> ""
}
