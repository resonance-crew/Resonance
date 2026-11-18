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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
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
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalDensity
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
import com.resonance.design.LayoutClass
import com.resonance.design.LocalWindowLayout
import com.resonance.design.ComposerCapsule
import com.resonance.design.OrganicIcon
import com.resonance.design.composerFades
import com.resonance.design.fieldHintStyle
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.lineHeightOf
import com.resonance.design.plainClickable
import com.resonance.kit.l10n.L10n
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first

/** The one line under the note's field (round 26, the note in place, item 3): one message at a time, by priority. */
internal sealed interface NoteLine {
    /** Why the last note didn't go. */
    data class Error(val text: String) : NoteLine
    /** Past [NOTE_UPGRADE_THRESHOLD]: 這段話想寫成一張卡片嗎？, taking the words to the writer. */
    data object Upgrade : NoteLine
    /** 這段話只有作者看得到, the first three times. */
    data object Privacy : NoteLine
}

/**
 * The note to the card's author, written in place under the story (round 26, the note in place — the owner: 「這個記小
 * 紙條的界面應該不要做成 pop ups，因為它會擋住這個畫面上其他東西」): never a dialog, at most one field on the page, opened only
 * by 寄小紙條. [open] while it shows; its [text] is the card's draft (kept on the device until the note goes); [error] why
 * the last note didn't go. [focusTicket] grows each time the field is to take the focus.
 *
 * - 寄小紙條 ([segment]): opens it, focused; tapped again, an empty field closes, one with words only takes the focus
 *   back. Escape in the field the same.
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

    /** 寄小紙條 (or Escape in the field); with [mayNote] false its place holds only the wait line, which it closes. */
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

    /** The line under the field, by priority: the error, then the offer of a card, then the privacy hint ([hint]). */
    fun line(hint: Boolean): NoteLine? = when {
        error != null -> NoteLine.Error(error!!)
        count > NOTE_UPGRADE_THRESHOLD -> NoteLine.Upgrade
        hint -> NoteLine.Privacy
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

/** The field's question (item 2): 「哪一段讓你有共鳴？」 while the viewer's tap is on, else the note's own. */
internal fun notePlaceholder(tapOn: Boolean): String = if (tapOn) L10n.Card.Tap.ask else L10n.Card.Note.placeholder

/** How many lines the field grows to before it scrolls inside: 3 on a phone (2 in a short window), 5 wider. */
internal fun noteMaxLines(phone: Boolean, shortWindow: Boolean): Int = when {
    !phone -> 5
    shortWindow -> 2
    else -> 3
}

/**
 * The note's field in place (round 26, the note in place, item 2): the composer's input capsule — the envelope in the
 * lead column (48), the words, and 寄出 as its end segment (the paper plane, tonal at rest, solid only with words) —
 * [NoteInPlaceGap] under row 2, as wide as the column on a phone and min(the story's column, 680) wider, from where the
 * capsule starts. One line 48, growing to [noteMaxLines], then scrolling inside; no ⤢. Focused, the page brings the
 * field's block 12 above the keyboard (nothing floats). Under it the one [NoteLine] and, near the cap, the count; with
 * [mayNote] false, the wait line alone in its place.
 */
@Composable
internal fun NoteInPlace(
    state: NoteFieldState,
    tapOn: Boolean,
    mayNote: Boolean,
    hint: Boolean,
    reducedMotion: Boolean,
    onSend: (String) -> Unit,
    onUpgrade: (String) -> Unit,
    modifier: Modifier = Modifier,
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
            NoteCapsule(state, tapOn, noteMaxLines(phone, shortWindow), onSend, Modifier.widthIn(max = NoteFieldMax).fillMaxWidth())
            val line = state.line(hint)
            val count = state.countShown
            if (line != null || count != null) {
                Row(
                    Modifier.widthIn(max = NoteFieldMax).fillMaxWidth().padding(top = 6.dp),
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
                            NoteLine.Privacy -> BasicText(L10n.Card.Note.hint, style = AppFonts.body(12f, lineHeight = 1.5f, color = Tokens.TextMuted))
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
private fun NoteCapsule(state: NoteFieldState, tapOn: Boolean, maxLines: Int, onSend: (String) -> Unit, modifier: Modifier) {
    var focused by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    val relocate = remember { BringIntoViewRequester() }
    val density = LocalDensity.current
    var blockHeight by remember { mutableIntStateOf(0) }
    val canSend = state.canSend(mayNote = true)
    val placeholder = notePlaceholder(tapOn)
    val line = lineHeightOf(ComposerText)
    // Asked to take the focus (opened, reopened after a failure, 寄小紙條 again): the field and the keyboard.
    LaunchedEffect(state.focusTicket) {
        if (state.focusTicket == 0) return@LaunchedEffect
        // The block's first frame first: a field still being composed takes no focus.
        delay(16)
        runCatching { focus.requestFocus() }
        keyboard?.show()
    }
    // Focused: the page brings the block 12 above the keyboard once it has risen (and again as it settles).
    val ime = WindowInsets.ime
    LaunchedEffect(focused) {
        if (!focused) return@LaunchedEffect
        snapshotFlow { ime.getBottom(density) }.first { it > 0 }
        delay(NOTE_MOVE_MILLIS.toLong())
        val below = with(density) { NoteKeyboardClearance.toPx() }
        relocate.bringIntoView(Rect(0f, 0f, 1f, blockHeight + below))
    }
    val send = {
        if (canSend) onSend(state.text.trim())
    }
    ComposerCapsule(
        canSend = canSend,
        sendLabel = L10n.Card.Note.send,
        onSend = send,
        focused = { focused },
        textStyle = ComposerText,
        modifier = modifier.bringIntoViewRequester(relocate).onSizeChanged { blockHeight = it.height },
        seed = 23.0,
        // From the second line Send is the block on the last row, as the composer's.
        block = false,
        leading = { OrganicIcon(IconName.Note, size = 20.dp, color = Tokens.ButtonOnTonal) },
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
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = vertical)
                    .focusRequester(focus)
                    .onFocusChanged { focused = it.isFocused }
                    // Escape is 寄小紙條 again: an empty field closes, one with words keeps them.
                    .onPreviewKeyEvent { e ->
                        if (e.type == KeyEventType.KeyDown && e.key == Key.Escape) {
                            state.segment()
                            true
                        } else false
                    }
                    .semantics { contentDescription = placeholder }
                    .flowTag("note-field"),
            )
        }
    }
}

/** Under row 2, to the field (item 2). */
internal val NoteInPlaceGap: Dp = 12.dp

/** The field's widest, on a tablet: the story's column or this, whichever is narrower. */
internal val NoteFieldMax: Dp = 680.dp

/** How far over the keyboard the field's block stands once the page has brought it there. */
private val NoteKeyboardClearance: Dp = 12.dp

/** The field opening and closing. */
internal const val NOTE_MOVE_MILLIS = 150
