package com.resonance.app.ui

import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntOffset
import com.resonance.design.CardPageColumns
import com.resonance.design.StoryAnchors
import com.resonance.design.StoryToc
import com.resonance.design.TocHeading
import com.resonance.design.WithSkeletonHue
import androidx.compose.foundation.gestures.Orientation
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.gestures.scrollBy
import androidx.compose.foundation.gestures.scrollable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onPlaced
import com.resonance.design.LocalWindowLayout
import com.resonance.design.cardListLayout

import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOut
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Stable
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import com.resonance.design.scrolledUnderBar
import com.resonance.design.LocalHeaderChrome
import androidx.compose.ui.unit.Dp
import com.resonance.design.prefersReducedMotion
import com.resonance.design.readingProgress
import com.resonance.design.LayoutClass
import com.resonance.design.storyHeadGap
import com.resonance.design.StoryMetaLine
import androidx.compose.runtime.saveable.rememberSaveable
import com.resonance.design.ButtonVariant
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIconButton
import com.resonance.kit.api.isTrashed
import kotlinx.coroutines.flow.collectLatest
import kotlin.math.abs
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.text.BasicText
import com.resonance.design.OrganicIcon
import com.resonance.design.SquareFlag
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.ViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.compose.foundation.layout.size
import com.resonance.api.models.FeedCard
import com.resonance.app.SafetyService
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CardDetailSkeleton
import com.resonance.design.CssText
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicImage
import com.resonance.design.OrganicInlineBar
import com.resonance.design.MenuTrigger
import com.resonance.design.OrganicMenuChip
import com.resonance.design.inlineBarTop
import com.resonance.design.StoryLinkCards
import com.resonance.design.StoryLinkCardFrame
import com.resonance.design.StoryLinkCardLook
import com.resonance.design.StoryMarkdown
import com.resonance.design.StorySkeleton
import com.resonance.design.StoryTitle
import com.resonance.design.StoryType
import com.resonance.design.ReadingTextScale
import com.resonance.design.CappedTextScale
import com.resonance.design.RichCssText
import com.resonance.design.ProseStyle
import com.resonance.kit.story.InlineRun
import com.resonance.kit.story.StoryScripts
import androidx.compose.foundation.layout.heightIn
import com.resonance.design.TagPill
import com.resonance.design.LocalToasts
import com.resonance.design.OrganicConfirmDialog
import com.resonance.app.ui.share.CardSharing
import com.resonance.app.ui.share.ShareCardRenderer
import com.resonance.app.ui.share.ShareCardRendererHost
import com.resonance.app.ui.share.ShareFeedback
import com.resonance.app.ui.share.ShareLinks
import com.resonance.design.cream
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.api.ApiFailure
import com.resonance.kit.chat.Linkify
import com.resonance.kit.l10n.L10n
import com.resonance.kit.reading.FeedLoader
import com.resonance.kit.reading.cardKeyOf
import com.resonance.kit.reading.embedFor
import com.resonance.kit.story.StoryBlock
import com.resonance.kit.story.StoryLink
import com.resonance.kit.story.StoryLinks
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch

/**
 * A card page's state, kept while the page is on its stack: back from what it opened (an author,
 * another card) finds it as it was, without reading it again — unless this card, a resonance to
 * it or a block changed meanwhile, or it was read long ago.
 */
class CardPageModel(private val session: Session, private val key: String, preview: FeedCard?) : ViewModel() {
    private val cached = session.cardCache.page(key)
    /** The card as a list drew it (or as last seen), drawn while the page is read. */
    val placeholder: FeedCard? = preview ?: session.cardCache.preview(key)
    var phase by mutableStateOf(if (cached != null) "loaded" else "loading")
        private set
    var detail by mutableStateOf(cached?.detail)
        private set
    // Parsed once with the page (off the main thread, by the loader), never during this page's first frame.
    var blocks by mutableStateOf(cached?.blocks ?: emptyList())
        private set
    /** The story's script and language ([CardCache.Page.storyText]), set with [detail]. */
    var storyText by mutableStateOf(cached?.storyText)
        private set
    var resonances by mutableStateOf(cached?.resonances.orEmpty())
        private set
    var related by mutableStateOf(cached?.related.orEmpty())
        private set
    var linked by mutableStateOf(cached?.links.orEmpty())
        private set
    var embeds by mutableStateOf(cached?.embeds.orEmpty())
        private set
    /** The previews of the story's standalone links, by the key a paragraph names them by ([StoryLinks]). */
    var linkPreviews by mutableStateOf(cached?.let { StoryLinks.previews(it.detail.linkPreviews, session.config.origin) }.orEmpty())
        private set
    private var readFor: Int? = null
    private var readAt = 0L
    private var reading: Job? = null

    /**
     * Reads the card unless what the page holds is current ([isCurrent]: read lately, and no change
     * since that concerns it — `lastChange` is the latest of `changes`); `retry` always does.
     */
    fun refresh(changes: Int, lastChange: Session.CardChange?, retry: Boolean = false, now: Long = System.currentTimeMillis()) {
        val current = isCurrent(readFor, readAt, changes, lastChange, detail?.card?.id, now)
        // Seen either way: another card's change leaves the page as it is.
        readFor = changes
        if (current && !retry && phase != "failed") return
        readAt = now
        reading?.cancel()
        reading = viewModelScope.launch { load() }
    }

    private suspend fun load() {
        // A first read (or a retry) shows the skeleton; a re-read keeps the page while it goes.
        if (phase != "loaded") phase = "loading"
        try {
            val page = session.cardPages.load(key, placeholder)
            val d = page.detail
            if (d.story != detail?.story) blocks = page.blocks
            detail = d
            storyText = page.storyText
            resonances = page.resonances
            related = page.related
            // Cards others linked to this one are shown to its author only (useLinkedToCard).
            linked = page.links
            embeds = page.embeds
            linkPreviews = StoryLinks.previews(d.linkPreviews, session.config.origin)
            phase = "loaded"
        } catch (e: CancellationException) {
            throw e
        } catch (e: ApiFailure) {
            if (e.isNotFound) {
                session.cardCache.forget(key)
                detail = null
                phase = "notFound"
            } else if (phase != "loaded") phase = "failed"
        } catch (e: Exception) {
            // What is already on the page stays (it was read moments ago); only an empty page offers the retry.
            if (phase != "loaded") phase = "failed"
        }
    }

    companion object {
        /**
         * Whether a page read at `readAt`, as of change `readFor`, still shows `cardId` as it is: read
         * lately, and since then no change, or just one (`lastChange`) about another card — not
         * this one, nor a resonance to it (iOS's CardScreen). Several changes since, or the card
         * not read yet, read it again.
         */
        fun isCurrent(readFor: Int?, readAt: Long, changes: Int, lastChange: Session.CardChange?, cardId: String?, now: Long): Boolean {
            if (readFor == null || now - readAt >= FeedLoader.STALE_AFTER.inWholeMilliseconds) return false
            if (changes == readFor) return true
            return changes == readFor + 1 && cardId != null && lastChange != null && !lastChange.concerns(cardId)
        }
    }
}

/**
 * A card's page (card/[slug]/page.tsx, phone layout); `popToRoot` is where a deleted card leaves to.
 * It draws at once from what the app already has — the page as last read, or the card as the list
 * it was tapped in had it (its byline, cover and title over the story's skeleton) — and reads the
 * card when it opens: one request brings its lists and the cards its story embeds
 * ([com.resonance.kit.reading.CardPageLoader]). [CardPageModel] keeps it while the page is on its
 * stack.
 */
@Composable
fun CardScreen(session: Session, key: String, preview: FeedCard?, open: (Route) -> Unit, popToRoot: () -> Unit, back: () -> Unit) {
    val model = viewModel { CardPageModel(session, key, preview) }
    val placeholder = model.placeholder
    val phase = model.phase
    val detail = model.detail
    val blocks = model.blocks
    val resonances = model.resonances
    val related = model.related
    val linked = model.linked
    val embeds = model.embeds
    val context = LocalContext.current
    // A link card leaves by the same door as a link in a conversation: the in-app browser, asking first where the address isn't what it seems.
    val links = rememberLinkOpener()
    val origin = session.config.origin
    val linkCards = remember(model.linkPreviews, links, origin) {
        StoryLinkCards(
            model.linkPreviews,
            host = { (Linkify.displayHost(it.url) ?: it.url).removePrefix("www.") },
            label = L10n.Card.LinkPreview::open,
            open = { links.tap(it.url) },
            // A link the server would fetch but hasn't (a private card's, an older build's story) is still a card (review S3).
            unfurlable = { key -> StoryLinks.unfurlable(key, origin) },
        )
    }
    val list = rememberLazyListState()
    // This card or a resonance to it edited, published or re-shelved from the writer or the ⋯, or a
    // block: read it again (another card's change leaves it as it is); so is a page read long ago.
    val changes by session.cardChanges.collectAsStateWithLifecycle()
    val foregrounded by session.foregrounded.collectAsStateWithLifecycle()
    LaunchedEffect(changes, foregrounded) { model.refresh(changes, session.lastCardChange) }

    // A story's link leads where its scheme says (StoryLink); any other scheme isn't even tappable.
    val openUrl: (String) -> Unit = { href -> openStoryLink(context, session.config.origin, href, open) }

    // The share: one glyph, straight to the system sheet with the link and the card's picture
    // (share.spec, Owner revision); the owner of an anonymous card is asked first.
    val sharing = remember(context, session.config) { CardSharing(context, session.config, ShareCardRenderer()) }
    var askAnonymousShare by remember { mutableStateOf(false) }
    val shareScope = rememberCoroutineScope()
    val share: (com.resonance.api.models.CardDetail) -> Unit = { d ->
        if (d.isOwner && d.anonymous) askAnonymousShare = true
        else shareScope.launch { sharing.share(d) }
    }
    val toasts = LocalToasts.current
    // What the sheet's own actions had to say (saved, couldn't open Instagram), shown once the page is back.
    val shareWord by ShareFeedback.pending.collectAsStateWithLifecycle()
    LaunchedEffect(shareWord) { if (shareWord != null) ShareFeedback.take()?.let { toasts.show(it) } }

    // The bar lies over the page, so the story scrolls right up to its pen line.
    val top = inlineBarTop()
    // Once the byline under the title has scrolled under the bar, the bar names the author (Threads' header, in the byline's language).
    val byline = remember { HeadingUnderBar() }
    val bylineGone by remember(list) {
        derivedStateOf { scrolledUnderBar(list.firstVisibleItemIndex, list.firstVisibleItemScrollOffset, byline.bottom) }
    }
    val progress = rememberReadingProgress(list, top)
    // On a tablet the bar's middle takes the card's title once the article's own has gone up under
    // it (round 5, part C): where the title ends below the article's top, and whether it has.
    val chrome = LocalHeaderChrome.current
    val heading = remember { HeadingUnderBar() }
    // Where the card's share and ⋯ sit at the top (round 8 §10.1): a phone's bar keeps them, as phone apps
    // do; under a tablet's header they end the byline, beside the author and the read time · date — and
    // come into the bar once the byline has scrolled under it (round 9 §3).
    val actionsSlot = cardActionsSlot(tabletHeader = chrome != null)
    // The resonances beyond the first three show once asked for (round 9 C1).
    var allResonances by rememberSaveable(key) { mutableStateOf(false) }
    val titleGone by remember(list) {
        derivedStateOf { scrolledUnderBar(list.firstVisibleItemIndex, list.firstVisibleItemScrollOffset, heading.bottom) }
    }
    // The story's h2 and h3 are its table of contents: a tap on one brings it 16 under the bar.
    val anchors = remember(blocks) { StoryAnchors() }
    val headings = remember(blocks) { StoryToc.headings(blocks) }
    // One centred column on phones and medium windows, and on an expanded one for a story with no contents;
    // with contents, an expanded window sets their rail beside the article (round 8 §10.1: the author is under the title).
    val columns = LocalWindowLayout.current.cardPage(rail = phase == "loaded" && headings.isNotEmpty())
    val railed = columns.railStart != null
    var listCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val scope = rememberCoroutineScope()
    val reduced = context.prefersReducedMotion()
    val density = LocalDensity.current
    // The heading being read (CardToc's): the last whose top has passed a line 96 under the bar —
    // from where the article is in the list and where each heading is in the article, so it follows
    // the scroll frame by frame. A tapped one is marked at once and kept while the page goes there,
    // so the headings it passes don't flash.
    var articleCoords by remember { mutableStateOf<LayoutCoordinates?>(null) }
    val readingLine = with(density) { (top + ReadingLine).toPx() }
    val reading by remember(list, headings, anchors, readingLine) {
        derivedStateOf {
            val info = list.layoutInfo
            val article = info.visibleItemsInfo.firstOrNull { it.key == "article" }
                ?: return@derivedStateOf if (list.firstVisibleItemIndex > 0) headings.lastOrNull() else null
            val articleTop = (article.offset - info.viewportStartOffset).toFloat()
            StoryAnchors.reading(headings, { h -> anchors.positionIn(articleCoords, h.block)?.let { articleTop + it } }, readingLine)
        }
    }
    var tapped by remember { mutableStateOf<TocHeading?>(null) }
    val going = remember { arrayOfNulls<Job>(1) }
    val onHeading: (TocHeading) -> Unit = { h ->
        anchors.positionIn(listCoords, h.block)?.let { y ->
            val by = y - with(density) { (top + HeadingLanding).toPx() }
            tapped = h
            going[0]?.cancel()
            going[0] = scope.launch {
                try {
                    if (reduced) list.scrollBy(by) else list.animateScrollBy(by)
                } finally {
                    if (tapped === h) tapped = null
                }
            }
        }
    }
    // The reading head (round 9 §2): the article's first thing — a cover, the trash's banner, else the title's
    // line box — that far under the bar's pen line; its lists' headings have more air on a tablet (round 5 E2).
    val cls = LocalWindowLayout.current.cls
    // Moved to the trash on this page a moment ago: the banner's title takes the focus as it comes.
    var trashedHere by remember { mutableIntStateOf(0) }
    Box(Modifier.fillMaxSize().cream().onGloballyPositioned { progress.page = it }) {
    Column(Modifier.fillMaxSize().padding(top = if (phase == "loaded") 0.dp else top)) {
        when (phase) {
            // The card as the list drew it, the story still shimmering below; or, knowing nothing yet,
            // CardDetailSkeleton: the article's own layout in shimmering blocks.
            "loading" -> if (placeholder != null) CardPreview(placeholder, columns) { open(Route.Author(it)) }
                // The skeleton heads with a cover's block: it stands where a cover would.
                else CardDetailSkeleton(
                    Modifier.padding(start = columns.start, end = columns.end).padding(top = cls.storyHeadGap(cover = true)),
                    compact = cls == LayoutClass.Compact, byline = true,
                )
            "notFound" -> OrganicEmptyState(title = L10n.Card.NotFound.title, titleSize = 24f, actionTitle = L10n.Card.NotFound.back, onAction = back, action = EmptyAction.Outline)
            "failed" -> OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { model.refresh(changes, session.lastCardChange, retry = true) }, action = EmptyAction.Outline)
            else -> detail?.let { d ->
                val card = d.card
                // The owner's card in the trash (trash.spec §5.4): the banner first, no share, no ⋯, no lists.
                val trashedOwn = ownTrashed(d)
                val articleTop = articleTop(cls, card, trashedOwn)
                val resonance = if (trashedOwn) emptyList() else (listOfNotNull(d.referenceCard) + resonances).distinctBy { it.id }
                // Related cards are the feed's kind of list: bands, or the bordered grid when expanded;
                // the page's other lists follow it.
                val relatedLayout = cardListLayout()
                LazyColumn(Modifier.fillMaxSize().onPlaced { listCoords = it }, state = list, contentPadding = PaddingValues(top = top, bottom = 40.dp)) {
                    item(key = "article") {
                        // The story's type, read off its title and words together (StoryScripts), in this window's numbers.
                        val text = model.storyText ?: remember(card.title, d.story) { StoryScripts.storyType(card.title, d.story) }
                        val type = StoryType.of(text.script, cls)
                        Column(heading.onItem.then(byline.onItem).onPlaced { articleCoords = it }.padding(start = columns.start, end = columns.end).padding(top = articleTop)) {
                            if (trashedOwn) TrashedCardBanner(card, d.anonymous, compact = cls == LayoutClass.Compact, focusTicket = trashedHere, onDeleted = popToRoot)
                            ArticleHead(
                                card, d.anonymous, type, text.lang, titleModifier = heading.onHeading, bylineModifier = byline.onHeading,
                                actions = if (actionsSlot == CardActionsSlot.Byline && !trashedOwn) {
                                    { CardPageActions(session, d, sharing, open, onShare = share, onTrashed = { trashedHere++ }, seed = card.accentHue ?: 55.0) }
                                } else null,
                                privateCard = isPrivateCard(d),
                            ) { open(Route.Author(it)) }
                            // The story alone is what the bar's progress measures (not the cover, title or lists).
                            Box(Modifier.onGloballyPositioned(progress::story)) {
                                // Its words follow the system's text size up to 2× (the cards in it keep the interface's).
                                ReadingTextScale {
                                    StoryMarkdown(blocks, type, text.lang, openUrl, linkCards, headingAnchor = if (railed) anchors::anchor else null) { href, title, style ->
                                        CardEmbed(embeds.embedFor(href), href, title, style, open)
                                    }
                                }
                            }
                            FlowRow(Modifier.padding(top = type.endGap.dp, bottom = 40.dp), horizontalArrangement = Arrangement.spacedBy(8.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                                card.tags.forEach { TagPill(it, fill = Tokens.TerracottaLight) }
                            }
                            // The story's end is the response bar alone (round 9 §3: share and ⋯ are in the bar,
                            // or the byline); the author's own card has no end row.
                            if (!trashedOwn && !d.isOwner) CardViewerActions(
                                session, card.id, card.referenceCardId,
                                onWriteNew = { open(Route.Write(referenceCardId = card.id)) },
                                onModify = { mine -> open(Route.Write(cardId = mine)) },
                                onOpenMine = { key -> open(Route.Card(key)) },
                                onUpgradeNote = { words -> open(Route.Write(referenceCardId = card.id, story = words)) },
                                modifier = Modifier.fillMaxWidth().padding(bottom = 40.dp),
                            )
                        }
                    }
                    // The owner's linked cards and the resonances take the related list's layout (round 5 D3).
                    if (d.isOwner && !trashedOwn && linked.isNotEmpty()) {
                        val air = cardSectionAir(cls, phoneTop = 0, phoneBelow = 24)
                        item {
                            BasicText(
                                L10n.Card.linkedCards,
                                style = AppFonts.heading(20f, lineHeight = 1.3f),
                                modifier = Modifier.padding(start = relatedLayout.headerInset, end = 20.dp, top = air.top.dp, bottom = air.below.dp).semantics { heading() },
                            )
                        }
                        answerCards(linked, open, keyPrefix = "linked:", related = relatedLayout)
                        item(contentType = "spacer") { Spacer(Modifier.height(40.dp)) }
                    }
                    // 與此文共振: the related list's full cards at every width (round 9 C1) — three, then 查看全部 for the rest, in place.
                    if (resonance.isNotEmpty()) {
                        sectionHeading(L10n.Card.ResonanceSection.title, cardSectionAir(cls, phoneBelow = 40))
                        val shown = resonancesShown(resonance, allResonances)
                        storyCards(shown, open, layout = relatedLayout, keyPrefix = "resonance:")
                        if (shown.size < resonance.size) item(key = "resonance:all") {
                            Box(Modifier.fillMaxWidth().padding(top = 24.dp), contentAlignment = Alignment.Center) {
                                OrganicButton(L10n.Card.ResonanceSection.showAll(resonance.size), variant = ButtonVariant.Tonal, small = true) { allResonances = true }
                            }
                        }
                        item(contentType = "spacer") { Spacer(Modifier.height(16.dp)) }
                    }
                    if (related.isNotEmpty() && !trashedOwn) {
                        sectionHeading(L10n.Card.related, cardSectionAir(cls, phoneBelow = 56))
                        storyCards(related, open, layout = relatedLayout)
                        item(contentType = "spacer") { Spacer(Modifier.height(16.dp)) }
                    }
                }
            }
        }
    }
    // The contents' rail beside the article (an expanded window, a story with headings): pinned under the bar
    // while the article scrolls, leaving with its end. The author is under the title at every width (round 8 §10.1).
    val railStart = columns.railStart
    if (railStart != null && detail != null) ContentsRail(railStart, list, top + articleTop(cls, detail.card, ownTrashed(detail)), headings, tapped ?: reading, onHeading)
    OrganicInlineBar(
        L10n.App.Nav.back, back, scrolled = list.scrolledPast20(),
        // A tablet's header has the card's title in its middle instead of the author beside the arrow.
        title = if (chrome != null) detail?.card?.title else null,
        titleShown = phase == "loaded" && titleGone,
        pageTitle = true,
        leading = { if (chrome == null) detail?.let { d -> BarAuthor(d.card, d.anonymous, visible = phase == "loaded" && bylineGone) { open(Route.Author(it)) } } },
        progress = if (phase == "loaded") progress::shown else null,
    ) {
        // A phone's bar holds the page's actions, as phone apps keep them; a tablet's byline holds them, and the
        // bar takes them while the byline is under it (round 9 §3). The owner's card in the trash has neither:
        // its banner holds the way back (and nothing is shared from it).
        detail?.takeUnless(::ownTrashed)?.let { d ->
            val actions: @Composable () -> Unit = {
                CardPageActions(session, d, sharing, open, onShare = share, onTrashed = { trashedHere++ }, seed = d.card.accentHue ?: 55.0)
            }
            if (actionsSlot == CardActionsSlot.Bar) actions()
            else AnimatedVisibility(
                phase == "loaded" && bylineGone,
                enter = fadeIn(tween(180)),
                exit = fadeOut(tween(140)),
            ) { actions() }
        }
    }
    // Where the share card is drawn into its pictures: out of sight, taking no room.
    ShareCardRendererHost(sharing.renderer)
    }
    // Sharing their own anonymous card from their own account may give its owner away: said once, before the sheet.
    detail?.takeIf { askAnonymousShare }?.let { d ->
        OrganicConfirmDialog(
            title = L10n.Share.anonymousTitle,
            body = L10n.Share.anonymousHint,
            cancelLabel = L10n.Safety.cancel,
            confirmLabel = L10n.Card.share,
            onCancel = { askAnonymousShare = false },
            onConfirm = {
                askAnonymousShare = false
                shareScope.launch { sharing.share(d) }
            },
        )
    }
    LinkDialogs(links)
}

/**
 * A section heading under the article. On phones the web drops the tinted
 * band and its wavy edge (the cards are bands already — "double chrome"), so
 * the heading sits on the page: 32 above, 22/700 centred.
 */
private fun LazyListScope.sectionHeading(title: String, air: SectionAir) {
    item {
        BasicText(
            title,
            style = AppFonts.heading(22f, lineHeight = 1.3f).copy(textAlign = TextAlign.Center),
            modifier = Modifier.fillMaxWidth().padding(start = 20.dp, end = 20.dp, top = air.top.dp, bottom = air.below.dp).semantics { heading() },
        )
    }
}

/** The air above a card page's list heading and between it and its cards, in dp. */
internal data class SectionAir(val top: Int, val below: Int)

/**
 * A card page's list headings (the resonances, the related cards, the owner's linked cards): on a
 * phone each keeps its own ([phoneTop] above, [phoneBelow] under); on a tablet every one has 64
 * above it and 56 between it and its cards (round 5 E2).
 */
internal fun cardSectionAir(cls: LayoutClass, phoneTop: Int = 32, phoneBelow: Int): SectionAir =
    if (cls == LayoutClass.Compact) SectionAir(phoneTop, phoneBelow) else SectionAir(64, 56)

/**
 * The author in the bar once the byline has scrolled away: the avatar small
 * and the pen name (→ their page), rising in as the byline leaves; an
 * anonymous card shows its dot and "anonymous".
 */
@Composable
private fun BarAuthor(card: FeedCard, anonymous: Boolean, visible: Boolean, openAuthor: (String) -> Unit) {
    AnimatedVisibility(
        visible,
        enter = fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 3 },
        exit = fadeOut(tween(140)) + slideOutVertically(tween(180)) { it / 3 },
    ) {
        val author = card.author
        val shown = author != null && !anonymous
        Row(
            Modifier.padding(start = 2.dp).then(if (shown) Modifier.plainClickable(onClickLabel = author!!.handle) { openAuthor(author.handle) } else Modifier),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            if (shown) HandDrawnAvatar(author!!.initials, author.avatarUrl, author.accent(), 28.dp, author.avatarSeedValue())
            else HandDrawnAvatar("·", color = Tokens.AvatarWait, size = 28.dp, seed = 97.0)
            BasicText(
                if (shown) author!!.handle else L10n.Card.anonymousAuthor,
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = AppFonts.body(15f, 600, color = if (shown) Tokens.Text else Tokens.TextMuted),
            )
        }
    }
}

/**
 * The article's head (reading-type §5): the cover at its 0.52 ratio, then the title alone in the
 * column in the story's own type (the title follows the system's text size up to 2×), then the
 * byline under it at every width — the author's avatar and pen name over the meta line (round 8
 * §10.1), ending, under a tablet's header, with the page's share and ⋯ ([actions]; a phone keeps
 * them in its bar) — and the room before the story. They come again at the story's end.
 */
@Composable
private fun ArticleHead(
    card: FeedCard,
    anonymous: Boolean,
    type: StoryType,
    lang: String?,
    /** On the title: a tablet's bar takes it once it has gone up under the bar. */
    titleModifier: Modifier = Modifier,
    /** On the byline: the bar names the author once it has gone up under it. */
    bylineModifier: Modifier = Modifier,
    /** The page's share and ⋯ at the byline's end, under a tablet's header ([cardActionsSlot]); null on a phone. */
    actions: (@Composable () -> Unit)? = null,
    /** The owner's 私人卡: its meta line ends with the lock and 私人卡 (round 9 §1). */
    privateCard: Boolean = false,
    openAuthor: (String) -> Unit,
) {
    if (card.imageUrl != null) {
        // While it is on its way the cover shimmers in the card's own hue (CardDetailClient's `hue`).
        WithSkeletonHue(card.accentHue ?: 55.0) {
            OrganicImage(card.imageUrl, (card.accentHue ?: 55.0) + 11, Modifier.fillMaxWidth().aspectRatio(1 / 0.52f)) {
                Box(Modifier.fillMaxSize().background(Tokens.CreamDark))
            }
        }
        Spacer(Modifier.height(type.coverGap.dp))
    }
    ReadingTextScale {
        StoryTitle(card.title, type, lang, titleModifier.semantics { heading() })
    }
    Spacer(Modifier.height(type.metaGap.dp))
    StoryByline(card, anonymous, type, bylineModifier, actions, privateCard, openAuthor)
    Spacer(Modifier.height(type.leadGap.dp))
}

/**
 * The page while the card is read, drawn from the list it was tapped in: the same head the page
 * will have (its type read off the title and the excerpt), and the story and tags still
 * shimmering under it.
 */
@Composable
private fun CardPreview(card: FeedCard, columns: CardPageColumns, openAuthor: (String) -> Unit) {
    val cls = LocalWindowLayout.current.cls
    val text = remember(card.title, card.excerpt) { StoryScripts.storyType(card.title, card.excerpt) }
    Column(Modifier.fillMaxSize().padding(start = columns.start, end = columns.end).padding(top = articleTop(cls, card, trashed = false))) {
        ArticleHead(card, card.anonymous, StoryType.of(text.script, cls), text.lang, openAuthor = openAuthor)
        StorySkeleton(Modifier.semantics { contentDescription = L10n.Home.moreLoading }, compact = cls == LayoutClass.Compact)
    }
}

/**
 * The line under the title (StoryByline.tsx), the phone's at every width (round 8 §10.1): the
 * author's avatar (40), pen name (→ their page; one line, an ellipsis), region flag and verified
 * mark over the meta line — 「6 分鐘 · 2026年10月10日」, 13 muted. An anonymous card shows the
 * neutral「·」and 匿名 in muted ink, linking nowhere — to its owner too. At least 44 tall, growing
 * with large text and a wrapping meta line. Under a tablet's header it ends with the page's share
 * and ⋯ ([actions]), as the web's byline does.
 */
@Composable
private fun StoryByline(
    card: FeedCard,
    anonymous: Boolean,
    type: StoryType,
    modifier: Modifier = Modifier,
    actions: (@Composable () -> Unit)? = null,
    privateCard: Boolean = false,
    openAuthor: (String) -> Unit,
) {
    val author = card.author
    val named = author != null && !anonymous
    Row(
        modifier.fillMaxWidth().heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        val avatar = Tokens.StoryBylineAvatar.dp
        if (named) Box(Modifier.plainClickable(onClickLabel = author.handle) { openAuthor(author.handle) }) {
            HandDrawnAvatar(author.initials, author.avatarUrl, author.accent(), avatar, author.avatarSeedValue())
        }
        else HandDrawnAvatar("·", color = Tokens.AvatarWait, size = avatar, seed = 97.0)
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                if (named) {
                    BasicText(
                        author.handle, maxLines = 1, overflow = TextOverflow.Ellipsis,
                        style = AppFonts.body(15f, 600, lineHeight = 1.35f),
                        modifier = Modifier.weight(1f, fill = false).plainClickable { openAuthor(author.handle) },
                    )
                    AuthorRegionFlag(author.region, 14.dp)
                    if (author.verified) OrganicIcon(IconName.Verified, Modifier.semantics { contentDescription = L10n.Card.verified }, size = 13.dp, color = Tokens.VerifiedMark, strokeWidth = 1.8f)
                } else {
                    BasicText(L10n.Card.anonymousAuthor, maxLines = 1, style = AppFonts.body(15f, 600, lineHeight = 1.35f, color = Tokens.TextMuted))
                }
            }
            // 13 on a phone, 14 wider (round 9 §2); the owner's 私人卡 ends it with the lock and its name.
            StoryMetaLine(metaLine(card.readMinutes, card.publishedAt), type.metaSize, lock = if (privateCard) L10n.Card.private else null)
        }
        actions?.invoke()
    }
}


/**
 * The owner's 私人卡 (round 9 §1): a card only its author sees — never published, or published and
 * kept private — out of the trash (which says where the card stands itself). Its page wears the lock
 * in its meta line and the 編輯 pen where share would be.
 */
internal fun isPrivateCard(d: com.resonance.api.models.CardDetail): Boolean =
    d.isOwner && !d.card.isTrashed && (d.card.publishedAt == null || d.card.visibility == FeedCard.Visibility.`private`)

/** How far under the bar's foot the article starts (round 9 §2): to a cover's (or the trash banner's) top edge, else the title's line box. */
internal fun articleTop(cls: LayoutClass, card: FeedCard, trashed: Boolean): Dp =
    cls.storyHeadGap(cover = card.imageUrl != null || trashed)

/** The resonances shown (round 9 C1): the first [RESONANCES_SHOWN], or all once 查看全部 was pressed. */
internal fun resonancesShown(cards: List<FeedCard>, all: Boolean): List<FeedCard> = if (all) cards else cards.take(RESONANCES_SHOWN)

/** How many resonances a card page shows before 查看全部. */
internal const val RESONANCES_SHOWN = 3

/** 「6 分鐘 · 2026年10月10日」 / "6 min · Oct 10, 2026": the read time, then the published day (a draft's read time alone). */
internal fun metaLine(minutes: Int, publishedAt: String?): String =
    listOfNotNull(L10n.App.readMinutes(minutes), mediumDate(publishedAt)).joinToString(" · ")

/**
 * The author's region as a small square flag right after the pen name (the web's AuthorRegionFlag):
 * a quiet mark, not a line of its own, its name read out by TalkBack; nothing without flag art.
 */
@Composable
private fun AuthorRegionFlag(region: String?, size: Dp) {
    val code = region?.let(Regions::flagCode) ?: return
    Box(Modifier.clearAndSetSemantics { contentDescription = Regions.label(region) }) { SquareFlag(code, size) }
}

/**
 * The story's contents on an expanded window's rail (CardToc.tsx beside the article, round 8 §10.1:
 * the author is under the title now, so the rail holds the contents alone), [Tokens.StoryRailGap]
 * past the text. Like the web's sticky aside it stays level with the article's first line under the
 * bar while the article scrolls, and goes up with the article's end. It never runs past the window
 * (the web's `.aside` max-height: 24 clear of its foot): a long list scrolls in place. A drag
 * anywhere else on the rail — or over a list with room to spare — scrolls the page.
 */
@Composable
private fun ContentsRail(
    x: Dp, list: LazyListState, top: Dp,
    headings: List<TocHeading>, reading: TocHeading?, onHeading: (TocHeading) -> Unit,
) {
    val density = LocalDensity.current
    var height by remember { mutableIntStateOf(0) }
    // Level with the article's first thing ([top]: the bar's foot and the reading head under it).
    val pinned = with(density) { top.roundToPx() }
    val foot = with(density) { (RailFootRoom + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()).roundToPx() }
    val y by remember(list, pinned) {
        derivedStateOf {
            val info = list.layoutInfo
            val article = info.visibleItemsInfo.firstOrNull { it.key == "article" } ?: return@derivedStateOf null
            val bottom = article.offset + article.size - info.viewportStartOffset
            minOf(pinned, bottom - height)
        }
    }
    Column(
        Modifier
            .offset { IntOffset(x.roundToPx(), y ?: -10_000) }
            // As tall as the window leaves it under its pinned place.
            .layout { measurable, constraints ->
                val room = (constraints.maxHeight - pinned - foot).coerceAtLeast(0)
                val placeable = measurable.measure(constraints.copy(minHeight = 0, maxHeight = room))
                layout(placeable.width, placeable.height) { placeable.place(0, 0) }
            }
            .width(Tokens.CardRailW.dp)
            .onSizeChanged { height = it.height }
            .scrollable(list, Orientation.Vertical, reverseDirection = true),
    ) {
        StoryToc(headings, L10n.Card.toc, onHeading, Modifier.weight(1f, fill = false), active = reading)
    }
}

/** Where the card page's share and ⋯ sit at its top (round 8 §10.1). */
internal enum class CardActionsSlot { Bar, Byline }

/**
 * A phone's page — and a page in a tablet's pane, which wears a phone's bar — keeps them in its
 * bar, as phone apps do; under a tablet's header ([tabletHeader]: a medium or expanded window,
 * `LayoutClass.topTabs`) they end the byline under the title, with the author and the read time ·
 * date, as the web's byline holds them, and the bar has none. Either way they come again at the
 * story's end.
 */
internal fun cardActionsSlot(tabletHeader: Boolean): CardActionsSlot = if (tabletHeader) CardActionsSlot.Byline else CardActionsSlot.Bar

/**
 * The card's share and ⋯ (round 8 §10): in a phone's bar or at the end of a tablet's byline
 * ([cardActionsSlot]), and again at the end of the story's one action row — bare glyphs, each a
 * finger's target. Share only for a card whoever gets its link
 * can open (published, public, not in the trash: [ShareLinks.canShare]), its glyph the small loop
 * while the picture is made; the ⋯ the owner's [CardActionsMenu] (its 刪除 leaves the page where it
 * is, which shows the trash banner: [onTrashed]) or a reader's safety menu.
 */
@Composable
private fun CardPageActions(
    session: Session,
    d: com.resonance.api.models.CardDetail,
    sharing: CardSharing,
    open: (Route) -> Unit,
    onShare: (com.resonance.api.models.CardDetail) -> Unit,
    onTrashed: () -> Unit,
    seed: Double,
) {
    val card = d.card
    Row(verticalAlignment = Alignment.CenterVertically) {
        // The owner's 私人卡 is never shared: its pen opens the writer on it where share would be (round 9 §1).
        if (isPrivateCard(d)) OrganicIconButton(IconName.Pen, L10n.Me.Actions.edit, size = 20.dp) {
            open(Route.Write(cardId = card.id, showsCard = false))
        }
        if (ShareLinks.canShare(d)) {
            OrganicMenuChip(IconName.Share, L10n.Card.share, seed = seed + 5, trigger = MenuTrigger.Bare, busy = sharing.busy) { onShare(d) }
        }
        if (d.isOwner) {
            // Its own page is underneath the writer, so the card isn't opened again on the way out.
            CardActionsMenu(
                session, card.id, card.visibility.value, open, seed = seed + 3, showsCard = false, trigger = MenuTrigger.Bare,
                referenceCardId = card.referenceCardId, referenceTitle = d.referenceCard?.title,
                referenceAnonymous = d.referenceCard?.anonymous,
                published = card.publishedAt != null, anonymous = d.anonymous, title = card.title,
                trashFeedback = TrashFeedback.Page, onTrashed = onTrashed,
                // Its pen is 編輯 already: the ⋯ leads with 公開發表 (round 12 §3).
                penBeside = isPrivateCard(d),
            )
        } else {
            // An anonymous card hides its author: the menu only reports it (the server knows who wrote it).
            val authorId = if (d.anonymous) null else card.author?.id
            SafetyMenu(session, SafetyService.Target.Card(card.id, authorId), if (authorId == null) null else card.author?.handle, seed = seed + 3, trigger = MenuTrigger.Bare)
        }
    }
}

/** What the rail leaves clear under it (the web's 48 − its 24 above). */
private val RailFootRoom = 24.dp

/** Where a heading the table of contents was tapped for comes to rest: 16 under the bar (scroll-margin-top). */
private val HeadingLanding = 16.dp

/** The reading line: a heading whose top has passed it, 96 under the bar, is the one being read. */
private val ReadingLine = 96.dp

/**
 * A card link standing alone in a story (CardEmbedLink), drawn as a block like a story link card
 * (round 5 D2): the link card's own container ([StoryLinkCardFrame], seeded by the link) holding
 * the card as a message shares it ([SharedCard]: byline — an anonymous card's mark, never its
 * author —, cover edge to edge, title, excerpt, source line). The whole block is one press that
 * opens the card, read out as its title. The page brings the cards its story embeds with it, so a
 * card is there with the story or not at all: one it didn't bring (a card the reader may not see)
 * is the plain link.
 */
@Composable
private fun CardEmbed(card: FeedCard?, href: String, title: String, style: ProseStyle, open: (Route) -> Unit) {
    if (card != null) {
        // A card sets its own type, at the interface's text size, not the story's.
        CappedTextScale {
            StoryLinkCardFrame(href, card.title, onOpen = { open(Route.Card(card.routeKey, card)) }) {
                // One element: the block says the card's title, not each of its lines again.
                Column(Modifier.fillMaxWidth().clearAndSetSemantics { }) {
                    SharedCard(card, onClick = null, onLongPress = null, pictureBleed = StoryLinkCardLook.BLEED.dp)
                }
            }
        }
    } else {
        // The link as the story's words draw one: the deep terracotta and the pen's wave.
        val key = cardKeyOf(href) ?: href.substringAfterLast('/')
        RichCssText(listOf(InlineRun(title, link = href)), style, onOpenUrl = { open(Route.Card(key)) })
    }
}

/**
 * Opens a link in a story by its scheme: a page of the site the app shows itself on its stack,
 * any other page of the site — or of the web — in the in-app browser (never back into the app),
 * and mailto: in a mail app. Nothing else is opened: a stranger's story can't start another app.
 */
internal fun openStoryLink(context: Context, origin: String, href: String, open: (Route) -> Unit) {
    when (val link = StoryLink.resolve(href, origin)) {
        is StoryLink.Site -> Route.fromPath(link.path)?.let(open) ?: InAppBrowser.open(context, origin.trimEnd('/') + link.path)
        is StoryLink.Web -> InAppBrowser.open(context, link.url)
        is StoryLink.Mail -> runCatching {
            context.startActivity(Intent(Intent.ACTION_SENDTO, Uri.parse(link.url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
        }
        null -> {}
    }
}

/**
 * The card page's reading progress (design note §3): where the story is on the page, measured as
 * it scrolls, turned into 0…1 by [readingProgress]. It follows the scroll frame by frame — the
 * finger still down included (round 5 E1) — and only a jump on its own (the story's height
 * changing under a still page) eases there over 120 ms ([easesProgress]; straight to it with the
 * system's animations off). [shown] is read while the bar draws, so scrolling redraws the line and
 * recomposes nothing.
 */
@Stable
internal class ReadingProgress(private val list: LazyListState, private val lineY: Float, private val bottomInset: Float, private val barBottom: Float) {
    var page: LayoutCoordinates? = null
    private var top by mutableFloatStateOf(0f)
    private var height by mutableFloatStateOf(0f)
    private var pageHeight by mutableFloatStateOf(0f)
    val eased = Animatable(0f)

    fun story(coordinates: LayoutCoordinates) {
        val page = page?.takeIf { it.isAttached } ?: return
        top = page.localPositionOf(coordinates, Offset.Zero).y
        height = coordinates.size.height.toFloat()
        pageHeight = page.size.height.toFloat()
    }

    /** The story's progress now: once the article has scrolled out of the list, all of it is read. */
    val target: Float get() {
        val visible = pageHeight - barBottom - bottomInset
        return if (list.firstVisibleItemIndex > 0) { if (height > visible) 1f else 0f }
        else readingProgress(top, height, lineY, visible)
    }

    fun shown(): Float = eased.value
}

@Composable
private fun rememberReadingProgress(list: LazyListState, top: Dp): ReadingProgress {
    val density = LocalDensity.current
    val bottom = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
    val reduced = LocalContext.current.prefersReducedMotion()
    val progress = remember(list, top, bottom, density) {
        with(density) {
            // The bar's pen line: its band's 1.4 + INK above the bar's foot.
            ReadingProgress(list, (top - (1.4f + Tokens.Ink.value).dp).toPx(), bottom.toPx(), top.toPx())
        }
    }
    LaunchedEffect(progress, reduced) {
        // Restarting a 120 ms ease on every frame of a drag never moved it (each restart begins where
        // the last one was): while the list scrolls, or an ease is still on its way, it snaps.
        var easing = false
        snapshotFlow { progress.target }.collectLatest { p ->
            val jump = abs(p - progress.eased.value)
            if (!easesProgress(jump, scrolling = list.isScrollInProgress, interrupted = easing, reduced = reduced)) {
                easing = false
                progress.eased.snapTo(p)
            } else {
                easing = true
                progress.eased.animateTo(p, tween(PROGRESS_EASE_MILLIS, easing = EaseOut))
                easing = false
            }
        }
    }
    return progress
}

/**
 * Whether the reading progress eases to a new place (over [PROGRESS_EASE_MILLIS]) or is put there
 * at once: only a jump of at least [PROGRESS_JUMP] on its own eases — never while the list is
 * scrolling (a drag, a fling: it follows the scroll), never one that lands while the last ease is
 * still running (a run of changes would restart it on every frame and it would never move), never
 * with the system's animations off.
 */
internal fun easesProgress(jump: Float, scrolling: Boolean, interrupted: Boolean, reduced: Boolean): Boolean =
    !reduced && !scrolling && !interrupted && jump >= PROGRESS_JUMP

/** The smallest change of the reading progress that eases rather than snaps (2 % of the story). */
internal const val PROGRESS_JUMP = 0.02f
private const val PROGRESS_EASE_MILLIS = 120
