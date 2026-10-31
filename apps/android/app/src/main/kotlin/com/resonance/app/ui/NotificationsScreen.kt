package com.resonance.app.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.InlineTextContent
import androidx.compose.foundation.text.appendInlineContent
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.Placeholder
import androidx.compose.ui.text.PlaceholderVerticalAlign
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import coil3.compose.AsyncImage
import com.resonance.api.models.FeedCard
import com.resonance.app.NotificationsStore
import com.resonance.app.Person
import com.resonance.app.Session
import com.resonance.design.AppFonts
import com.resonance.design.CardPalette
import com.resonance.design.EmptyAction
import com.resonance.design.HandDrawnAvatar
import com.resonance.design.Mixes
import com.resonance.design.OrganicEmptyState
import com.resonance.design.OrganicIcon
import com.resonance.design.SharedShimmer
import com.resonance.design.Skeleton
import com.resonance.design.WobRectShape
import com.resonance.design.avatarFill
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.readableColumn
import com.resonance.design.toPath
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.seedFromString
import com.resonance.geometry.wavyVertical
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.reading.cardsByKey
import kotlinx.coroutines.delay
import java.time.Instant
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * Notifications, live (web: NotificationBell, round 21). The rows stand in parts by time — 今天, 這週,
 * 更早 — apart by air alone, no rules between them. Each says who did what: their face on the left,
 * their pen name in bold and what they did (a note's own words quoted under it, in its card's colour),
 * and when; the card it is about on the right. Unread: the words in the text's ink and the dot ending
 * the first line; read, muted. Tapping opens where it happened and marks it read.
 */
@Composable
fun NotificationsScreen(session: Session, open: (Route) -> Unit) {
    val items by session.notifications.items.collectAsStateWithLifecycle()
    val loaded by session.notifications.loaded.collectAsStateWithLifecycle()
    val failed by session.notifications.failed.collectAsStateWithLifecycle()
    val extras by session.notifications.extras.collectAsStateWithLifecycle()
    // Who each row is from and the card it is about: asked once per appearance of the screen, for what
    // isn't known yet — the rows as they arrive, one read after another (never cut short by the next).
    LaunchedEffect(session) {
        val asked = HashSet<String>()
        session.notifications.items.collect { now ->
            session.notifications.loadExtras(
                now, asked,
                person = { uid -> session.conversations.person(uid) ?: session.notifications.readPerson(uid) },
                cards = { ids -> session.reading.cardsByKey(ids).also { read -> read.values.filterNotNull().forEach(session.cardCache::rememberPreview) } },
            )
        }
    }
    // The rows' times and parts follow the clock while the screen is open.
    var now by remember { mutableStateOf(Instant.now()) }
    LaunchedEffect(Unit) {
        while (true) {
            delay(60_000)
            now = Instant.now()
        }
    }
    TabScreen(L10n.App.Nav.notifications, titleInBar = true) {
        when {
            // Nothing read, and the listener failed: a retry, not a loader forever.
            !loaded && failed -> item {
                OrganicEmptyState(L10n.Native.loadError, L10n.Native.retry, { session.notifications.resume() }, action = EmptyAction.Outline)
            }
            // Still reading: the rows' own shapes, not a loader.
            !loaded -> item(key = "skeleton") { NotificationsSkeleton() }
            items.isEmpty() -> item {
                OrganicEmptyState(
                    L10n.App.Notifications.empty, title = L10n.App.Notifications.emptyTitle, icon = IconName.Bell, seed = 37.0,
                    fill = true, modifier = Modifier.fillParentMaxHeight(),
                )
            }
            else -> bellParts(items, now).forEachIndexed { part, (group, rows) ->
                item(key = "part:${group.name}", contentType = "bellPart") {
                    BasicText(
                        group.title,
                        style = AppFonts.body(13f, 600, lineHeight = 1.4f, color = Tokens.TextMuted),
                        modifier = Modifier.readableColumn().padding(horizontal = 20.dp)
                            .padding(top = if (part == 0) 0.dp else 14.dp, bottom = 4.dp)
                            .semantics { heading() },
                    )
                }
                items(rows, key = { it.id }, contentType = { "notification" }) { item ->
                    Box(Modifier.padding(top = if (item === rows.first()) 0.dp else 2.dp)) {
                        NotificationRow(item, extras, BellTime.words(item.createdAt?.toInstant() ?: now, now, Strings.language.locale, L10n.App.Notifications.justNow)) {
                            // The bell row is read; a conversation is marked read only by opening it, which an anonymous card's row never does.
                            session.notifications.markRead(item)
                            notificationRoute(item)?.let(open)
                        }
                    }
                }
            }
        }
    }
}

/** The row's face, its card, and the gap between the parts of a row. */
private val BellFace = 40.dp
private val BellThumb = 46.dp

/**
 * The bell's rows still on their way: six of a row's measures — the 40 face, two lines of words, and
 * on two of them the 46 card — with no rules between them. iOS's NotificationsSkeleton.
 */
@Composable
private fun NotificationsSkeleton() {
    // One clock for its blocks (composed together).
    SharedShimmer {
        val lines = listOf(0.82f, 0.64f, 0.9f, 0.58f, 0.76f, 0.7f)
        Column(Modifier.readableColumn().padding(horizontal = 20.dp).semantics { contentDescription = L10n.Home.moreLoading }, verticalArrangement = Arrangement.spacedBy(2.dp)) {
            for (i in lines.indices) {
                Row(Modifier.fillMaxWidth().padding(vertical = 10.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    Skeleton(Modifier.width(BellFace), height = BellFace, radius = 13.dp)
                    Column(Modifier.weight(1f).padding(top = 3.dp), verticalArrangement = Arrangement.spacedBy(9.dp)) {
                        Skeleton(Modifier.fillMaxWidth(lines[i]), height = 14.dp)
                        Skeleton(Modifier.fillMaxWidth(0.3f), height = 11.dp)
                    }
                    if (i == 0 || i == 2) Skeleton(Modifier.width(BellThumb), height = BellThumb, radius = 12.dp)
                }
            }
        }
    }
}

/**
 * One row (BellRow.tsx): who did it — their face — on the left; their pen name in bold and what they
 * did, a note's words quoted under it, and when; the card it is about on the right. Unread: the
 * sentence in the text's ink and the 6 terracotta dot 8 after it, ending its first line (TalkBack
 * hears 未讀); read, the sentence muted, the name always in the text's ink. A press washes the row's
 * own wobbly outline, as the conversation list's rows do.
 */
@Composable
private fun NotificationRow(item: NotificationsStore.Item, extras: NotificationsStore.Extras, time: String, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    val hovered by source.collectIsHoveredAsState()
    val seed = (seedFromString(item.id) % 97).toDouble()
    val wash = Tokens.TowardInk.copy(alpha = 0.045f)
    val unread = item.isUnread
    val sentence = bellSentence(item)
    val cardId = item.cardId?.takeIf { it.isNotEmpty() }
    val card = cardId?.let { extras.cards[it] }
    val preview = item.preview?.takeIf { item.type == "note" && it.isNotEmpty() }
    Row(
        Modifier
            .readableColumn()
            .padding(horizontal = 8.dp)
            .fillMaxWidth()
            .hoverable(source)
            .pointerHoverIcon(PointerIcon.Hand)
            .drawWithCache {
                val h = (size.height / density).toDouble()
                val outline = WobRectShape(
                    h * 0.28, seed, mag = 2.4,
                    options = WobRectOptions(curve = 1.3, cornerJitter = 2.4, cornerOffset = h * 0.05, segmentsH = SegValue.Count(3.0), segmentsV = SegValue.Count(1.0)),
                ).createOutline(size, layoutDirection, this)
                onDrawBehind { if (pressed || hovered) drawOutline(outline, wash) }
            }
            .clickable(source, indication = null, role = Role.Button, onClick = onClick)
            .padding(horizontal = 12.dp, vertical = 10.dp),
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        if (sentence.handle != null) {
            val uid = item.fromUserId.orEmpty()
            Face(extras.people[uid], sentence.handle, uid, settled = uid.isEmpty() || extras.personSettled(uid))
        } else {
            GlyphTile(item.type)
        }
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(4.dp)) {
            Sentence(sentence, unread)
            if (preview != null) NoteQuote(preview, card)
            BasicText(time, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted))
        }
        when {
            cardId == null -> Unit
            card != null -> CardThumb(card)
            // Still being read: its place kept; read and not there (gone, in the trash), nothing — the words take the room.
            !extras.cardSettled(cardId) -> ThumbFace(cardId) { Box(Modifier.fillMaxSize().background(Mixes.SkeletonBase)) }
        }
    }
}

/**
 * The sentence: the pen name semibold in the text's ink, the words around it in the text's ink while
 * unread and muted once read, and the unread dot 8 after it — inline, so it ends the sentence's line.
 */
@Composable
private fun Sentence(sentence: BellSentence, unread: Boolean) {
    val density = LocalDensity.current
    val name = Tokens.Text
    val dot = Tokens.Terracotta
    val text = buildAnnotatedString {
        append(sentence.before)
        if (sentence.handle != null) withStyle(SpanStyle(fontFamily = AppFonts.family(AppFonts.Family.Body, 600), color = name)) { append(sentence.handle) }
        append(sentence.after)
        if (unread) appendInlineContent(DOT, "•")
    }
    val inline = if (!unread) emptyMap() else mapOf(
        DOT to InlineTextContent(
            with(density) { Placeholder(14.dp.toSp(), 6.dp.toSp(), PlaceholderVerticalAlign.TextCenter) },
        ) {
            Box(Modifier.fillMaxSize().padding(start = 8.dp).drawBehind { drawCircle(dot) })
        },
    )
    val spoken = if (unread) "${sentence.whole}, ${L10n.App.Notifications.unread}" else sentence.whole
    BasicText(
        text,
        style = AppFonts.body(14f, lineHeight = 1.45f, color = if (unread) Tokens.Text else Tokens.TextMuted),
        inlineContent = inline,
        modifier = Modifier.clearAndSetSemantics { contentDescription = spoken },
    )
}

private const val DOT = "unread"

/**
 * Who it is from: their photo, else their initials on their colour (the conversation list's avatar);
 * a quiet tile while they are read; a profile that is gone, the initials of the pen name the row names.
 */
@Composable
private fun Face(person: Person?, handle: String, uid: String, settled: Boolean) {
    if (person == null && !settled) {
        Box(Modifier.size(BellFace).background(Mixes.SkeletonBase, RoundedCornerShape(13.dp, 15.dp, 13.dp, 15.dp)))
        return
    }
    val initials = person?.initials ?: handle.codePoints().limit(2).toArray().joinToString("") { String(Character.toChars(it)) }.uppercase().ifEmpty { "?" }
    HandDrawnAvatar(
        initials, person?.avatarUrl, avatarFill(person?.accentColor),
        size = BellFace, seed = seedOr(person?.avatarSeed, (seedFromString(uid.ifEmpty { handle }) % 50 + 1).toDouble()),
    )
}

/** A row with nobody behind it (a summary, a translation, an expired invite): its glyph on a light terracotta tile. */
@Composable
private fun GlyphTile(type: String) {
    val glyph = when (type) {
        "resonance_summary" -> IconName.Sparkle
        "translation_done" -> IconName.Globe
        "invite_expired" -> IconName.Users
        else -> IconName.Bell
    }
    Box(
        Modifier.size(BellFace).background(Tokens.TerracottaLight.copy(alpha = 0.4f), RoundedCornerShape(13.dp, 15.dp, 13.dp, 15.dp)),
        contentAlignment = Alignment.Center,
    ) {
        OrganicIcon(glyph, size = 18.dp, color = Tokens.Terracotta)
    }
}

/**
 * A note's words as the bell quotes them (C's note quote): the story's serif, 14, up to three lines,
 * 14 in after a wavy rule at the house pen in its card's family pen — the quiet sheet pen until the
 * card is known.
 */
@Composable
private fun NoteQuote(text: String, card: FeedCard?) {
    val pen = if (card != null) CardPalette.of(previewFamily(card.accentHue, card.id)).border else Tokens.FieldBorderHover
    BasicText(
        text,
        style = AppFonts.style(AppFonts.Family.HeadingCJK, 14f, lineHeight = 1.65f, color = Tokens.Text),
        maxLines = 3,
        overflow = TextOverflow.Ellipsis,
        modifier = Modifier
            .padding(vertical = 1.dp)
            .drawBehind {
                val h = size.height / density
                val path = wavyVertical(h.toDouble(), 7.0, 1.4, max(2, (h / 20).roundToInt())).toPath(density, 3.dp.toPx(), 0f)
                drawPath(path, pen, style = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round))
            }
            .padding(start = 14.dp),
    )
}

/**
 * The card a row is about, at 46: its cover clipped to a small hand-drawn tile with no pen line (a feed
 * card's picture has none either), else its family's fill with the first character of its title.
 */
@Composable
private fun CardThumb(card: FeedCard) {
    val family = CardPalette.of(previewFamily(card.accentHue, card.id))
    val cover = card.imageUrl
    val colors = family.colors
    ThumbFace(card.id) {
        Box(Modifier.fillMaxSize().background(if (cover != null) colors.skeleton else colors.fill), contentAlignment = Alignment.Center) {
            if (cover != null) {
                AsyncImage(cover, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                val first = card.title.trim().let { t -> if (t.isEmpty()) "" else String(Character.toChars(t.codePointAt(0))) }
                BasicText(first, style = AppFonts.style(AppFonts.Family.HeadingCJK, 19f, 600, lineHeight = 1f, color = colors.deep))
            }
        }
    }
}

/** How far the thumb's face reaches past its 46 box: the outline's swells go out by up to 2.1. */
private val ThumbBleed = 4.dp

/**
 * The thumb's place in the row (46) and its face, which reaches past it by [ThumbBleed] on every side and
 * is cut by [BellThumbOutline] — so the outline's outward swells land on the picture. A card still being
 * read wears the same outline (its id's), so nothing changes shape when it lands.
 */
@Composable
private fun ThumbFace(cardId: String, content: @Composable () -> Unit) {
    val seed = (seedFromString(cardId) % 97).toDouble()
    val shape = remember(seed) { BellThumbOutline(seed) }
    Box(Modifier.size(BellThumb), contentAlignment = Alignment.Center) {
        Box(Modifier.requiredSize(BellThumb + ThumbBleed * 2).clip(shape)) { content() }
    }
}

/**
 * The thumb's outline: a small hand-drawn tile, one gentle swell along each side and its corners unevenly
 * round and set off a little — the web's `bellThumbPath` (`wobRect(46, 46, 46 × 0.26, seed, 46 × 0.05,
 * two turns a side, curve 1.4, jitter 2.6, offset 46 × 0.07)`), drawn set in by [ThumbBleed].
 */
private data class BellThumbOutline(val seed: Double) : Shape {
    private val tile = WobRectShape(
        BellThumb.value * 0.26, seed, mag = BellThumb.value * 0.05,
        options = WobRectOptions(curve = 1.4, cornerJitter = 2.6, cornerOffset = BellThumb.value * 0.07, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(2.0)),
    )

    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val b = with(density) { ThumbBleed.toPx() }
        val inner = tile.createOutline(Size(size.width - b * 2, size.height - b * 2), layoutDirection, density)
        val path = Path().apply {
            addOutline(inner)
            translate(Offset(b, b))
        }
        return Outline.Generic(path)
    }
}

/**
 * Where a notification leads (the web's hrefs, NotificationBell): these open the
 * conversation with that person (by who they are, so a pen name changed since
 * still finds them); a note arrives quoted, ready to answer. A note or resonance
 * on an anonymous card of yours opens that card instead — never its writer's
 * conversation, and so no reply to it (as its push does: lib/push pushRoute).
 */
internal fun notificationRoute(item: NotificationsStore.Item): Route? = when {
    item.onAnonymousCard -> item.cardId?.let { Route.Card(it) }
    else -> when (item.type) {
        "translation_done", "card_link" -> item.cardId?.let { Route.Card(it) }
        "note" -> item.fromHandle?.let { handle -> Route.Thread(handle, item.cardId?.takeIf { item.noteId != null }, item.noteId?.takeIf { item.cardId != null }, item.fromUserId) }
        "invite_accepted", "message", "resonance" -> item.fromHandle?.let { Route.Thread(it, uid = item.fromUserId) }
        else -> null
    }
}
