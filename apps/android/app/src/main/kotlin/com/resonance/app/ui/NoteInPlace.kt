package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.snap
import androidx.compose.animation.core.tween
import androidx.compose.animation.expandVertically
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.findRootCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.ComposerCapsule
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.OrganicIcon
import com.resonance.design.composerFades
import com.resonance.design.fieldHintStyle
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.inlineBarTop
import com.resonance.design.lineHeightOf
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest

/**
 * The one line under the note's field (round 26, the note in place, item 3): one message at a time, by priority — and
 * none with nothing to say. No privacy line any more (the owner's look, 2026-11-19: 「把這段話只有作者會看到這句把它移除
 * 掉」): the placeholder says where the words go.
 */
internal sealed interface NoteLine {
    /** Why the last note didn't go. */
    data class Error(val text: String) : NoteLine
    /** Past [NOTE_UPGRADE_THRESHOLD]: 這段話想寫成一張卡片嗎？, taking the words to the writer. */
    data object Upgrade : NoteLine
}

/**
 * The note to the card's author, written in place under the story (round 26, the note in place — the owner: 「這個記小
 * 紙條的界面應該不要做成 pop ups，因為它會擋住這個畫面上其他東西」): never a dialog, at most one field on the page, opened only
 * by 寄小紙條. [open] while it shows; its [text] is the card's draft (kept on the device until the note goes); [error] why
 * the last note didn't go. [focusTicket] grows each time the field is to take the focus.
 *
 * - 寄小紙條 ([segment]): opens it, focused; tapped again, an empty field closes, one with words only takes the focus
 *   back. Escape in an empty field closes it too; in one with words it lets go of the focus (the web's and iOS's).
 * - [mayNote] false (three letters the author hasn't answered): its place says card.note.waitForReply instead — no
 *   field; the draft stays.
 * - A draft not yet sent: open when the page opens (where a note may be left).
 * - Sent ([sent]): cleared and closed. Refused while the page is here ([failed]): open again on the words, saying why.
 * - Over 200 ([NOTE_UPGRADE_THRESHOLD]): the line offers a card instead ([upgraded]: closed, the draft forgotten).
 */
@Stable
internal class NoteFieldState(draft: String, mayNote: Boolean) {
    var open by mutableStateOf(mayNote && draft.isNotBlank())
        private set
    var text by mutableStateOf(capped(draft, NOTE_MAX_LENGTH))
        private set
    var error by mutableStateOf<String?>(null)
        private set
    var focusTicket by mutableIntStateOf(0)
        private set

    /** The note's words as counted (trimmed, in UTF-16 units, as the web counts them). */
    val count: Int get() = text.trim().length

    /** 寄小紙條 (or Escape in an empty field); with [mayNote] false its place holds only the wait line, which it closes. */
    fun segment(mayNote: Boolean = true) {
        when {
            !open -> {
                open = true
                focusTicket++
            }
            text.isBlank() || !mayNote -> open = false
            else -> focusTicket++
        }
    }

    fun edit(next: String) {
        text = capped(next, NOTE_MAX_LENGTH)
        error = null
        sending = null
    }

    /** The words of the note last sent from here, until the field is written in again. */
    var sending by mutableStateOf<String?>(null)
        private set

    /**
     * What the card's draft should hold now: the field's words — or, while the note just sent is on its way and the
     * field is still empty, nothing to write (null): its draft keeps those words until the server has them.
     */
    val draft: String? get() = if (text.isBlank() && sending != null) null else text

    /** Whether 寄出 sends: words, within the cap, and a note may be left. */
    fun canSend(mayNote: Boolean): Boolean = mayNote && count in 1..NOTE_MAX_LENGTH

    /** The line under the field, by priority: the error, then the offer of a card; else none. */
    fun line(): NoteLine? = when {
        error != null -> NoteLine.Error(error!!)
        count > NOTE_UPGRADE_THRESHOLD -> NoteLine.Upgrade
        else -> null
    }

    /** The count at the line's end, only near the cap (from [COUNT_FROM]). */
    val countShown: String? get() = if (count >= COUNT_FROM) "$count / $NOTE_MAX_LENGTH" else null

    /** The note went: the field empties and closes. */
    fun sent() {
        sending = text.trim()
        text = ""
        error = null
        open = false
    }

    /** The note didn't go and the page is still here: open again, focused, on [words] (else what was sent), saying [why]. */
    fun failed(words: String, why: String?) {
        if (text.isBlank()) text = capped(words.ifBlank { sending.orEmpty() }, NOTE_MAX_LENGTH)
        sending = null
        error = why
        open = true
        focusTicket++
    }

    /** The words carried into a card of their own: the field closes, the draft forgotten. */
    fun upgraded() {
        text = ""
        error = null
        open = false
    }

    companion object {
        /** The count shows from here (the cap is 2,000). */
        const val COUNT_FROM = 1800
    }
}

/**
 * The field's placeholder (item 2, as the owner's look of 2026-11-19 amends it): card.note.placeholder in every state —
 * 「悄悄告訴作者，哪一段打動你」, where the words go and what to write — whether the viewer's tap is on or not.
 */
internal fun notePlaceholder(): String = L10n.Card.Note.placeholder

/**
 * How many lines the field grows to before it scrolls inside: 3 on a phone, 5 wider — and 2 in a short window whatever
 * its width: a phone on its side is a Medium window, and over the keyboard it has the least room of all.
 */
internal fun noteMaxLines(phone: Boolean, shortWindow: Boolean): Int = when {
    shortWindow -> 2
    phone -> 3
    else -> 5
}

/**
 * The note's field in place (round 26, the note in place, item 2): the composer's input capsule — the envelope in the
 * lead column (48), the words, and 寄出 as its end segment (the paper plane, tonal at rest, solid only with words) —
 * [NoteInPlaceGap] under row 2, as wide as the column on a phone and min(the story's column, 680) wider, from where the
 * capsule starts. One line 48, growing to [noteMaxLines], then scrolling inside; no ⤢. Focused, the page brings the
 * field's block 12 above the keyboard (nothing floats). Under it the one [NoteLine] and, near the cap, the count —
 * nothing with nothing to say; with [mayNote] false, the wait line alone in its place.
 */
@Composable
internal fun NoteInPlace(
    state: NoteFieldState,
    mayNote: Boolean,
    reducedMotion: Boolean,
    onSend: (String) -> Unit,
    onUpgrade: (String) -> Unit,
    modifier: Modifier = Modifier,
    /** The page's bar to step aside (true) while the keyboard leaves no room under it for the field, or back (false). */
    onRoom: (Boolean) -> Unit = {},
) {
    val phone = LocalWindowLayout.current.cls == LayoutClass.Compact
    val shortWindow = LocalConfiguration.current.screenHeightDp < 480
    val enter = if (reducedMotion) fadeIn(snap()) else expandVertically(tween(NOTE_MOVE_MILLIS), expandFrom = Alignment.Top) + fadeIn(tween(NOTE_MOVE_MILLIS))
    val exit = if (reducedMotion) fadeOut(snap()) else shrinkVertically(tween(NOTE_MOVE_MILLIS), shrinkTowards = Alignment.Top) + fadeOut(tween(NOTE_MOVE_MILLIS))
    AnimatedVisibility(state.open, modifier, enter = enter, exit = exit) {
        Column(Modifier.fillMaxWidth().padding(top = NoteInPlaceGap)) {
            if (!mayNote) {
                BasicText(
                    L10n.Card.Note.waitForReply,
                    style = AppFonts.body(14f, lineHeight = 1.5f, color = Tokens.TextMuted),
                    modifier = Modifier.fillMaxWidth().semantics { liveRegion = LiveRegionMode.Polite },
                )
                return@Column
            }
            val line = state.line()
            val count = state.countShown
            // The line under the field, as tall as it is drawn (its 6 above included): brought into view with the field
            // where there is room for both.
            var lineHeight by remember { mutableIntStateOf(0) }
            val lineShown = line != null || count != null
            NoteCapsule(
                state, noteMaxLines(phone, shortWindow), onSend, Modifier.widthIn(max = NoteFieldMax).fillMaxWidth(),
                lineBelow = { if (lineShown) lineHeight else 0 }, onRoom = onRoom,
            )
            if (lineShown) {
                Row(
                    Modifier.onSizeChanged { lineHeight = it.height }.widthIn(max = NoteFieldMax).fillMaxWidth().padding(top = 6.dp),
                    horizontalArrangement = Arrangement.spacedBy(12.dp),
                    verticalAlignment = Alignment.Top,
                ) {
                    Box(Modifier.weight(1f)) {
                        when (line) {
                            is NoteLine.Error -> BasicText(
                                line.text,
                                style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.Danger),
                                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Assertive },
                            )
                            NoteLine.Upgrade -> BasicText(
                                L10n.Card.Note.upgrade,
                                style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.ButtonOnTonal).copy(textDecoration = TextDecoration.Underline),
                                modifier = Modifier.plainClickable(role = Role.Button) { onUpgrade(state.text) },
                            )
                            null -> Unit
                        }
                    }
                    if (count != null) BasicText(
                        count,
                        style = AppFonts.body(11f, lineHeight = 1.5f, color = if (state.count > NOTE_MAX_LENGTH) Tokens.Terracotta else Tokens.TextMuted)
                            .copy(fontFeatureSettings = "tnum"),
                    )
                }
            }
        }
    }
}

/** The capsule itself: the envelope, the words (`note-field`, the flows' id), 寄出. */
@Composable
private fun NoteCapsule(
    state: NoteFieldState,
    maxLines: Int,
    onSend: (String) -> Unit,
    modifier: Modifier,
    lineBelow: () -> Int,
    onRoom: (Boolean) -> Unit,
) {
    var focused by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val focusManager = LocalFocusManager.current
    val relocate = remember { BringIntoViewRequester() }
    val density = LocalDensity.current
    var capsule by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var fieldHeight by remember { mutableIntStateOf(0) }
    // The words' lines as laid out: from the second, 寄出 is the composer's block on the last row, never the full height.
    var lines by remember { mutableIntStateOf(1) }
    val canSend = state.canSend(mayNote = true)
    val placeholder = notePlaceholder()
    val line = lineHeightOf(ComposerText)
    // Asked to take the focus (opened, reopened after a failure, 寄小紙條 again): the field and the keyboard.
    LaunchedEffect(state.focusTicket) {
        if (state.focusTicket == 0) return@LaunchedEffect
        // The block's first frame first: a field still being composed takes no focus.
        delay(16)
        runCatching { focus.requestFocus() }
        keyboard?.show()
    }
    // Focused, once the keyboard has risen and stood still a moment (and again as it, the field or its line change):
    // the page brings the field — with its line where both fit — 12 above the keyboard and clear of the bar over the
    // page; where even the field has no room under the bar (a phone on its side), the bar steps aside ([onRoom]).
    val ime = WindowInsets.ime
    val statusBars = WindowInsets.statusBars
    // Read through rememberUpdatedState as the rest: the effect below lives as long as the focus, and the activity handles
    // turning and unfolding itself (AndroidManifest configChanges), so the bar's height can change under a field that
    // keeps it — the next reveal measures against the bar now, not the one there when the field took the focus.
    val barBottom by rememberUpdatedState(with(density) { inlineBarTop().toPx() })
    val clearance = with(density) { NoteKeyboardClearance.toPx() }
    val air = with(density) { NoteRevealAir.toPx() }
    val room by rememberUpdatedState(onRoom)
    val lineNow by rememberUpdatedState(lineBelow)
    LaunchedEffect(focused) {
        if (!focused) {
            room(false)
            return@LaunchedEffect
        }
        snapshotFlow { Triple(ime.getBottom(density), fieldHeight, lineNow()) }.collectLatest { (keys, field, line) ->
            if (keys <= 0) {
                room(false)
                return@collectLatest
            }
            delay(NOTE_KEYBOARD_SETTLE_MILLIS)
            val at = capsule?.takeIf { it.isAttached } ?: return@collectLatest
            // The page lies on the whole window under the bar laid over it, and stops at the keyboard (its imePadding).
            val window = at.findRootCoordinates().size.height.toFloat()
            val reveal = noteReveal(
                keyboardTop = window - keys, barBottom = barBottom, statusBottom = statusBars.getTop(density).toFloat(),
                field = field.toFloat(), line = line.toFloat(), clearance = clearance, air = air,
            )
            room(reveal.barAside)
            relocate.bringIntoView(reveal.rect(at.size.width.toFloat()))
        }
    }
    DisposableEffect(Unit) { onDispose { room(false) } }
    val send = {
        if (canSend) onSend(state.text.trim())
    }
    ComposerCapsule(
        canSend = canSend,
        sendLabel = L10n.Card.Note.send,
        onSend = send,
        focused = { focused },
        textStyle = ComposerText,
        modifier = modifier
            .bringIntoViewRequester(relocate)
            .onGloballyPositioned { capsule = it }
            .onSizeChanged { fieldHeight = it.height },
        seed = 23.0,
        // From the second line Send is the block on the last row, as the composer's (never grown, nothing riding).
        block = composerTools(state.text, lines, expanded = false).block,
        leading = { NoteLeadGlyph() },
    ) { vertical ->
        val scroll = rememberScrollState()
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(max = line * maxLines + vertical * 2)
                .composerFades(scroll)
                .verticalScroll(scroll),
        ) {
            if (state.text.isEmpty()) {
                BasicText(
                    placeholder,
                    style = fieldHintStyle(placeholder, ComposerText.fontSize.value, 1.5f),
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(vertical = vertical),
                )
            }
            BasicTextField(
                state.text, state::edit,
                textStyle = ComposerText,
                cursorBrush = SolidColor(Tokens.Text),
                minLines = 1,
                onTextLayout = { lines = it.lineCount },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = vertical)
                    .focusRequester(focus)
                    .onFocusChanged { focused = it.isFocused }
                    // Escape: an empty field closes (寄小紙條 again); one with words keeps them and lets go of the focus —
                    // 寄小紙條's way would only ask for the focus it has (a multi-line field types Tab, so Escape is the way out).
                    .onPreviewKeyEvent { e ->
                        if (e.type == KeyEventType.KeyDown && e.key == Key.Escape) {
                            if (state.text.isBlank()) state.segment() else focusManager.clearFocus()
                            true
                        } else false
                    }
                    // Named as the web's aria-label and iOS's label are (寄一張小紙條給作者), not by the placeholder, which
                    // is its own text beside the field.
                    .semantics { contentDescription = L10n.Card.Note.entry }
                    .flowTag("note-field"),
            )
        }
    }
}

/**
 * The envelope in the field's lead column (item 2): what the field is, a mark and not a button — the muted text ink at
 * [NoteLeadGlyphSize], the web's and iOS's (never the capsule's label brown), with the icon's own pen as the web's.
 */
@Composable
internal fun NoteLeadGlyph(modifier: Modifier = Modifier) {
    OrganicIcon(IconName.Note, modifier, size = NoteLeadGlyphSize, color = Tokens.TextMuted)
}

/** The envelope's size: the web's 18 (NoteInPlace.module.css `.glyph`), iOS's `NoteFieldCapsule.leadGlyph`. */
internal val NoteLeadGlyphSize: Dp = 18.dp

/** Under row 2, to the field (item 2). */
internal val NoteInPlaceGap: Dp = 12.dp

/** The field's widest, on a tablet: the story's column or this, whichever is narrower. */
internal val NoteFieldMax: Dp = 680.dp

/** How far over the keyboard the field's block stands once the page has brought it there. */
internal val NoteKeyboardClearance: Dp = 12.dp

/**
 * With the bar aside, how far under the status bar the field stands when the page has more room over it than the
 * [NoteInPlaceGap] under row 2: half that gap, so the page's top edge falls in the air between row 2 and the field and
 * neither row 2 (a cut sliver of its faces) nor the field's pen line meets the status bar.
 */
internal val NoteRevealAir: Dp = NoteInPlaceGap / 2

/** How long the keyboard stands still before the page brings the field over it (its rise is followed, not raced). */
private const val NOTE_KEYBOARD_SETTLE_MILLIS = 120L

/**
 * Where the page brings the note's field once it has the focus (item 2: 12 above the keyboard, nothing floating),
 * along the page's viewport, which runs from the window's top (the bar lies over it) to the keyboard's top. The rect
 * asked of the page ([rect], in the field's own place) starts [above] over the field's top — the room the bar over the
 * page takes, so brought fully into the viewport the field stands under the bar, never behind it — and ends [below]
 * under it: the field, the line under it where both fit, and the 12 over the keyboard. [barAside]: not even the field
 * fits under the bar (a phone on its side, the keyboard up: about 28 between the header's line and the keyboard on a
 * 411-tall window), so the bar steps aside while the keyboard is up and only the status bar stands over the page; there
 * the rect, where the room allows, is the whole viewport, from [NoteRevealAir] over the field under the status bar to
 * the keyboard — what shows over the field starts in the air under row 2, never in a sliver of it (round 26's relook:
 * the lower edges of row 2's faces cut thin under the status bar's paper).
 */
internal data class NoteReveal(val barAside: Boolean, val above: Float, val below: Float) {
    fun rect(width: Float): Rect = Rect(0f, -above, width, below)
}

/**
 * [NoteReveal] for a window whose keyboard's top is [keyboardTop] (px from the window's top), the bar's line at
 * [barBottom], the status bar's foot at [statusBottom], the field [field] tall, the line under it [line] (0 without
 * one): the field and its line where both fit under the bar, else the field alone; where not even the field fits, the
 * same under the status bar with the bar aside — and there, when the block brought 12 over the keyboard would leave
 * more than [air] over the field (the page's top edge in row 2 under the status bar — or, where row 2 would show whole,
 * in the capsule over it, which never fits too), the field stands [air] under the status bar instead and the room
 * left goes under the block, over the keyboard.
 */
internal fun noteReveal(keyboardTop: Float, barBottom: Float, statusBottom: Float, field: Float, line: Float, clearance: Float, air: Float): NoteReveal {
    val block = field + line + clearance
    val alone = field + clearance
    val underBar = keyboardTop - barBottom
    val underStatus = keyboardTop - statusBottom
    if (block <= underBar) return NoteReveal(false, barBottom, block)
    if (alone <= underBar) return NoteReveal(false, barBottom, alone)
    val shown = if (block <= underStatus) block else alone
    // What the page would show over the field, under the status bar: past [air], row 2's foot (its faces' lower edges) cut thin.
    return if (underStatus - shown > air) NoteReveal(true, statusBottom + air, underStatus - air)
    else NoteReveal(true, statusBottom, shown)
}

/** The field opening and closing. */
internal const val NOTE_MOVE_MILLIS = 150
