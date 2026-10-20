package com.resonance.design

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
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
    /** The thread's jump-to-latest pill, as it always was: 12.5 semibold, 16 × 9, no press wash. */
    Small(18.0, 16.dp, 9.dp, 0.dp, 12.5f, 1.3f, 6.dp, 14.dp, Int.MAX_VALUE),

    /** A toast (the web's InkPill `md`): 14 semibold over a 44 touch height, at most two lines. */
    Toast(22.0, 20.dp, 11.dp, 44.dp, 14f, 1.35f, 8.dp, 16.dp, 2),
}

/**
 * The ink pill (the web's atoms/InkPill, iOS's OrganicPill): cream under terracotta-light at 0.9 in
 * a calm wobble (WobRectShape seed 41, mag 1.2), no pen line, its words and glyph in the deep
 * terracotta ink. Lifted from the thread's jump-to-latest pill — whose recipe it keeps — for the
 * shell's toasts ([ToastHost]).
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
                val ring = Stroke(Tokens.Ink.toPx())
                onDrawBehind {
                    drawOutline(o, Tokens.Cream)
                    drawOutline(o, Tokens.TerracottaLight, alpha = 0.9f)
                    // A keyboard's focus: the pen goes round it in terracotta, as a field's does.
                    if (focused) drawOutline(o, Tokens.Terracotta, style = ring)
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
