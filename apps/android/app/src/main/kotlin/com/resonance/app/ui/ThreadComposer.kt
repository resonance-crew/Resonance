package com.resonance.app.ui

import androidx.compose.runtime.ReadOnlyComposable
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

import androidx.compose.foundation.Image
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.resonance.design.AppFonts
import com.resonance.design.ComposerCapsule
import com.resonance.design.ComposerRowsLead
import com.resonance.design.ComposerHeight
import com.resonance.design.ComposerRow
import com.resonance.design.ComposerTile
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIndication
import com.resonance.design.OrganicMenuFrom
import com.resonance.design.OrganicMenuItem
import com.resonance.design.ReplyRule
import com.resonance.design.SketchLoader
import com.resonance.design.blocksTouches
import com.resonance.design.fieldHintStyle
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.chat.ReplyQuote
import com.resonance.kit.l10n.L10n

/**
 * The message being written (round 9 §4): one floating capsule ([ComposerCapsule]) — 「＋」 at its
 * start (the organic menu of what can go with it: 圖片 · 卡片, one or the other), the field, and Send
 * as its end segment — and above it, 6 over the capsule, what rides with the message as rows in the
 * reply's style ([ComposerRows], round 10 §3.4): the reply it carries, the note being answered, the
 * card or picture attached, why the last one didn't go. With rows riding the foot starts
 * [ComposerRowsLead] over them (round 11 §3): the foot paper's 12 fade ([ComposerBacking]) starts
 * there and ends where the topmost row's ink starts, so the paper is solid behind every row. The
 * rows and the capsule take their own touches (a tap on them is never the paper's, which puts the
 * keyboard away). The capsule keeps its geometry whatever rides with it. Sending never holds the
 * composer — a message goes to the outbox and the field is empty for the next one, with its
 * keyboard still up.
 */
@Composable
internal fun Composer(
    model: ThreadModel,
    handle: String,
    focus: FocusRequester,
    onPickImage: () -> Unit,
    onPickCard: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    Column(modifier.fillMaxWidth()) {
        if (rides(model)) {
            Spacer(Modifier.height(ComposerRowsLead))
            ComposerRows(model, Modifier.blocksTouches())
            Spacer(Modifier.height(ROWS_GAP))
        }
        ComposerCapsule(
            canSend = model.canSend,
            sendLabel = L10n.Messages.send,
            onSend = { model.send() },
            focused = { focused },
            textStyle = ComposerText,
            modifier = Modifier.blocksTouches(),
            leading = { AttachMenu(onPickImage, onPickCard) },
        ) { vertical ->
            Box(Modifier.fillMaxWidth().padding(vertical = vertical)) {
                if (model.draft.isEmpty()) {
                    BasicText(L10n.Messages.placeholder, style = fieldHintStyle(L10n.Messages.placeholder, ComposerText.fontSize.value, COMPOSER_LEADING), maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
                BasicTextField(
                    model.draft, { model.draft = capped(it, NOTE_MAX_LENGTH) },
                    textStyle = ComposerText,
                    cursorBrush = SolidColor(Tokens.Text),
                    minLines = 1,
                    // Five lines, then it scrolls in place.
                    maxLines = 5,
                    modifier = Modifier
                        .fillMaxWidth()
                        // A hardware keyboard's Return sends and Shift-Return starts a line, as on the web;
                        // a composition in progress keeps its Return (the IME takes it first), and the soft
                        // keyboard's Enter is always a new line.
                        .onPreviewKeyEvent { e -> sendsOnReturn(e).also { if (it && model.canSend) model.send() } }
                        .focusRequester(focus)
                        .onFocusChanged { focused = it.isFocused }
                        .semantics { contentDescription = L10n.Messages.threadWith(handle) },
                )
            }
        }
    }
}

/** The composer's words: 16 (× the interface's text size, capped at 1.25), 1.5 apart. */
private const val COMPOSER_LEADING = 1.5f
internal val ComposerText: TextStyle @Composable @ReadOnlyComposable get() = AppFonts.body(16f, lineHeight = COMPOSER_LEADING)

/** The last riding row → the capsule. */
private val ROWS_GAP = 6.dp

/** Whether anything rides with the message: a reply, the note answered, a card, a picture (or one being made ready), an error. */
private fun rides(model: ThreadModel): Boolean =
    ridingRows(
        reply = model.replyingTo != null, note = model.noteRef != null, card = model.pendingCard != null,
        picture = model.pendingImage != null || model.preparingImage, error = model.error != null,
    ).isNotEmpty()

/** What rides with the message, top to bottom (round 10 §3.4): the reply, the note answered, the card or the picture, then why the last one didn't go. */
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
 * title), the picture (its 40 thumbnail, the loader while it is made ready). Why the last message
 * didn't go is a line of its own under them, at the rows' inset.
 */
@Composable
private fun ComposerRows(model: ThreadModel, modifier: Modifier = Modifier) {
    Column(modifier.fillMaxWidth()) {
        val reply = model.replyingTo
        val note = model.noteRef
        val card = model.pendingCard
        val picture = model.pendingImage
        val error = model.error
        ridingRows(reply != null, note != null, card != null, picture != null || model.preparingImage, error != null).forEach { row ->
            when (row) {
                Riding.Reply -> reply?.let { quote ->
                    val toSelf = quote.senderId == model.me
                    val who = if (toSelf) L10n.Messages.replyingToSelf else L10n.Messages.replyingTo(model.other?.handle.orEmpty())
                    val what = quote.text.replace('\n', ' ').ifEmpty { quoteStandIn(quote) }
                    ComposerRow(who, what, L10n.Messages.replyCancel, { model.cancelReply() }) { ReplyRule(Modifier.height(32.dp)) }
                }
                Riding.Note -> ComposerRow(L10n.Messages.quotedNote, null, L10n.Messages.removeCard, { model.noteRef = null }) { ComposerTile(IconName.Note) }
                Riding.Card -> card?.let { c ->
                    ComposerRow(L10n.Messages.attachCardShort, c.title, L10n.Messages.removeCard, { model.pendingCard = null }) {
                        ComposerTile(IconName.Cards) {
                            c.cover?.let { AsyncImage(model = it, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize()) }
                        }
                    }
                }
                Riding.Picture -> ComposerRow(L10n.Messages.attachImage, null, L10n.Messages.removeImage, { model.removeImage() }) {
                    ComposerTile(null) {
                        val preview = picture?.preview
                        if (preview != null) Image(preview, L10n.Messages.attachImage, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
                        else SketchLoader(22.dp)
                    }
                }
                Riding.Error -> error?.let {
                    BasicText(it, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.Terracotta), modifier = Modifier.padding(start = 12.dp, end = 12.dp, top = 6.dp, bottom = 6.dp))
                }
            }
        }
    }
}

/**
 * 「＋」 (附上圖片或卡片), the capsule's ghost button (48 × 48, the glyph 22 in the muted ink): the
 * organic menu, over it and lined up with its start — 圖片 (the system's photo picker) · 卡片 (the
 * card picker). The glyph takes the terracotta while the menu is open.
 */
@Composable
private fun AttachMenu(onPickImage: () -> Unit, onPickCard: () -> Unit) {
    val items = listOf(
        OrganicMenuItem(L10n.Messages.attachImage, IconName.Image) { onPickImage() },
        OrganicMenuItem(L10n.Messages.attachCardShort, IconName.Cards) { onPickCard() },
    )
    OrganicMenuFrom(items, seed = 43.0, above = true, alignStart = true) { open, toggle ->
        Box(
            Modifier
                .size(ComposerHeight)
                .clickable(interactionSource = null, indication = OrganicIndication(inset = 6.dp), role = Role.Button, onClickLabel = L10n.Messages.attach, onClick = toggle)
                .semantics { contentDescription = L10n.Messages.attach },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Plus, size = 22.dp, color = if (open) Tokens.Terracotta else Tokens.TextMuted, strokeWidth = Tokens.Ink.value) }
    }
}

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
