package com.resonance.app.ui

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
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.runtime.Composable
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.getValue
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicImageShape
import com.resonance.design.OrganicMenuFrom
import com.resonance.design.OrganicMenuItem
import com.resonance.design.ComposerCapsule
import com.resonance.design.ComposerHeight
import com.resonance.design.OrganicIndication
import com.resonance.design.floatingGroup
import com.resonance.design.floatingSlip
import com.resonance.design.ReplyRule
import com.resonance.design.SketchLoader
import com.resonance.design.fieldHintStyle
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.kit.chat.ReplyQuote
import com.resonance.kit.l10n.L10n

/**
 * The message being written (round 9 §4): one floating capsule ([ComposerCapsule]) — 「＋」 at its
 * start (the organic menu of what can go with it: 圖片 · 卡片, one or the other), the field, and Send
 * as its end segment — and, 6 above it on a slip of its own ([ComposerSlip]), what rides with the
 * message: the reply it carries, the note being answered, the card or picture attached, why the
 * last one didn't go. The capsule keeps its geometry whatever rides with it. Sending never holds the
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
    // One floating group: the slip's and the capsule's halos go under each other's pen lines.
    Column(modifier.fillMaxWidth().floatingGroup(), verticalArrangement = Arrangement.spacedBy(SLIP_GAP)) {
        ComposerSlip(model)
        ComposerCapsule(
            canSend = model.canSend,
            sendLabel = L10n.Messages.send,
            onSend = { model.send() },
            focused = { focused },
            textStyle = ComposerText,
            leading = { AttachMenu(onPickImage, onPickCard) },
        ) { vertical ->
            Box(Modifier.fillMaxWidth().padding(vertical = vertical)) {
                if (model.draft.isEmpty()) {
                    BasicText(L10n.Messages.placeholder, style = fieldHintStyle(ComposerText.fontSize.value, COMPOSER_LEADING), maxLines = 1, overflow = TextOverflow.Ellipsis)
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
internal val ComposerText: TextStyle get() = AppFonts.body(16f, lineHeight = COMPOSER_LEADING)

/** The slip → the capsule. */
private val SLIP_GAP = 6.dp

/**
 * What rides with the message, on a slip directly above the capsule (round 9 §4), the capsule's
 * width, opaque: the reply it carries ([ReplyBar]), then the chips — the note being answered, the
 * card or the picture — and why the last message didn't go. Nothing riding, no slip.
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun ComposerSlip(model: ThreadModel) {
    val picture = model.pendingImage
    val chips = model.noteRef != null || model.pendingCard != null || picture != null || model.preparingImage
    val reply = model.replyingTo
    val error = model.error
    if (!chips && reply == null && error == null) return
    Column(
        Modifier.fillMaxWidth().floatingSlip(seed = 29.0).padding(start = 10.dp, end = 4.dp, top = 4.dp, bottom = 4.dp),
    ) {
        reply?.let { ReplyBar(model, it) }
        if (chips) FlowRow(
            Modifier.padding(top = 6.dp, bottom = 6.dp, end = 6.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            itemVerticalAlignment = Alignment.CenterVertically,
        ) {
            if (model.noteRef != null) AttachmentChip(IconName.Note, L10n.Messages.quotedNote) { model.noteRef = null }
            model.pendingCard?.let { card -> AttachmentChip(IconName.Cards, card.title) { model.pendingCard = null } }
            if (picture != null || model.preparingImage) PictureChip(picture?.preview) { model.removeImage() }
        }
        error?.let { BasicText(it, style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.Terracotta), modifier = Modifier.padding(top = 4.dp, bottom = 6.dp, end = 6.dp)) }
    }
}

/** On the slip while replying: a wavy terracotta rule, whom to (12/600) over a line of what (12.5), and a 44 ✕. */
@Composable
private fun ReplyBar(model: ThreadModel, quote: ReplyQuote) {
    val toSelf = quote.senderId == model.me
    val who = if (toSelf) L10n.Messages.replyingToSelf else L10n.Messages.replyingTo(model.other?.handle.orEmpty())
    val what = quote.text.replace('\n', ' ').ifEmpty { quoteStandIn(quote) }
    Row(
        Modifier.fillMaxWidth().heightIn(min = 44.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        ReplyRule(Modifier.height(32.dp))
        Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(1.dp)) {
            BasicText(who, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, 600, lineHeight = 1.35f, color = Tokens.Text))
            BasicText(what, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12.5f, lineHeight = 1.35f, color = Tokens.TextMuted))
        }
        Box(
            Modifier
                .size(44.dp)
                .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.replyCancel) { model.cancelReply() }
                .semantics { contentDescription = L10n.Messages.replyCancel },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.Close, size = 15.dp, color = Tokens.TextMuted) }
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
 * The picture picked, over the field where a card's chip goes: a small thumbnail in the pictures'
 * wobbly clip (its loader while it is made ready) and its ✕ (移除圖片).
 */
@Composable
private fun PictureChip(preview: ImageBitmap?, onRemove: () -> Unit) {
    Row(
        Modifier
            .background(ChipFace, RoundedCornerShape(topStart = 12.dp, topEnd = 14.dp, bottomEnd = 12.dp, bottomStart = 14.dp))
            .padding(start = 5.dp, end = 8.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(
            Modifier.size(PictureThumb).clip(remember { OrganicImageShape(29.0, radius = 10.0) }).background(Tokens.CreamDark),
            contentAlignment = Alignment.Center,
        ) {
            if (preview != null) Image(preview, L10n.Messages.attachImage, Modifier.fillMaxSize(), contentScale = ContentScale.Crop)
            else SketchLoader(22.dp)
        }
        Box(
            Modifier
                .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.removeImage, onClick = onRemove)
                .padding(2.dp)
                .semantics { contentDescription = L10n.Messages.removeImage },
        ) { OrganicIcon(IconName.Close, size = 13.dp, color = Tokens.TextMuted) }
    }
}

/** The picked picture's thumbnail over the field. */
private val PictureThumb = 44.dp

/** A chip's face on the slip: the light terracotta at 0.4 laid on the cream, opaque. */
private val ChipFace = Tokens.TerracottaLight.copy(alpha = 0.4f).compositeOver(Tokens.Cream)

/** A pending attachment above the composer: its glyph, its name, and a ✕. */
@Composable
private fun AttachmentChip(icon: IconName, title: String, onRemove: () -> Unit) {
    Row(
        Modifier
            .background(ChipFace, RoundedCornerShape(topStart = 12.dp, topEnd = 14.dp, bottomEnd = 12.dp, bottomStart = 14.dp))
            .padding(start = 10.dp, end = 8.dp, top = 5.dp, bottom = 5.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        OrganicIcon(icon, size = 14.dp, color = Tokens.Text)
        BasicText(title, maxLines = 1, overflow = TextOverflow.Ellipsis, style = AppFonts.body(12f, lineHeight = 1.3f), modifier = Modifier.widthIn(max = 180.dp))
        Box(
            Modifier
                .plainClickable(role = Role.Button, onClickLabel = L10n.Messages.removeCard, onClick = onRemove)
                .padding(2.dp)
                .semantics { contentDescription = L10n.Messages.removeCard },
        ) { OrganicIcon(IconName.Close, size = 13.dp, color = Tokens.TextMuted) }
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
