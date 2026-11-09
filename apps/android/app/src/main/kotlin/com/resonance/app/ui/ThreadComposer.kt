package com.resonance.app.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.offset
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import com.resonance.design.WobCircleShape
import com.resonance.geometry.WobCircleOptions
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEvent
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.isAltPressed
import androidx.compose.ui.input.key.isCtrlPressed
import androidx.compose.ui.input.key.isMetaPressed
import androidx.compose.ui.input.key.isShiftPressed
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.isTraversalGroup
import coil3.compose.AsyncImage
import com.resonance.design.AppFonts
import com.resonance.design.ComposerCapsule
import com.resonance.design.ComposerHeight
import com.resonance.design.ComposerLeadShape
import com.resonance.design.ComposerLeadSize
import com.resonance.design.ComposerRow
import com.resonance.design.ComposerRowHeight
import com.resonance.design.ComposerRowsTop
import com.resonance.design.ComposerShortRowHeight
import com.resonance.design.ComposerShortThumb
import com.resonance.design.ComposerShortViewport
import com.resonance.design.ComposerStripPad
import com.resonance.design.ComposerStripThumb
import com.resonance.design.ComposerErrorRow
import com.resonance.design.ComposerTileFace
import com.resonance.design.ChatPictureSource
import com.resonance.design.sideFades
import com.resonance.design.ComposerSegment
import com.resonance.design.ComposerTile
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIndication
import com.resonance.design.ReplyRule
import com.resonance.design.SketchLoader
import com.resonance.design.bareMenuOpen
import com.resonance.design.blocksTouches
import com.resonance.design.composerFades
import com.resonance.design.composerPadding
import com.resonance.design.fieldHintStyle
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.lineHeightOf
import com.resonance.kit.chat.ComposerPanel
import com.resonance.kit.chat.PanelMachine
import com.resonance.kit.chat.PanelState
import com.resonance.kit.chat.ReplyQuote
import com.resonance.kit.chat.ChatMessage
import com.resonance.api.models.FeedCard
import java.util.Date
import com.resonance.kit.chat.ChatSticker
import com.resonance.kit.chat.StickerCatalog
import com.resonance.kit.chat.SegmentRole
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings

/**
 * The message being written (round 9 §4, round 22 §4, round 23 §2): one floating capsule ([ComposerCapsule]) —
 * `[＋][ field … ☺ ][seam│➤]`: 「＋」 at its start (the attach panel: 圖片｜卡片), the field, ☺ just
 * before the send segment (the sticker panel; ⌨ while it shows), and Send as its end segment — ↑ / ↓
 * while the sticker panel shows with nothing to send ([PanelMachine.segment]). Inside its pen line, over the text,
 * what rides with the message as rows ([ComposerRows], Telegram's way, the owner's): the reply, the note answered,
 * the card, the pictures chosen (a strip of thumbnails), why the last one didn't go — each row's mark over ＋, its
 * words where the field's start, its ✕ over Send. Nothing rides above the capsule any more.
 *
 * The field grows to five lines (three in a short window), then scrolls, its words fading at the edge there is more
 * beyond ([composerFades]) right to the capsule's pen line. ☺ is there only while the field is empty (the owner's
 * notes 1: words and a sticker don't go together) — the words take its room. Past one line, or with anything riding,
 * Send is a 52 × 48 block on the last row, its top start corner rounded; from three lines ⤢ stands in that column at
 * the text's top, under the rows ([composerTools]). ⤢ grows the capsule to the thread ([expandedHeight], option C —
 * the screen works out how far, for the whole capsule: the text takes what the rows leave), ⤡ (in the same place)
 * brings it back, and sending does too. The caret, the IME's composition and the keyboard are untouched by either:
 * it is the same text field throughout, and nothing in the capsule takes its focus.
 */
@Composable
internal fun Composer(
    model: ThreadModel,
    handle: String,
    focus: FocusRequester,
    panel: PanelState,
    onStickers: () -> Unit,
    onAttach: () -> Unit,
    onSegment: (SegmentRole) -> Unit,
    onFieldTap: () -> Unit,
    expandedHeight: Dp?,
    onExpand: () -> Unit,
    onCollapse: () -> Unit,
    modifier: Modifier = Modifier,
    /** The reply row's words: to the message it answers, pulsed. */
    onQuote: (String) -> Unit = {},
    /** A note's or a card's row: the field (the keyboard back over a panel). */
    onFocusField: () -> Unit = {},
) {
    var focused by remember { mutableStateOf(false) }
    var lines by remember { mutableIntStateOf(1) }
    val role = PanelMachine.segment(panel, model.hasSomethingToSend)
    val expanded = expandedHeight != null
    val riding = rides(model)
    val short = LocalConfiguration.current.screenHeightDp.dp < ComposerShortViewport
    val tools = composerTools(model.draft, lines, expanded, riding)
    // How tall the rows are (px): grown, the text takes what they leave of the capsule's height.
    var header by remember { mutableIntStateOf(0) }
    val density = LocalDensity.current
    Column(modifier.fillMaxWidth()) {
        val line = lineHeightOf(ComposerText)
        val vertical = composerPadding(line)
        ComposerCapsule(
            canSend = model.canSend,
            sendLabel = when (role) {
                SegmentRole.Send -> L10n.Messages.send
                SegmentRole.Expand -> L10n.Messages.stickerPanelExpand
                SegmentRole.Collapse -> L10n.Messages.stickerPanelCollapse
            },
            onSend = { onSegment(role) },
            focused = { focused },
            textStyle = ComposerText,
            modifier = Modifier.blocksTouches(),
            segment = when (role) {
                SegmentRole.Send -> ComposerSegment.Send
                SegmentRole.Expand -> ComposerSegment.Expand
                SegmentRole.Collapse -> ComposerSegment.Collapse
            },
            block = tools.block,
            // ⤢ from the third line, ⤡ while grown: a square ghost button in the send block's column, at the text's top.
            overSegment = if (!tools.expand && !tools.collapse) null else { {
                ToolButton(
                    icon = if (tools.collapse) IconName.Collapse else IconName.Expand,
                    label = if (tools.collapse) L10n.Messages.collapseComposer else L10n.Messages.expandComposer,
                    size = 18.dp,
                    modifier = Modifier.fillMaxSize(),
                    onClick = if (tools.collapse) onCollapse else onExpand,
                )
            } },
            leading = { AttachButton(open = panel.panel == ComposerPanel.Attach, onClick = onAttach) },
            // ☺ on the last line's row, beside Send — only while there are no words (⌨ while its panel shows); ＋'s twin.
            trailing = if (!tools.sticker) null else { { StickerToggle(keyboard = panel.panel == ComposerPanel.Stickers, onClick = onStickers) } },
            header = if (!riding) null else { {
                ComposerRows(model, short, onQuote, onFocusField, Modifier.onSizeChanged { header = it.height })
            } },
        ) { _ ->
            Box(Modifier.fillMaxWidth()) {
                val scroll = rememberScrollState()
                val source = remember { MutableInteractionSource() }
                LaunchedEffect(source) {
                    source.interactions.collect { if (it is PressInteraction.Release) onFieldTap() }
                }
                // Five lines and their air (three in a short window), then it scrolls in place; grown, what the capsule
                // the screen gave leaves under the rows — never under three lines.
                val rowsHeight = if (riding) with(density) { header.toDp() } else 0.dp
                val boxHeight = expandedHeight?.let { (it - rowsHeight).coerceAtLeast(ComposerHeight * 3) }
                    ?: (line * (if (short) SHORT_MAX_LINES else MAX_LINES) + vertical * 2)
                Box(
                    Modifier
                        .then(if (expanded) Modifier.height(boxHeight) else Modifier.heightIn(max = boxHeight))
                        .composerFades(scroll)
                        .verticalScroll(scroll),
                ) {
                    if (model.draft.isEmpty()) {
                        BasicText(
                            L10n.Messages.placeholder,
                            style = fieldHintStyle(L10n.Messages.placeholder, ComposerText.fontSize.value, COMPOSER_LEADING),
                            maxLines = 1, overflow = TextOverflow.Ellipsis,
                            modifier = Modifier.padding(vertical = vertical),
                        )
                    }
                    BasicTextField(
                        model.draft, { model.draft = capped(it, NOTE_MAX_LENGTH) },
                        textStyle = ComposerText,
                        cursorBrush = SolidColor(Tokens.Text),
                        minLines = 1,
                        interactionSource = source,
                        onTextLayout = { lines = it.lineCount },
                        modifier = Modifier
                            .fillMaxWidth()
                            .then(if (expanded) Modifier.heightIn(min = boxHeight) else Modifier)
                            .padding(vertical = vertical)
                            // A hardware keyboard's Return sends and Shift-Return starts a line, as on the web;
                            // a composition in progress keeps its Return (the IME takes it first), and the soft
                            // keyboard's Enter is always a new line. Escape lets the reply go (no panel open).
                            .onPreviewKeyEvent { e ->
                                when {
                                    cancelsReply(e, model.replyingTo != null, panel.panelOpen) -> { model.cancelReply(); true }
                                    else -> sendsOnReturn(e).also { if (it && model.canSend) onSegment(SegmentRole.Send) }
                                }
                            }
                            .focusRequester(focus)
                            .onFocusChanged { focused = it.isFocused }
                            .semantics { contentDescription = L10n.Messages.threadWith(handle) },
                    )
                }
            }
        }
    }
}

/** The composer's words: 16 (× the interface's text size, capped at 1.25), 1.5 apart. */
private const val COMPOSER_LEADING = 1.5f
internal val ComposerText: TextStyle @Composable @ReadOnlyComposable get() = AppFonts.body(16f, lineHeight = COMPOSER_LEADING)

/**
 * Which of the composer's tools show (round 22 §4.3 with the owner's notes 1–2, round 23 §2): ☺ only while the field
 * holds no words and isn't grown; Send a block on the last row past one line, grown, or with anything [riding] (the
 * owner's: the one button at the bottom right, as a message of many lines has it); ⤢ at the text's top from
 * [EXPAND_FROM_LINES] lines (never sooner because rows ride), ⤡ in its place while grown.
 */
internal data class ComposerTools(val sticker: Boolean, val block: Boolean, val expand: Boolean, val collapse: Boolean)

internal fun composerTools(text: String, lines: Int, expanded: Boolean, riding: Boolean = false): ComposerTools = ComposerTools(
    sticker = text.isBlank() && !expanded,
    block = expanded || lines > 1 || riding,
    expand = !expanded && lines >= EXPAND_FROM_LINES,
    collapse = expanded,
)

/**
 * Whether a key is Escape going down with a reply riding and no panel open: it lets the reply go (round 23 §2; with a
 * panel open, Escape is the panel's).
 */
internal fun cancelsReply(e: KeyEvent, replying: Boolean, panelOpen: Boolean): Boolean =
    replying && !panelOpen && e.type == KeyEventType.KeyDown && e.key == Key.Escape

/** The field grows to this many lines, then scrolls (round 22 §4.3); in a short window, three (round 23 §2). */
private const val MAX_LINES = 5
private const val SHORT_MAX_LINES = 3
/** ⤢ shows from this many lines (round 22 §4.3: "超過 2 行"). */
internal const val EXPAND_FROM_LINES = 3

/** Whether anything rides with the message: a reply, the note answered, a card, pictures, an error. */
internal fun rides(model: ThreadModel): Boolean =
    ridingRows(
        reply = model.replyingTo != null, note = model.noteRef != null, card = model.pendingCard != null,
        picture = model.pictures.isNotEmpty(), error = model.error != null,
    ).isNotEmpty()

/** What rides with the message, top to bottom (round 10 §3.4): the reply, the note answered, the card or the pictures, then why the last one didn't go. */
internal enum class Riding { Reply, Note, Card, Picture, Error }

internal fun ridingRows(reply: Boolean, note: Boolean, card: Boolean, picture: Boolean, error: Boolean): List<Riding> = buildList {
    if (reply) add(Riding.Reply)
    if (note) add(Riding.Note)
    if (card) add(Riding.Card)
    if (picture) add(Riding.Picture)
    if (error) add(Riding.Error)
}

/**
 * The rows riding with the message, inside the capsule over the text (round 23 §2), [ComposerRowsTop] under its pen
 * line, touching, each mark · words · ✕ ([ComposerRow]): the reply (the wavy terracotta rule; whom to over a line of
 * what — a sticker, a picture or a card it answers as a 36 thumbnail before the words; the words go to the message),
 * the note answered (its glyph on the tonal tile), the card (its cover on the tile, else its glyph; 卡片 over its
 * title), the pictures chosen ([PictureStrip]), and why the last message didn't go ([ComposerErrorRow]). One group
 * for TalkBack: 「隨訊息一起送出」, each ✕ naming what it takes away.
 */
@Composable
private fun ComposerRows(model: ThreadModel, short: Boolean, onQuote: (String) -> Unit, onFocusField: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier
            .fillMaxWidth()
            .padding(top = ComposerRowsTop)
            .semantics {
                isTraversalGroup = true
                contentDescription = L10n.Messages.composerRiding
            },
    ) {
        val reply = model.replyingTo
        val note = model.noteRef
        val card = model.pendingCard
        val error = model.error
        val rowHeight = if (short) ComposerShortRowHeight else ComposerRowHeight
        val rule: @Composable () -> Unit = { ReplyRule(Modifier.height(rowHeight - REPLY_RULE_INSET)) }
        ridingRows(reply != null, note != null, card != null, model.pictures.isNotEmpty(), error != null).forEach { row ->
            when (row) {
                Riding.Reply -> reply?.let { quote ->
                    val toSelf = quote.senderId == model.me
                    val who = if (toSelf) L10n.Messages.replyingToSelf else L10n.Messages.replyingTo(model.other?.handle.orEmpty())
                    val jump = { onQuote(quote.id) }
                    when (val detail = replyDetail(quote)) {
                        is ReplyDetail.Words -> ComposerRow(
                            who, detail.text, L10n.Messages.replyCancel, { model.cancelReply() },
                            short = short, onTap = jump,
                            media = replyMedia(model, quote),
                            lead = rule,
                        )
                        // A sticker: its key pose alone before whom it answers, no words (the owner's) — its name for TalkBack.
                        is ReplyDetail.Sticker -> ComposerRow(
                            who, null, L10n.Messages.replyCancel, { model.cancelReply() },
                            short = short, onTap = jump,
                            media = {
                                StickerPose(detail.sticker, model.origin, Modifier.fillMaxSize().alpha(QUOTED_STICKER_ALPHA).semantics { contentDescription = detail.spoken })
                            },
                            lead = rule,
                        )
                    }
                }
                Riding.Note -> ComposerRow(
                    L10n.Messages.quotedNote, null, L10n.Messages.removeNote, { model.noteRef = null },
                    short = short, onTap = onFocusField,
                ) { ComposerTile(IconName.Note) }
                Riding.Card -> card?.let { c ->
                    // A 私人卡 says so where 卡片 would: the message is what lets them read it.
                    ComposerRow(
                        if (c.keptPrivate) L10n.Messages.privateCard else L10n.Messages.attachCardShort, c.title, L10n.Messages.removeCard, { model.pendingCard = null },
                        short = short, onTap = onFocusField,
                    ) {
                        ComposerTile(IconName.Cards) {
                            c.cover?.let { AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                        }
                    }
                }
                Riding.Picture -> PictureStrip(model, short)
                Riding.Error -> error?.let { ComposerErrorRow(it) }
            }
        }
    }
}

/** The reply's rule stands this much shorter than its row (8 clear above and below). */
private val REPLY_RULE_INSET = 16.dp

/**
 * What a reply answers, as a 36 thumbnail before its words (Telegram's photo reply): the picture it quotes, or the
 * cover of the card it quotes — as the thread holds that message now; none for words (or a picture not held).
 */
private fun replyMedia(model: ThreadModel, quote: ReplyQuote): (@Composable () -> Unit)? {
    if (quote.unsent) return null
    val original = model.find(quote.id)
    val picture = original?.let(model::picture)
    if (picture != null) return {
        Box(Modifier.fillMaxSize().clip(ComposerLeadShape).background(Tokens.CreamDark)) {
            when (picture) {
                is ChatPictureSource.Local -> Image(picture.preview, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                is ChatPictureSource.Remote -> model.pictureLoader?.let { loader ->
                    AsyncImage(model = picture.thumb, contentDescription = null, imageLoader = loader, modifier = Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                }
            }
        }
    }
    val cover = replyCover(quote, original, model.cards, model.me)
    if (cover != null) return {
        Box(Modifier.fillMaxSize().clip(ComposerLeadShape).background(ComposerTileFace)) {
            AsyncImage(model = cover, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
    return null
}

/**
 * The cover of the card [quote] quotes, as the bubble would draw that card: none for one the viewer can't read — not
 * read, or someone else's 私人卡 whose sharing ended ([sharingEnded], on the [original] message as the thread holds it
 * now; one it doesn't hold, a draft's reply to an older page, is judged as carrying no pass).
 */
internal fun replyCover(quote: ReplyQuote, original: ChatMessage?, cards: Map<String, FeedCard?>, me: String?): String? {
    val ref = quote.cardRef ?: return null
    val card = cards[ref] ?: return null
    val message = original ?: ChatMessage(quote.id, quote.senderId, "", Date(0), cardRef = ref)
    return card.imageUrl.takeUnless { sharingEnded(message, card, me) }
}

/**
 * The pictures riding with the message (round 22 §4.2, the owner's notes 5; round 23 §2: inside the capsule): their
 * 56 thumbnails ([ComposerStripThumb]; 44 in a short window) in a row in the order chosen across the capsule's inner
 * width ([ComposerStripPad] in from its pen line), scrolling sideways past what fits and fading at the side more lies
 * beyond, each with its own small round ✕ over its top end corner — the only way to take one back here (the
 * gallery's tap does too), named for its place. No numbers, no count, no clear-all.
 */
@Composable
private fun PictureStrip(model: ThreadModel, short: Boolean) {
    val scroll = rememberScrollState()
    val thumb = if (short) ComposerShortThumb else ComposerStripThumb
    Row(
        Modifier
            .fillMaxWidth()
            .height(ComposerStripPad + thumb + ComposerStripPad)
            .padding(horizontal = ComposerStripPad)
            .sideFades({ scroll.canScrollBackward }, { scroll.canScrollForward })
            .horizontalScroll(scroll)
            // Room at the end for the last ✕'s swing past its thumbnail.
            .padding(end = THUMB_X_SWING),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        model.pictures.forEachIndexed { i, picture ->
            // The thumbnail, and its ✕ swinging past its corner (into the strip's pad above it and the gap beside it).
            Box(Modifier.size(thumb)) {
                Box(
                    Modifier
                        .matchParentSize()
                        .clip(ComposerLeadShape)
                        .background(Tokens.CreamDark)
                        .semantics { contentDescription = "${L10n.Messages.attachImage} ${i + 1}" },
                    contentAlignment = Alignment.Center,
                ) {
                    val preview = picture.prepared?.preview
                    if (preview != null) Image(preview, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else SketchLoader(18.dp)
                }
                // Its centre 6 inside the thumbnail's corner (iOS's), the circle swinging 4 past it.
                ThumbRemoveButton(
                    L10n.Messages.removeImageAt(i + 1),
                    Modifier.align(Alignment.TopEnd).offset(x = THUMB_X_TARGET / 2 - THUMB_X_INSET, y = THUMB_X_INSET - THUMB_X_TARGET / 2),
                ) { model.removePicture(picture.key) }
            }
        }
    }
}

/** Its ✕: 20 across, in a 32 target, its centre [THUMB_X_INSET] inside the thumbnail's top end corner, swinging [THUMB_X_SWING] past it. */
private val THUMB_X = 20.dp
private val THUMB_X_TARGET = 32.dp
private val THUMB_X_INSET = 6.dp
private val THUMB_X_SWING = 4.dp

/**
 * A thumbnail's ✕ (the owner's notes 5): a neat small round button — the paper inside a hand-drawn circle that
 * barely wobbles (its swing well under the usual circle's, which read as a blob at this size), the fields' quiet
 * pen at INK_LIGHT, the close glyph 10 in the text ink.
 */
@Composable
private fun ThumbRemoveButton(label: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val paper = Tokens.Cream
    val pen = Tokens.FieldBorder
    Box(
        modifier
            .size(THUMB_X_TARGET)
            .clickable(interactionSource = null, indication = null, role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier.size(THUMB_X).drawWithCache {
                val o = WobCircleShape(13.0, NeatCircle).createOutline(size, layoutDirection, this)
                val line = Stroke(Tokens.InkLight.toPx())
                onDrawBehind {
                    drawOutline(o, paper)
                    drawOutline(o, pen, style = line)
                }
            },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Close, size = 10.dp, color = Tokens.Text, strokeWidth = Tokens.Ink.value) }
    }
}

/** A small round button's circle: ten anchors, a swing of 0.35 (the usual 1.5 makes a 20 circle a blob). */
private val NeatCircle = WobCircleOptions(segments = 10, mag = 0.35, cpJitter = 0.2)

/**
 * A picture's place in the order chosen (round 22 §4.2): its number on the accent's solid disc in cream,
 * ringed in the paper so it reads over any picture.
 */
@Composable
internal fun NumberBadge(number: Int, modifier: Modifier = Modifier, small: Boolean = false) {
    val size = if (small) 16.dp else 24.dp
    Box(
        modifier
            .size(size)
            .clip(CircleShape)
            .background(Tokens.ButtonFill)
            .border(1.5.dp, Tokens.Cream, CircleShape),
        contentAlignment = Alignment.Center,
    ) {
        BasicText(
            number.toString(),
            style = AppFonts.body(if (small) 9.5f else 12.5f, 700, lineHeight = 1f, color = Tokens.Cream).copy(textAlign = TextAlign.Center),
        )
    }
}

/**
 * 「＋」 (附上圖片或卡片), the capsule's ghost button (48 × 48, the glyph 22 in the muted ink): the attach
 * panel in the keyboard's place (round 22 §4.2). While it shows the glyph takes the full ink over a soft
 * disc, as the web's bare trigger does (round 17 review A10: never the accent).
 */
@Composable
private fun AttachButton(open: Boolean, onClick: () -> Unit) {
    Box(
        Modifier
            .size(ComposerHeight)
            // The web's ＋ is 44 wide in its 48 row: its disc is that box's.
            .bareMenuOpen(open, seed = AttachSeed, inset = 2.dp)
            .clickable(interactionSource = null, indication = OrganicIndication(inset = 6.dp), role = Role.Button, onClickLabel = L10n.Messages.attach, onClick = onClick)
            .semantics { contentDescription = L10n.Messages.attach },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(IconName.Plus, size = 22.dp, color = if (open) Tokens.Text else Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
}

/**
 * ☺ (貼圖) — ⌨ (鍵盤) while its panel shows — the capsule's ghost button at the field's end: ＋'s twin (the owner's:
 * every tool in the capsule one size), a 48 square, the glyph 22 in the muted ink, the same press ink.
 */
@Composable
private fun StickerToggle(keyboard: Boolean, onClick: () -> Unit) {
    val label = if (keyboard) L10n.Messages.keyboard else L10n.Messages.stickers
    Box(
        Modifier
            .size(ComposerHeight)
            .clickable(interactionSource = null, indication = OrganicIndication(inset = 6.dp), role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(if (keyboard) IconName.Keyboard else IconName.Smile, size = 22.dp, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
}

/** A tool inside the capsule (⤢ / ⤡): its glyph in the muted ink, the bare press ink round it. */
@Composable
private fun ToolButton(
    label: String,
    size: Dp,
    modifier: Modifier,
    icon: IconName,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .clickable(interactionSource = null, indication = OrganicIndication(inset = 4.dp), role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(icon, size = size, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
}

/** The ＋'s open disc's seed: the web's composer gives its menu, and so its bare trigger's disc, 17. */
private const val AttachSeed = 17.0

/**
 * Whether a key is a hardware keyboard's plain Return (no Shift, Alt, Ctrl or Meta) going down —
 * the send key. The soft keyboard's Enter (flagged, or from the virtual device) stays a new line.
 */
internal fun sendsOnReturn(e: KeyEvent): Boolean {
    val n = e.nativeKeyEvent
    if (e.type != KeyEventType.KeyDown || (e.key != Key.Enter && e.key != Key.NumPadEnter)) return false
    if (e.isShiftPressed || e.isAltPressed || e.isCtrlPressed || e.isMetaPressed) return false
    val soft = (n.flags and android.view.KeyEvent.FLAG_SOFT_KEYBOARD) != 0 || n.deviceId == android.view.KeyCharacterMap.VIRTUAL_KEYBOARD
    return !soft
}

/** What a quote says for a message that had no words: 一張圖片 for a picture, 一張卡片 for a card. */
internal fun quoteStandIn(quote: ReplyQuote): String = if (quote.image) L10n.Messages.replyImage else L10n.Messages.replyCard

/** What the composer's reply row shows under whom it answers: the quoted words, or a sticker's key pose alone. */
internal sealed interface ReplyDetail {
    data class Words(val text: String) : ReplyDetail

    /** A sticker this device can draw: its pose, no words; [spoken] (貼圖：謝謝) is what TalkBack reads. */
    data class Sticker(val sticker: StickerCatalog.Sticker, val spoken: String) : ReplyDetail
}

/**
 * The reply row's detail for [quote]: a sticker [find] knows is its key pose alone (the owner: no 「貼圖：謝謝」 beside
 * it); one this build can't draw, or anything else, the quote's words ([quoteWords]).
 */
internal fun replyDetail(quote: ReplyQuote, find: (ChatSticker) -> StickerCatalog.Sticker? = com.resonance.app.Stickers::find): ReplyDetail {
    val sticker = quote.sticker?.takeIf { !quote.unsent }?.let(find)
    if (sticker != null) return ReplyDetail.Sticker(sticker, L10n.Messages.stickerLabel(sticker.name(Strings.language.tag)))
    return ReplyDetail.Words(quoteWords(quote))
}

/** A replied sticker's pose in the reply row. */
private val REPLIED_STICKER = 32.dp

/**
 * A quote's words, wherever one shows (the composer's reply row, the quote over a reply): a sticker's
 * name (貼圖：謝謝, in this device's language when it knows the sticker, else its fallback words);
 * otherwise the quoted words on one line, or [quoteStandIn] for a message that had none.
 */
internal fun quoteWords(quote: ReplyQuote): String {
    quote.sticker?.let { ref ->
        val known = com.resonance.app.Stickers.find(ref)
        return if (known != null) L10n.Messages.stickerLabel(known.name(Strings.language.tag)) else quote.text.ifEmpty { L10n.Messages.stickerUnknown }
    }
    return quote.text.replace('\n', ' ').ifEmpty { quoteStandIn(quote) }
}
