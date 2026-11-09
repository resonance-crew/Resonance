package com.resonance.app.ui

import com.resonance.design.avatarFill
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.foundation.layout.width
import com.resonance.design.SharedShimmer
import com.resonance.design.Skeleton
import com.resonance.design.readableColumn

import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.itemsIndexed
import com.resonance.design.LocalWindowLayout
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.resonance.app.ConversationsStore
import com.resonance.app.Person
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CountBadge
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.OklchColor
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIcon
import androidx.compose.ui.semantics.clearAndSetSemantics
import com.resonance.design.WobRectShape
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.seedFromString
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import java.time.LocalDate
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Date

/**
 * Messages (MessagesPage.tsx, phone): your conversations, newest first, then
 * the people you're connected with but haven't talked to yet. Live: the rows
 * and the tab's badge follow Firestore as messages arrive. The twin of iOS's
 * ConversationsScreen.
 */
@Composable
fun ConversationsScreen(session: Session, open: (Route) -> Unit) {
    val state by session.conversations.state.collectAsStateWithLifecycle()
    // What was left unsent in each conversation (round 22 §4.4): shown after a pen, in terracotta, until sent.
    val drafts by session.chatDrafts.drafts.collectAsStateWithLifecycle()
    val me = session.uid
    // Beside the thread pane, the pane says there is nothing yet; the list stays empty.
    val twoPane = LocalTwoPane.current
    val chosen = LocalSelectedThread.current
    val list = rememberLazyListState()
    // A conversation put in the pane from elsewhere (a bell, a push, a profile: round 5 E3) brings its row into view.
    LaunchedEffect(twoPane, chosen?.contentKey, state.loaded) {
        val thread = chosen?.takeIf { twoPane } ?: return@LaunchedEffect
        val index = rowIndex(state.conversations.map { it.other }, state.starters) { thread.isWith(it) } ?: return@LaunchedEffect
        val key = list.layoutInfo.visibleItemsInfo.firstOrNull { it.index == index }
        val end = list.layoutInfo.viewportEndOffset
        if (key == null || key.offset < 0 || key.offset + key.size > end) list.animateScrollToItem(index)
    }
    // Someone to hear from: their new cards are worth offering (notification-asks §4).
    val connected by session.conversations.connectedIds.collectAsStateWithLifecycle()
    val blocked by session.conversations.blockedIds.collectAsStateWithLifecycle()
    // Someone not blocked (their cards would never reach this account).
    val someone = connected.orEmpty().any { it !in blocked.orEmpty() }
    val connectionsInvite = rememberInviteShown(session, NotifyInvite.ConnectionCards, eligible = someone)
    LaunchedEffect(connectionsInvite && state.loaded) { if (connectionsInvite && state.loaded) list.keepTopInView(before = 1) }
    // A phone's rows are bands, their content 20 from the edges, the first 4 under the bar's foot; a tablet's and
    // the panes' keep the page's 16 / 18 and the list pane's own 14 (round 23 §5: [ConversationsFrame]).
    val frame = ConversationsFrame.of(LocalWindowLayout.current.cls)
    val scrolling = { list.isScrollInProgress }
    // In the rows' column; on a phone its pen line 16 under the bar's foot, where a first row's avatar would stand.
    val inviteFrame = Modifier.readableColumn(NotifyInviteMaxWidth + 62.dp).padding(start = frame.start, end = frame.end).padding(horizontal = frame.rowInset)
        .padding(top = if (frame.bands) ListBands.RowPad else 4.dp, bottom = 16.dp)
    // The curve under each row: the next row's key, the starters' label under the last conversation, the list's end under the last row.
    val conversationKeys = state.conversations.map { "c:${it.id}" }
    val starterKeys = state.starters.map { "s:${it.id}" }
    val conversationsBelow = bandsBelow(conversationKeys, if (starterKeys.isNotEmpty()) StartersKey else ListBands.EndKey)
    val startersBelow = bandsBelow(starterKeys, ListBands.EndKey)
    TabScreen(L10n.App.Nav.messages, titleInBar = true, tabletAir = false, headGap = frame.headGap, list = list) {
        if (connectionsInvite && state.loaded) notifyInviteItem(session, NotifyInvite.ConnectionCards, inviteFrame)
        if (state.loaded && state.conversations.isEmpty() && state.starters.isEmpty() && !twoPane) {
            // Nothing yet: the shared empty state, in the middle of the room between the bar and the tab bar.
            item {
                OrganicEmptyState(
                    L10n.Messages.empty, title = L10n.Messages.emptyTitle, icon = IconName.Chat, seed = 23.0,
                    fill = true, modifier = Modifier.fillParentMaxHeight(),
                )
            }
        } else if (!state.loaded && state.failed) {
            // Nothing read, and a listener failed: a retry rather than an empty page.
            item { OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { session.conversations.resume() }, action = EmptyAction.Outline) }
        } else if (!state.loaded) {
            // Still reading: the rows' own shapes, so nothing jumps when they arrive.
            item(key = "skeleton") { ConversationsSkeleton(frame) }
        }
        itemsIndexed(state.conversations, key = { _, it -> "c:${it.id}" }, contentType = { _, _ -> "conversation" }) { i, convo ->
            ConversationRow(
                convo.other, preview(convo), convo.sentAt?.let(::rowTime), convo.unread, open,
                chosen = chosen?.isWith(convo.other) == true, draft = drafts[convo.id]?.preview,
                frame = frame, band = conversationKeys.getOrNull(i)?.let { it to conversationsBelow[i] }, scrolling = scrolling,
            )
        }
        if (state.starters.isNotEmpty()) {
            item(key = StartersKey) {
                BasicText(
                    L10n.Messages.startSection.uppercase(),
                    style = AppFonts.body(11f, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.08.em),
                    // In the rows' column; on a phone, on bare paper clear of the bands' curves under it.
                    modifier = Modifier.readableColumn().padding(start = frame.start, end = frame.end)
                        .padding(top = 16.dp, bottom = if (frame.bands) ListBands.TitleToBand else 4.dp).padding(horizontal = frame.rowInset),
                )
            }
            itemsIndexed(state.starters, key = { _, it -> "s:${it.id}" }, contentType = { _, _ -> "conversation" }) { i, person ->
                val pair = me?.let { listOf(it, person.id).sorted().joinToString("_") }
                ConversationRow(
                    person, L10n.Messages.noMessagesYet, null, 0, open, chosen = chosen?.isWith(person) == true, draft = pair?.let { drafts[it]?.preview },
                    frame = frame, band = starterKeys.getOrNull(i)?.let { it to startersBelow[i] }, scrolling = scrolling,
                )
            }
        }
    }
}

private fun preview(convo: ConversationsStore.Conversation): String =
    conversationPreview(
        convo.lastText, convo.lastImage, convo.lastFromMe, unsent = convo.lastUnsent, handle = convo.other.handle,
        sticker = convo.lastSticker, album = convo.lastAlbum,
    )

/**
 * A conversation row's line: its last message's words (a card shared alone: its title, as the
 * server writes it) — a picture sent without words says 傳送了一張圖片, a sticker 傳送了一張貼圖 (its
 * fallback words are for older builds), pictures sent together 傳送了 3 張圖片 — after 你： when it was yours.
 */
internal fun conversationPreview(
    text: String?,
    image: Boolean,
    fromMe: Boolean,
    unsent: Boolean = false,
    handle: String = "",
    sticker: Boolean = false,
    album: Int? = null,
): String {
    // Unsent: the same words as its ghost row (你收回了一則訊息 / bob 收回了一則訊息), no 「你：」 before them.
    if (unsent) return unsentWords(fromMe, handle)
    val said = when {
        sticker -> L10n.Messages.stickerShared
        album != null && image && text.isNullOrEmpty() -> L10n.Messages.albumShared(album)
        else -> text?.takeIf { it.isNotEmpty() || !image } ?: if (image) L10n.Messages.imageShared else return L10n.Messages.noMessagesYet
    }
    return (if (fromMe) L10n.Messages.youPrefix else "") + said
}

/** Today: the time, as the thread says it (下午3:04, [chatTimePattern]); earlier: the date (9/29). */
internal fun rowTime(date: Date, today: LocalDate = LocalDate.now()): String {
    val zoned = date.toInstant().atZone(ZoneId.systemDefault())
    val locale = Strings.language.locale
    val pattern = if (zoned.toLocalDate() == today) chatTimePattern() else "M/d"
    return zoned.format(DateTimeFormatter.ofPattern(pattern, locale))
}

/**
 * Where [person]'s row is in the list: among the conversations, or among the people to start one
 * with, after their section's label; null when neither has them.
 */
internal fun <T> rowIndex(conversations: List<T>, starters: List<T>, isThem: (T) -> Boolean): Int? {
    conversations.indexOfFirst(isThem).takeIf { it >= 0 }?.let { return it }
    return starters.indexOfFirst(isThem).takeIf { it >= 0 }?.let { conversations.size + 1 + it }
}

/** Whether this pane's thread is the conversation with [person] (by uid when the route knows it). */
private fun Route.Thread.isWith(person: Person): Boolean = if (uid != null) uid == person.id else handle.equals(person.handle, ignoreCase = true)

/**
 * One row: the avatar, the pen name over the last line, the time and the
 * unread badge on the right. On a phone ([ConversationsFrame.bands]) the row is
 * a band — the screen's width between its curve and the one under it ([band]:
 * its key and the next's), washed while pressed (round 23 §5, as the
 * notifications are); on a tablet and beside the thread pane, a faint
 * hand-drawn wash while pressed or under a pointer (RowWash: R h·0.28, three
 * turns across) — and beside the thread pane, the chosen row's terracotta wash
 * (MessagesPage's active row).
 */
@Composable
private fun ConversationRow(
    person: Person,
    preview: String,
    time: String?,
    unread: Int,
    open: (Route) -> Unit,
    chosen: Boolean = false,
    draft: String? = null,
    frame: ConversationsFrame,
    band: Pair<String, String>?,
    scrolling: () -> Boolean,
) {
    val source = remember { MutableInteractionSource() }
    val chosenWash = Tokens.TerracottaLight.copy(alpha = 0.55f)
    val wash = if (frame.bands && band != null) {
        Modifier.listBand(band.first, band.second, source, scrolling, rest = chosenWash.takeIf { chosen })
    } else {
        Modifier.rowBlob(person.id, source, chosen, chosenWash)
    }
    Row(
        Modifier
            .readableColumn()
            .padding(start = frame.start, end = frame.end)
            .fillMaxWidth()
            .hoverable(source)
            .pointerHoverIcon(PointerIcon.Hand)
            .then(wash)
            .clickable(source, indication = null, role = Role.Button) { open(Route.Thread(person.handle, uid = person.id)) }
            .semantics { selected = chosen }
            .padding(vertical = ListBands.RowPad, horizontal = frame.rowInset),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        HandDrawnAvatar(
            person.initials, person.avatarUrl, avatarFill(person.accentColor),
            size = 40.dp, seed = seedOr(person.avatarSeed, 5.0),
        )
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(3.dp)) {
            BasicText(person.handle, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(14f, 600, lineHeight = 1.3f))
            if (draft != null) {
                // Left unsent (round 22 §4.4): the words after a small pen, in the accent — never the word 草稿.
                Row(
                    Modifier.clearAndSetSemantics { contentDescription = L10n.Messages.draftLabel(draft) },
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    OrganicIcon(IconName.Pen, size = 13.dp, color = Tokens.ButtonOnTonal, strokeWidth = Tokens.Ink.value)
                    BasicText(draft, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.ButtonOnTonal))
                }
            } else {
                BasicText(preview, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(13f, lineHeight = 1.3f, color = Tokens.TextMuted))
            }
        }
        Column(horizontalAlignment = Alignment.End, verticalArrangement = Arrangement.spacedBy(5.dp)) {
            if (time != null) BasicText(time, maxLines = 1, style = AppFonts.body(11f, lineHeight = 1.3f, color = Tokens.TextMuted))
            if (unread > 0) CountBadge(unread)
        }
    }
}

/**
 * A tablet's (and a pane's) row wash: a faint hand-drawn blob while pressed or under a pointer
 * (RowWash: R h·0.28, three turns across), or the chosen row's terracotta.
 */
@Composable
private fun Modifier.rowBlob(id: String, source: MutableInteractionSource, chosen: Boolean, chosenWash: Color): Modifier {
    val pressed by source.collectIsPressedAsState()
    val hovered by source.collectIsHoveredAsState()
    val seed = seedFromString(id).toDouble()
    val pressWash = Tokens.TowardInk.copy(alpha = 0.045f)
    return drawWithCache {
        val h = (size.height / density).toDouble()
        val outline = WobRectShape(
            h * 0.28, seed, mag = 2.4,
            options = WobRectOptions(curve = 1.3, cornerJitter = 2.4, cornerOffset = h * 0.05, segmentsH = SegValue.Count(3.0), segmentsV = SegValue.Count(1.0)),
        ).createOutline(size, layoutDirection, this)
        onDrawBehind {
            if (chosen) drawOutline(outline, chosenWash)
            else if (pressed || hovered) drawOutline(outline, pressWash)
        }
    }
}

/** The label over the people to start a conversation with, and the key the band above it ends on. */
private const val StartersKey = "starters"

/**
 * The conversations still on their way: six rows in a row's measures — the 40 face, the pen name
 * over the last line, the time at the end — in the warm shimmer, in the rows' own frame. iOS's ConversationsSkeleton.
 */
@Composable
private fun ConversationsSkeleton(frame: ConversationsFrame) {
    // One clock for its blocks (composed together).
    SharedShimmer {
        val names = listOf(96, 128, 80, 112, 88, 120)
        val lines = listOf(0.78f, 0.56f, 0.7f, 0.48f, 0.64f, 0.52f)
        Column(Modifier.readableColumn().padding(start = frame.start, end = frame.end).semantics { contentDescription = L10n.Home.moreLoading }) {
            for (i in 0 until 6) {
                Row(
                    Modifier.fillMaxWidth().padding(vertical = ListBands.RowPad, horizontal = frame.rowInset),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                ) {
                    Skeleton(height = 40.dp, circle = true)
                    Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                        Skeleton(Modifier.width(names[i].dp), height = 13.dp)
                        Skeleton(Modifier.fillMaxWidth(lines[i]), height = 12.dp)
                    }
                    Skeleton(Modifier.width(30.dp), height = 10.dp)
                }
            }
        }
    }
}
