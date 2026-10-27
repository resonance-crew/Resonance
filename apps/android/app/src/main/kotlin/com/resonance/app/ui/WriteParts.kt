package com.resonance.app.ui

import android.view.KeyCharacterMap
import android.view.KeyEvent
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.relocation.BringIntoViewRequester
import androidx.compose.foundation.relocation.bringIntoViewRequester
import kotlinx.coroutines.delay
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.unit.IntSize
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.offset
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.em
import com.resonance.design.ButtonLoader
import com.resonance.design.CapsuleField
import com.resonance.design.labelInkDrop
import com.resonance.design.prefersReducedMotion
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.layout.Placeable
import androidx.compose.ui.platform.LocalFocusManager
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.resonance.design.AppFonts
import com.resonance.design.AutoWobRectShape
import com.resonance.design.ButtonVariant
import com.resonance.design.OrganicButton
import com.resonance.design.OrganicIcon
import com.resonance.design.TagPill
import com.resonance.design.TagSize
import com.resonance.design.fieldHintStyle
import com.resonance.design.fieldSurface
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.PaletteMixes
import com.resonance.kit.l10n.L10n

/**
 * The publish step's tag field (round 16 §1): the chat composer's capsule ([CapsuleField]) — the
 * field's wobble on cream, its pen darkening while written in, one line exactly 48 tall, no ＋ — and
 * its end a segment behind a wavy seam that follows what is typed: nothing (or a word an IME is
 * still composing, [TagEntry.ready]) — the tonal face, ✦ AI 建議, which asks the model (the pen loop
 * in the sparkle's place while it thinks, the words staying); a word committed — the solid face,
 * ＋ 新增, which adds it. The segment is as wide as the wider of its two faces, measured once per
 * language, so the seam never moves as typing starts. Done, a comma (，、 too) or the segment adds;
 * a tap on the segment mid-composition takes the word as it stands. Backspace in an empty field
 * takes the last tag back only from a hardware keyboard ([TagEntry.hardwareBackspace]), never a soft
 * one. The chosen tags are the row above it, not inside it ([TagPillRow]); the error line under it
 * is the caller's.
 */
@Composable
fun TagField(
    draft: String,
    /** The words as typed, and whether an IME is still composing them (then they are kept whole, never split at a comma). */
    onDraftChange: (String, Boolean) -> Unit,
    placeholder: String,
    suggesting: Boolean,
    canRemoveLast: Boolean,
    onRemoveLast: () -> Unit,
    /** Add [String] — the field's word as it stands (a composition's too). */
    onAdd: (String) -> Unit,
    onSuggest: () -> Unit,
    onFocusChanged: (Boolean) -> Unit,
    modifier: Modifier = Modifier,
) {
    var focused by remember { mutableStateOf(false) }
    val focus = remember { FocusRequester() }
    val focusManager = LocalFocusManager.current
    // The field's own value, so an IME's composing range is seen: the model holds the words alone.
    var value by remember { mutableStateOf(TextFieldValue(draft, TextRange(draft.length))) }
    // The model changed the words (an add emptied them): the field follows, unless an IME is mid-word in them.
    if (value.text != draft && value.composition == null) value = TextFieldValue(draft, TextRange(draft.length))
    val ready = TagEntry.ready(value.text, value.composition != null)
    val text = AppFonts.body(15f, lineHeight = 1.6f)
    val add = {
        val word = value.text
        // Mid-composition the word is taken as it stands; a fresh value ends the IME's composition.
        value = TextFieldValue("")
        onAdd(word)
    }
    val segmentWidth = tagSegmentWidth()
    // The whole capsule over the keyboard as it rises, not only its line of text (its segment, its foot with 12 to spare).
    val bring = remember { BringIntoViewRequester() }
    // Followed frame by frame as the keyboard rises: once it has stood still a moment, the capsule is brought over it.
    val imeBottom = WindowInsets.ime.getBottom(LocalDensity.current)
    val spare = with(LocalDensity.current) { 12.dp.toPx() }
    var capsule by remember { mutableStateOf(IntSize.Zero) }
    LaunchedEffect(focused, imeBottom) {
        if (focused && imeBottom > 0) {
            delay(IME_SETTLE_MILLIS)
            bring.bringIntoView(Rect(0f, 0f, capsule.width.toFloat(), capsule.height + spare))
        }
    }
    CapsuleField(
        ready = ready,
        segmentWidth = segmentWidth,
        segmentLabel = if (ready) L10n.Write.tagsAddLabel(value.text.trim()) else L10n.Write.tagsSuggestLabel,
        onSegment = {
            if (value.text.isNotBlank()) add()
            else onSuggest()
        },
        focused = { focused },
        textStyle = text,
        modifier = modifier.bringIntoViewRequester(bring).onSizeChanged { capsule = it }.onFocusChanged {
            focused = it.hasFocus
            onFocusChanged(it.hasFocus)
        }.capsuleTapFocuses(focus, segmentWidth, LocalLayoutDirection.current),
        seed = 53.0,
        // While the model thinks the segment takes no tap (the words typed meanwhile still add by Done).
        segmentEnabled = ready || !suggesting,
        segmentState = if (suggesting && !ready) L10n.App.busy else null,
        segment = { ink -> TagSegmentFace(ready, suggesting, ink) },
    ) { vertical ->
        Box(Modifier.fillMaxWidth().padding(vertical = vertical)) {
            if (value.text.isEmpty()) BasicText(placeholder, style = fieldHintStyle(placeholder), maxLines = 1)
            BasicTextField(
                value,
                { next ->
                    // While an IME is mid-word its separators and its Enter are its own.
                    value = next
                    if (next.text != draft || next.composition == null) onDraftChange(next.text, next.composition != null)
                },
                textStyle = text,
                singleLine = true,
                keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
                // Done adds what is typed and stays for the next; with nothing typed it is done with the field.
                keyboardActions = KeyboardActions(onDone = { if (value.text.isNotBlank()) add() else focusManager.clearFocus() }),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusRequester(focus)
                    .onPreviewKeyEvent { e ->
                        val native = e.nativeKeyEvent
                        // One tag per press, from a hardware keyboard only: a soft keyboard's Backspace never takes a tag.
                        if (e.type == KeyEventType.KeyDown && e.key == Key.Backspace && value.text.isEmpty() && canRemoveLast &&
                            TagEntry.hardwareBackspace(native.repeatCount, native.deviceId, native.flags, native.device?.isVirtual)
                        ) {
                            onRemoveLast()
                            true
                        } else false
                    }
                    .semantics { contentDescription = placeholder },
            )
        }
    }
}

/**
 * A tap on the capsule's own paper — its margins round the words, which the text field itself doesn't
 * cover — is a tap on the field (round 17): it takes the focus (the keyboard comes or stays), and the
 * publish step never reads it as a tap on its blank, which puts the keyboard away. The words and the
 * segment take their own taps first; one on a segment that takes none (the model thinking) does nothing.
 */
private fun Modifier.capsuleTapFocuses(focus: FocusRequester, segmentWidth: Dp, direction: LayoutDirection): Modifier = pointerInput(focus, segmentWidth, direction) {
    detectTapGestures { at ->
        val segment = segmentWidth.toPx()
        val onSegment = if (direction == LayoutDirection.Ltr) at.x >= size.width - segment else at.x <= segment
        if (!onSegment) focus.requestFocus()
    }
}

/**
 * The tag segment's face: ✦ AI 建議 at rest (the pen loop in the sparkle's place while the model
 * thinks), ＋ 新增 once a word is committed — the glyph 6 before the words, 14/600, in [ink].
 */
@Composable
private fun TagSegmentFace(ready: Boolean, suggesting: Boolean, ink: Color) {
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(TAG_SEGMENT_GAP)) {
        val drop = Modifier.offset(y = labelInkDrop(TAG_SEGMENT_FONT))
        when {
            ready -> OrganicIcon(IconName.Plus, drop, size = 13.dp, color = ink)
            suggesting -> ButtonLoader(ink, 16.dp, drop)
            else -> OrganicIcon(IconName.Sparkle, drop, size = 16.dp, color = ink)
        }
        BasicText(if (ready) L10n.Write.tagsAdd else L10n.Write.tagsSuggestShort, style = tagSegmentStyle(ink), maxLines = 1)
    }
}

@Composable @ReadOnlyComposable
private fun tagSegmentStyle(ink: Color) = AppFonts.body(TAG_SEGMENT_FONT, 600, lineHeight = 1.3f, color = ink).copy(letterSpacing = 0.02.em)

private const val TAG_SEGMENT_FONT = 14f

/** The keyboard's rise settles this long before the field is brought over it. */
private const val IME_SETTLE_MILLIS = 120L
private val TAG_SEGMENT_GAP = 6.dp

/**
 * The tag segment's width (round 16 §1): the wider of its two faces — ✦ + AI 建議, ＋ + 新增 — and
 * 28 of air, measured once per language (and text size), so the seam stays put as typing starts.
 */
@Composable
private fun tagSegmentWidth(): Dp {
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    val style = tagSegmentStyle(Tokens.Text)
    val suggest = L10n.Write.tagsSuggestShort
    val addWord = L10n.Write.tagsAdd
    return remember(suggest, addWord, style, density) {
        with(density) {
            val a = measurer.measure(suggest, style, maxLines = 1, softWrap = false).size.width.toDp() + 16.dp
            val b = measurer.measure(addWord, style, maxLines = 1, softWrap = false).size.width.toDp() + 13.dp
            maxOf(a, b) + TAG_SEGMENT_GAP + 28.dp
        }
    }
}

/** The tag field's rules that need no screen: when its segment adds, and which Backspace takes a tag back. */
internal object TagEntry {
    /** Whether the segment adds (`ready`): a word committed — not blank, and no IME mid-composition. */
    fun ready(text: String, composing: Boolean): Boolean = !composing && text.isNotBlank()

    /**
     * Whether a Backspace key event came from a hardware keyboard, pressed once (not held): a soft
     * keyboard's comes from the virtual keyboard device or carries FLAG_SOFT_KEYBOARD, and never
     * takes a tag back — on a phone a Backspace held to clear the words would eat the tags too.
     */
    fun hardwareBackspace(repeatCount: Int, deviceId: Int, flags: Int, virtualDevice: Boolean?): Boolean =
        repeatCount == 0 && deviceId != KeyCharacterMap.VIRTUAL_KEYBOARD && (flags and KeyEvent.FLAG_SOFT_KEYBOARD) == 0 && virtualDevice != true
}

/**
 * The chosen tags (round 16 §1, its review's S1 / N6; round 17 §4), under the section's label — which stands
 * on a line of its own, as 卡片類型's does, so a wrapped row never hangs indented under it: each tag a large
 * pill with no rim, in the field's 「AI 建議」 segment's colours ([TagPill] with `ink`: the tonal button's fill,
 * its ink for the words at 500 and for the ✕ at 70 %), its ✕ named for its tag (移除標籤：日常) with a 44 hit box round it,
 * 8 apart and 8 between lines, [TagRowTop] under the label. With no tags the row takes no room at all.
 * A tag added after the row was first drawn pops in (160 ms, 0.85 → 1; at once with animations off).
 * [onHeightChange] hears the row's height change as it is measured — before anything under it is placed
 * — so the field under it can be kept still (the first pill bringing the row along too).
 */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun TagPillRow(
    tags: List<String>,
    onRemove: (String) -> Unit,
    onHeightChange: (Int) -> Unit,
) {
    val reduced = LocalContext.current.prefersReducedMotion()
    // The tags the row opened with stand still; only ones added since pop in.
    val first = remember { tags.toSet() }
    val lastHeight = remember { intArrayOf(-1) }
    val fill = Tokens.ButtonTonal
    val ink = Tokens.ButtonOnTonal
    FlowRow(
        Modifier
            .fillMaxWidth()
            .layout { measurable, constraints ->
                val placeable = measurable.measure(constraints)
                val before = lastHeight[0]
                lastHeight[0] = placeable.height
                if (before >= 0 && before != placeable.height) onHeightChange(placeable.height - before)
                layout(placeable.width, placeable.height) { placeable.place(0, 0) }
            }
            // Measured inside the hook above, so the row's coming and going counts its air too.
            .then(if (tags.isEmpty()) Modifier else Modifier.padding(top = TagRowTop)),
        horizontalArrangement = Arrangement.spacedBy(TagGap),
        verticalArrangement = Arrangement.spacedBy(TagGap),
        itemVerticalAlignment = Alignment.CenterVertically,
    ) {
        tags.forEach { tag ->
            key(tag) {
                val pop = remember { Animatable(if (tag in first || reduced) 1f else 0.85f) }
                LaunchedEffect(Unit) { if (pop.value < 1f) pop.animateTo(1f, tween(TAG_POP_MILLIS, easing = EaseOut)) }
                Box(Modifier.graphicsLayer { scaleX = pop.value; scaleY = pop.value }) {
                    TagPill(
                        tag, fill, size = TagSize.Lg, outlined = false, quiet = true, ink = ink,
                        removeLabel = L10n.Write.tagsRemoveLabel(tag),
                        onRemove = { onRemove(tag) },
                    )
                }
            }
        }
    }
}

/** How far the pills stand under the section's label (the web's 8). */
private val TagRowTop = 8.dp
private val TagGap = 8.dp
private const val TAG_POP_MILLIS = 160

/** One half of the image surface (upload or illustrate): the terracotta glyph, the muted title and its fainter hint. */
@Composable
fun MediaHalf(icon: IconName, title: String, hint: String, modifier: Modifier = Modifier) {
    Column(
        modifier.padding(vertical = 22.dp, horizontal = 18.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterVertically),
    ) {
        OrganicIcon(icon, size = 26.dp, color = Tokens.Terracotta)
        BasicText(title, style = AppFonts.body(14f, 600, lineHeight = 1.4f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center))
        BasicText(hint, style = AppFonts.body(12f, lineHeight = 1.4f, color = Tokens.TextMuted.copy(alpha = 0.75f)).copy(textAlign = TextAlign.Center))
    }
}

/**
 * The image surface's frame (HandDrawnDashedSurface R16, seed 31, bow 0.8):
 * the field's line, terracotta while something is on its way in.
 */
@Composable
fun Modifier.mediaFrame(busy: Boolean = false): Modifier {
    val ink = if (busy) Tokens.Terracotta else Tokens.FieldBorder
    return drawWithCache {
        // Built when the size changes, not on every draw.
        val o = AutoWobRectShape(16.0, 31.0, 0.8).createOutline(size, layoutDirection, this)
        val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        onDrawBehind { drawOutline(o, ink, style = pen) }
    }
}
