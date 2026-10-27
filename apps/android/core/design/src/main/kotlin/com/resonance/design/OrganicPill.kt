package com.resonance.design

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens

/** How big an [OrganicPill] is: the thread's small one, or the shell's toast. */
enum class PillSize(
    internal val radius: Double,
    internal val padX: Dp,
    internal val padY: Dp,
    internal val minHeight: Dp,
    internal val textSize: Float,
    internal val lineHeight: Float,
    internal val gap: Dp,
    internal val glyph: Dp,
    internal val maxLines: Int,
) {
    /** The thread's jump-to-latest pill: 12.5 semibold, 16 × 9, no press wash, round. */
    Small(18.0, 16.dp, 9.dp, 0.dp, 12.5f, 1.3f, 6.dp, 14.dp, Int.MAX_VALUE),

    /** A toast (the web's InkPill `md`): 14 semibold over a 44 touch height, at most two lines, a card's corners (16). */
    Toast(16.0, 20.dp, 11.dp, 44.dp, 14f, 1.35f, 8.dp, 16.dp, 2),
}

/**
 * The ink pill (the web's atoms/InkPill, iOS's OrganicPill), made as a card is (round 18, the owner's):
 * the accent's light wash (terracotta-light) inside one pen line of the accent at INK, on a calm
 * wobble (WobRectShape seed 41, mag 1.2) — round for the thread's jump-to-latest pill, a card's
 * corners for the shell's toasts ([ToastHost]) — its words and glyph in the deep terracotta ink. Flat,
 * as the whole page is: what floats is told by its line, never a shadow.
 *
 * With [onClick] the whole pill is the button (rule 14: one fill on one layer, no button nested in
 * the wash, no bare text action), named by [onClickLabel] for TalkBack; [verb] is the action's word,
 * set bold after the label and a middle dot (「已移到垃圾桶 · 復原」). [accessibilityLabel] replaces
 * what TalkBack reads for the pill (the visible words first, then what it acts on); with
 * [hiddenFromAccessibility] it reads nothing — the toast host's live region speaks it instead.
 */
@Composable
fun OrganicPill(
    label: String,
    modifier: Modifier = Modifier,
    size: PillSize = PillSize.Small,
    icon: IconName? = null,
    verb: String? = null,
    accessibilityLabel: String? = null,
    hiddenFromAccessibility: Boolean = false,
    onClickLabel: String? = null,
    interactionSource: MutableInteractionSource? = null,
    onClick: (() -> Unit)? = null,
) {
    val source = interactionSource ?: remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val shape = remember(size) { WobRectShape(size.radius, 41.0, mag = 1.2) }
    val ink = Tokens.TerracottaInk
    val wash = Tokens.TerracottaLight
    val pen = Tokens.Terracotta
    val focusPen = Tokens.TerracottaDeep
    val text: AnnotatedString = remember(label, verb) {
        buildAnnotatedString {
            append(label)
            if (verb != null) {
                append(" · ")
                // The variable face's own 700 instance (a weight alone would be synthesised over the 600).
                withStyle(SpanStyle(fontFamily = AppFonts.family(AppFonts.Family.Body, 700))) { append(verb) }
            }
        }
    }
    Box(
        modifier
            .heightIn(min = size.minHeight)
            .drawWithCache {
                val o = shape.createOutline(this.size, layoutDirection, this)
                val line = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                val ring = Stroke(Tokens.InkStrong.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(o, wash)
                    // A keyboard's focus deepens and thickens its own line (it already has one).
                    drawOutline(o, if (focused) focusPen else pen, style = if (focused) ring else line)
                }
            }
            .then(
                when {
                    onClick != null -> Modifier
                        .clickable(
                            source,
                            if (size == PillSize.Small) null else OrganicIndication(shape = shape),
                            role = Role.Button,
                            onClickLabel = onClickLabel,
                            onClick = onClick,
                        )
                        .then(if (accessibilityLabel != null) Modifier.semantics { contentDescription = accessibilityLabel } else Modifier)
                    hiddenFromAccessibility -> Modifier.clearAndSetSemantics { }
                    accessibilityLabel != null -> Modifier.clearAndSetSemantics { contentDescription = accessibilityLabel }
                    else -> Modifier
                },
            )
            .padding(horizontal = size.padX, vertical = size.padY),
        contentAlignment = Alignment.Center,
    ) {
        Row(
            // A button's own name stands for its words (they are its first part, WCAG 2.5.3).
            if (onClick != null && accessibilityLabel != null) Modifier.clearAndSetSemantics { } else Modifier,
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(size.gap),
        ) {
            if (icon != null) OrganicIcon(icon, size = size.glyph, color = ink)
            BasicText(
                text,
                style = AppFonts.body(size.textSize, 600, lineHeight = size.lineHeight, color = ink).copy(textAlign = TextAlign.Center),
                maxLines = size.maxLines,
                overflow = TextOverflow.Ellipsis,
            )
        }
    }
}

/**
 * The ink pill around a glyph alone (the web's InkPill with no words): a round face 36 across inside a
 * 44 touch target — the thread's way back to the latest message, an arrow, small over the thread (the
 * owner, 2026-10-28). [contentDescription] is its name for TalkBack.
 */
@Composable
fun OrganicPillGlyph(icon: IconName, contentDescription: String, modifier: Modifier = Modifier, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val shape = remember { WobRectShape(PillSize.Small.radius, 41.0, mag = 1.2) }
    val ink = Tokens.TerracottaInk
    val wash = Tokens.TerracottaLight
    val pen = Tokens.Terracotta
    val focusPen = Tokens.TerracottaDeep
    Box(
        modifier
            .size(GLYPH_PILL_TARGET)
            .clickable(source, null, role = Role.Button, onClick = onClick)
            .semantics { this.contentDescription = contentDescription },
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(GLYPH_PILL_FACE)
                .drawWithCache {
                    val o = shape.createOutline(this.size, layoutDirection, this)
                    val line = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    val ring = Stroke(Tokens.InkStrong.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    onDrawBehind {
                        drawOutline(o, wash)
                        drawOutline(o, if (focused) focusPen else pen, style = if (focused) ring else line)
                    }
                },
            contentAlignment = Alignment.Center,
        ) {
            OrganicIcon(icon, size = GLYPH_PILL_ICON, color = ink)
        }
    }
}

private val GLYPH_PILL_FACE = 36.dp
private val GLYPH_PILL_TARGET = 44.dp
private val GLYPH_PILL_ICON = 18.dp
