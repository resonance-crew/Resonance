package com.resonance.app.ui

import androidx.compose.foundation.Image
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
import coil3.compose.AsyncImage
import com.resonance.design.AppFonts
import com.resonance.design.ComposerCapsule
import com.resonance.design.ComposerGlyphs
import com.resonance.design.ComposerHeight
import com.resonance.design.ComposerLeadShape
import com.resonance.design.ComposerLeadSize
import com.resonance.design.ComposerRow
import com.resonance.design.ComposerRowsLead
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
import com.resonance.kit.chat.SegmentRole
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings

/**
 * The message being written (round 9 §4, round 22 §4): one floating capsule ([ComposerCapsule]) —
 * `[＋][ field … ☺ ][seam│➤]`: 「＋」 at its start (the attach panel: 圖片｜卡片), the field, ☺ just
 * before the send segment (the sticker panel; ⌨ while it shows), and Send as its end segment — ↑ / ↓
 * while the sticker panel shows with nothing to send ([PanelMachine.segment]). Above it, 6 over the
 * capsule, what rides with the message as rows in the reply's style ([ComposerRows]): the reply, the
 * note answered, the card, the pictures chosen (a strip of numbered thumbnails), why the last one
 * didn't go. With rows riding the foot starts [ComposerRowsLead] over them (round 11 §3).
 *
 * The field grows to five lines, then scrolls, its words fading at the edge there is more beyond
 * ([composerFades]); from three lines ⤢ stands at its top end. ⤢ grows the same field to the thread
 * ([expandedHeight], option C — the screen works out how far): the capsule's segment becomes a 52 × 48
 * block on its last row, ⤡ brings it back, and sending does too. The caret, the IME's composition and
 * the keyboard are untouched by either: it is the same text field throughout.
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
    onCapsuleHeight: (Int) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    var lines by remember { mutableIntStateOf(1) }
    val role = PanelMachine.segment(panel, model.hasSomethingToSend)
    val expanded = expandedHeight != null
    Column(modifier.fillMaxWidth()) {
        if (rides(model)) {
            Spacer(Modifier.height(ComposerRowsLead))
            ComposerRows(model, Modifier.blocksTouches())
            Spacer(Modifier.height(ROWS_GAP))
        }
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
            modifier = Modifier.blocksTouches().onSizeChanged { onCapsuleHeight(it.height) },
            segment = when (role) {
                SegmentRole.Send -> ComposerSegment.Send
                SegmentRole.Expand -> ComposerSegment.Expand
                SegmentRole.Collapse -> ComposerSegment.Collapse
            },
            block = expanded,
            leading = { AttachButton(open = panel.panel == ComposerPanel.Attach, onClick = onAttach) },
        ) { _ ->
            Box(Modifier.fillMaxWidth()) {
                val scroll = rememberScrollState()
                val source = remember { MutableInteractionSource() }
                LaunchedEffect(source) {
                    source.interactions.collect { if (it is PressInteraction.Release) onFieldTap() }
                }
                // Five lines and their air, then it scrolls in place; grown, the height the screen gave it.
                val boxHeight = expandedHeight ?: (line * MAX_LINES + vertical * 2)
                Box(
                    Modifier
                        .padding(end = TOOL_WIDTH)
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
                            // keyboard's Enter is always a new line.
                            .onPreviewKeyEvent { e -> sendsOnReturn(e).also { if (it && model.canSend) onSegment(SegmentRole.Send) } }
                            .focusRequester(focus)
                            .onFocusChanged { focused = it.isFocused }
                            .semantics { contentDescription = L10n.Messages.threadWith(handle) },
                    )
                }
                // ⤢ at the field's top end from the third line (⤡ while grown); ☺ on the last line's row, beside Send.
                if (expanded || lines >= EXPAND_FROM_LINES) {
                    ToolButton(
                        glyph = if (expanded) ComposerGlyphs.Collapse else ComposerGlyphs.Expand,
                        label = if (expanded) L10n.Messages.collapseComposer else L10n.Messages.expandComposer,
                        size = 18.dp,
                        modifier = Modifier.align(Alignment.TopEnd).size(TOOL_WIDTH, 40.dp),
                        onClick = if (expanded) onCollapse else onExpand,
                    )
                }
                val stickers = panel.panel == ComposerPanel.Stickers
                ToolButton(
                    glyph = if (stickers) ComposerGlyphs.Keyboard else null,
                    icon = if (stickers) null else IconName.Smile,
                    label = if (stickers) L10n.Messages.keyboard else L10n.Messages.stickers,
                    size = 22.dp,
                    modifier = Modifier.align(Alignment.BottomEnd).size(TOOL_WIDTH, ComposerHeight),
                    onClick = onStickers,
                )
            }
        }
    }
}

/** The composer's words: 16 (× the interface's text size, capped at 1.25), 1.5 apart. */
private const val COMPOSER_LEADING = 1.5f
internal val ComposerText: TextStyle @Composable @ReadOnlyComposable get() = AppFonts.body(16f, lineHeight = COMPOSER_LEADING)

/** The field grows to this many lines, then scrolls (round 22 §4.3). */
private const val MAX_LINES = 5
/** ⤢ shows from this many lines (round 22 §4.3: "超過 2 行"). */
internal const val EXPAND_FROM_LINES = 3
/** The column of the field's tools at its end (☺, ⤢). */
private val TOOL_WIDTH = 36.dp

/** The last riding row → the capsule. */
private val ROWS_GAP = 6.dp

/** Whether anything rides with the message: a reply, the note answered, a card, pictures, an error. */
private fun rides(model: ThreadModel): Boolean =
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
 * The rows riding with the message (round 10 §3.4), touching, each lead · text · ✕ ([ComposerRow]):
 * the reply (the wavy terracotta rule; whom to over a line of what), the note answered (its glyph on
 * the tonal tile), the card (its cover as a 40 thumbnail, else its glyph on the tile; 卡片 over its
 * title), the pictures chosen (round 22 §4.2: a strip of 40 thumbnails in the order chosen, each
 * numbered with its own ✕, 「3 張圖片」 beside them, the loader on one still being made ready). Why the
 * last message didn't go is a line of its own under them, at the rows' inset.
 */
@Composable
private fun ComposerRows(model: ThreadModel, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        val reply = model.replyingTo
        val note = model.noteRef
        val card = model.pendingCard
        val error = model.error
        ridingRows(reply != null, note != null, card != null, model.pictures.isNotEmpty(), error != null).forEach { row ->
            when (row) {
                Riding.Reply -> reply?.let { quote ->
                    val toSelf = quote.senderId == model.me
                    val who = if (toSelf) L10n.Messages.replyingToSelf else L10n.Messages.replyingTo(model.other?.handle.orEmpty())
                    val what = quoteWords(quote)
                    ComposerRow(who, what, L10n.Messages.replyCancel, { model.cancelReply() }) { ReplyRule(Modifier.height(32.dp)) }
                }
                Riding.Note -> ComposerRow(L10n.Messages.quotedNote, null, L10n.Messages.removeCard, { model.noteRef = null }) { ComposerTile(IconName.Note) }
                Riding.Card -> card?.let { c ->
                    // A 私人卡 says so where 卡片 would: the message is what lets them read it.
                    ComposerRow(if (c.keptPrivate) L10n.Messages.privateCard else L10n.Messages.attachCardShort, c.title, L10n.Messages.removeCard, { model.pendingCard = null }) {
                        ComposerTile(IconName.Cards) {
                            c.cover?.let { AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                        }
                    }
                }
                Riding.Picture -> PictureStrip(model)
                Riding.Error -> error?.let {
                    BasicText(it, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.Terracotta), modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 6.dp))
                }
            }
        }
    }
}

/**
 * The pictures riding with the message (round 22 §4.2): their 40 thumbnails in a row in the order chosen
 * (scrolling sideways past what fits), each numbered in its corner, a tap on one letting it go — its ✕
 * for TalkBack; 「3 張圖片」 after them, and the row's ✕ at its end letting them all go.
 */
@Composable
private fun PictureStrip(model: ThreadModel) {
    val count = model.pictures.size
    val label = if (count == 1) L10n.Messages.attachImage else L10n.Messages.picturesCount(count)
    Row(
        Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(start = 12.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.weight(1f, fill = false).horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            model.pictures.forEachIndexed { i, picture ->
                Box(
                    Modifier
                        .size(ComposerLeadSize)
                        .clip(ComposerLeadShape)
                        .background(Tokens.CreamDark)
                        .clickable(role = Role.Button, onClickLabel = L10n.Messages.removeImage) { model.removePicture(picture.key) }
                        .semantics { contentDescription = "${L10n.Messages.removeImage} ${i + 1}" },
                    contentAlignment = Alignment.Center,
                ) {
                    val preview = picture.prepared?.preview
                    if (preview != null) Image(preview, null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                    else SketchLoader(18.dp)
                    if (count > 1) NumberBadge(i + 1, Modifier.align(Alignment.TopEnd).padding(2.dp), small = true)
                }
            }
        }
        BasicText(
            label, maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = AppFonts.body(12f, 600, lineHeight = 1.35f, color = Tokens.Text),
            modifier = Modifier.padding(start = 10.dp).weight(1f),
        )
        Box(
            Modifier
                .size(44.dp)
                .clickable(interactionSource = null, indication = OrganicIndication(inset = 4.dp), role = Role.Button, onClickLabel = L10n.Messages.removeImage) { model.clearPictures() }
                .semantics { contentDescription = L10n.Messages.removeImage },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Close, size = 16.dp, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
    }
}

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

/** A tool inside the field (☺ / ⌨, ⤢ / ⤡): its glyph in the muted ink, the bare press ink round it. */
@Composable
private fun ToolButton(
    label: String,
    size: Dp,
    modifier: Modifier,
    glyph: com.resonance.design.IconGlyph? = null,
    icon: IconName? = null,
    onClick: () -> Unit,
) {
    Box(
        modifier
            .clickable(interactionSource = null, indication = OrganicIndication(inset = 4.dp), role = Role.Button, onClickLabel = label, onClick = onClick)
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) {
        if (glyph != null) OrganicIcon(glyph, size = size, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value)
        else if (icon != null) OrganicIcon(icon, size = size, color = Tokens.TextMuted, strokeWidth = Tokens.Ink.value)
    }
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
