package com.resonance.design

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.CacheDrawScope
import androidx.compose.ui.draw.DrawResult
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.colorspace.ColorSpaces
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.layout
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.ReactionColour
import com.resonance.design.generated.ReactionId
import com.resonance.design.generated.ReactionLayer
import com.resonance.design.generated.ResonanceColors
import com.resonance.design.generated.Tokens
import kotlinx.coroutines.delay

// Round 16 §3–§4: the five hand-drawn reactions, the tray and the action sheet a held message shows,
// and the chip a reaction leaves beside a bubble's foot.

/**
 * A reaction sticker (round 16 §4: ❤️ heart, 🥹 moved, 😂 laugh, 🤗 hug, 👍 thumbs), drawn from the
 * generated layers (`generated/Reactions.kt`, from src/lib/design/reactions.ts) bottom to top in a 24
 * box scaled to [size]: fills a little off their line, as crayon. The colours are the stickers' own,
 * the same in both schemes as emoji keep — but the outer rim is the palette's `reaction-outline` (deep
 * brown on paper, chalk at night), so a sticker never melts into the dark. Pens round. Decoration:
 * whatever shows it names it.
 */
@Composable
fun ReactionGlyph(id: ReactionId, size: Dp, modifier: Modifier = Modifier) {
    val outline = Tokens.ReactionOutline
    val paths = remember(id) { reactionPaths(id) }
    Canvas(modifier.size(size).clearAndSetSemantics { }) {
        val k = this.size.width / REACTION_BOX
        withTransform({ scale(k, k, pivot = Offset.Zero) }) {
            id.layers.forEachIndexed { i, layer ->
                val path = paths[i]
                layer.fill?.let { drawPath(path, reactionColour(it, outline), alpha = layer.opacity) }
                layer.stroke?.let {
                    drawPath(path, reactionColour(it, outline), alpha = layer.opacity, style = Stroke(layer.width, cap = StrokeCap.Round, join = StrokeJoin.Round))
                }
            }
        }
    }
}

private const val REACTION_BOX = 24f

/** A sticker colour: its fixed Display P3 one, but the rim in the palette's [outline]. */
private fun reactionColour(colour: ReactionColour, outline: Color): Color =
    if (colour == ReactionColour.Outline) outline else Color(colour.red, colour.green, colour.blue, 1f, ColorSpaces.DisplayP3)

/** Each sticker's paths in its 24 box, built once (drawing never changes a path). */
private val reactionPathCache = HashMap<ReactionId, List<Path>>()

private fun reactionPaths(id: ReactionId): List<Path> = synchronized(reactionPathCache) {
    reactionPathCache.getOrPut(id) { id.layers.map(::layerPath) }
}

private fun layerPath(layer: ReactionLayer): Path {
    val p = Path()
    val c = layer.commands
    var i = 0
    while (i < c.size) {
        when (c[i].toInt()) {
            0 -> { p.moveTo(c[i + 1], c[i + 2]); i += 3 }
            1 -> { p.lineTo(c[i + 1], c[i + 2]); i += 3 }
            2 -> { p.cubicTo(c[i + 1], c[i + 2], c[i + 3], c[i + 4], c[i + 5], c[i + 6]); i += 7 }
            else -> { p.close(); i += 1 }
        }
    }
    return p
}

/** The reactions in the order every surface shows them (round 16 §4). */
val ReactionOrder: List<ReactionId> = listOf(ReactionId.Heart, ReactionId.Moved, ReactionId.Laugh, ReactionId.Hug, ReactionId.Thumbs)

/** The tray: 5 cells of 44 in 6 of padding → 232 × 52. */
val ReactionTrayCell = 44.dp
val ReactionTrayPad = 6.dp
val ReactionTrayWidth: Dp = ReactionTrayCell * 5 + ReactionTrayPad * 2
val ReactionTrayHeight: Dp = ReactionTrayCell + ReactionTrayPad * 2

/**
 * The five reactions over a held message (round 16 §3, round 17 §2.2): no paper under them — the scrim
 * already dims and softens the thread, so the stickers float over it — a 44 cell each, the stickers at
 * 32. The viewer's own reaction ([chosen]) sits on a wobbly disc (2 in from its cell, opaque: the
 * accent's light wash, at night the accent at 30 % over the menus' raised paper —
 * [PaletteMixes.reactionChosen]) and is said as selected; tapping it again takes it back
 * ([onChoose] with it). The stickers pop in 20 ms apart (0.6 → 1; a plain fade with animations off).
 * Each cell is named [label] (以 愛心 回應), the chosen one [removeLabel] too.
 */
@Composable
fun ReactionTray(
    chosen: ReactionId?,
    label: (ReactionId) -> String,
    removeLabel: String,
    groupLabel: String,
    onChoose: (ReactionId) -> Unit,
    modifier: Modifier = Modifier,
    seed: Double = 61.0,
) {
    val palette = LocalResonanceColors.current
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    val disc = PaletteMixes.of(palette).reactionChosen
    Row(
        modifier
            .size(ReactionTrayWidth, ReactionTrayHeight)
            .padding(ReactionTrayPad)
            .selectableGroup()
            .semantics { contentDescription = groupLabel },
    ) {
        ReactionOrder.forEachIndexed { i, id ->
            val on = id == chosen
            val pop = remember { Animatable(0f) }
            LaunchedEffect(Unit) {
                delay(i * POP_STAGGER_MILLIS)
                pop.animateTo(1f, tween(if (still) 120 else 180, easing = PopEasing))
            }
            val source = remember { MutableInteractionSource() }
            val pressed by source.collectIsPressedAsState()
            Box(
                Modifier
                    .size(ReactionTrayCell)
                    .clickable(source, indication = null, role = Role.Button) { onChoose(id) }
                    .clearAndSetSemantics {
                        contentDescription = if (on) removeLabel else label(id)
                        role = Role.Button
                        selected = on
                        if (on) stateDescription = label(id)
                    },
                contentAlignment = Alignment.Center,
            ) {
                // The chosen disc comes with its sticker: with no paper under the tray, a disc ahead of it read as a stain.
                if (on) Box(
                    Modifier
                        .matchParentSize()
                        .graphicsLayer {
                            alpha = pop.value
                            val s = if (still) 1f else 0.6f + 0.4f * pop.value
                            scaleX = s
                            scaleY = s
                        }
                        .drawWithCacheOf(TrayDisc(true, disc, seed + i * 13)),
                )
                ReactionGlyph(
                    id, 32.dp,
                    Modifier.graphicsLayer {
                        val v = pop.value
                        alpha = v
                        val s = (if (still) 1f else 0.6f + 0.4f * v) * (if (pressed) 0.9f else 1f)
                        scaleX = s
                        scaleY = s
                    },
                )
            }
        }
    }
}

private const val POP_STAGGER_MILLIS = 20L
private val PopEasing = CubicBezierEasing(0.2f, 0.9f, 0.3f, 1.2f)

/** The disc behind the viewer's own reaction in the tray. */
private data class TrayDisc(val on: Boolean, val fill: Color, val seed: Double) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val inset = 2.dp.toPx()
        val d = size.minDimension - 2 * inset
        val o = WobCircleShape(seed).createOutline(androidx.compose.ui.geometry.Size(d, d), layoutDirection, this)
        onDrawBehind {
            if (on) withTransform({ translate((size.width - d) / 2, (size.height - d) / 2) }) { drawOutline(o, fill) }
        }
    }
}

/** A row of a held message's action list ([destructive]: a permanent loss, its words in the danger ink). */
class MessageAction(val title: String, val icon: IconName, val destructive: Boolean = false, val onClick: () -> Unit)

/** How tall the action list is for [rows] rows and its foot (round 17 §2.3: [MenuSheet.height]). */
fun messageActionsHeight(rows: Int): Dp = MenuSheet.height(rows, footer = true)

/**
 * What a held message offers (round 16 §3, round 17 §1–§2): the one menu sheet ([MenuSheet]) — paper and
 * grain, no pen, no rules between the rows, its shadow under it over the scrim — as wide as its longest
 * row. Rows of 44, the glyph in the accent (17; the danger ink, words too, for a loss) 12 before the
 * words, 20 in from either side; a press spreads the accent's ink inside its row's band. The quiet
 * last line [footer] (the full send time) at the end of a 24-tall line right under the rows. A row taps
 * once ([onChoose]).
 */
@Composable
fun MessageActionSheet(
    actions: List<MessageAction>,
    footer: String,
    onChoose: (MessageAction) -> Unit,
    modifier: Modifier = Modifier,
    seed: Double = 67.0,
) {
    val palette = LocalResonanceColors.current
    val rows = remember(actions) { actions.map { SheetRow(it.title, it.icon, danger = it.destructive) } }
    val inks = remember(palette) { MenuColors(null, palette).sheetInks() }
    PaperMenuSheet(rows, seed, inks, footer, onChoose = { onChoose(actions[it]) }, modifier = modifier)
}

/**
 * One reaction a message carries, as its chip shows it: the sticker, and how many gave it (2 when both
 * of the conversation's people did).
 */
data class ReactionChipItem(val id: ReactionId, val count: Int)

/** A chip's height; each further distinct reaction stands this much further out. */
val ReactionChipHeight = 24.dp
val ReactionChipStep = 20.dp
/** How far a chip overlaps its bubble's side edge. */
val ReactionChipOverlap = 6.dp

/**
 * The reactions a message carries (round 16 §3), as chips in the gutter beside its bubble's foot —
 * never under it, so a row's height never changes. Each distinct reaction a paper capsule (cream,
 * with a 2 px ring of the thread's paper [ring], no pen line) holding its sticker at 18, a count (12,
 * muted) when both gave it; the second steps [ReactionChipStep] further out, under the first.
 * [outward] says which way is out (−1: to the start, own messages; +1: to the end, theirs). Pops in.
 */
@Composable
fun ReactionChips(
    items: List<ReactionChipItem>,
    outward: Int,
    ring: Color,
    modifier: Modifier = Modifier,
    /** What the chips say (who reacted how). */
    label: String? = null,
    /** A tap (the held message's overlay): taken in a finger's 44 × 44 round the nearest chip, unseen. */
    onTap: (() -> Unit)? = null,
) {
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    Box(if (onTap == null && label != null) modifier.semantics { contentDescription = label } else modifier) {
        // The farthest drawn first, so the nearest lies over it.
        items.withIndex().reversed().forEach { (i, item) ->
            androidx.compose.runtime.key(item.id) {
                val pop = remember { Animatable(if (still) 1f else 0.4f) }
                LaunchedEffect(Unit) { pop.animateTo(1f, tween(180, easing = PopEasing)) }
                ReactionChip(
                    item, ring,
                    Modifier
                        .graphicsLayer {
                            translationX = outward * i * ReactionChipStep.toPx()
                            scaleX = pop.value
                            scaleY = pop.value
                        },
                )
            }
        }
        // The chip is 24 tall: its tap takes a finger's 44 × 44, centred on it and overhanging it unseen
        // (round 16 review S7, the web's ::before) — the chips keep their size, the row its height.
        if (onTap != null) Box(
            Modifier
                .matchParentSize()
                .overhang(ReactionChipTarget)
                .clickable(interactionSource = null, indication = null, role = Role.Button, onClick = onTap)
                .semantics { label?.let { contentDescription = it } },
        )
    }
}

/** A chip's tap target: a finger's 44 round it. */
val ReactionChipTarget = 44.dp

/**
 * Lays its content out at least [least] × [least], centred on this node and overhanging it where it is
 * larger, while this node keeps the size it was given — a hit box round something small.
 */
internal fun Modifier.overhang(least: Dp): Modifier = layout { measurable, constraints ->
    val w = constraints.maxWidth
    val h = constraints.maxHeight
    val box = least.roundToPx()
    val tw = maxOf(w, box)
    val th = maxOf(h, box)
    val placeable = measurable.measure(Constraints.fixed(tw, th))
    layout(w, h) { placeable.place((w - tw) / 2, (h - th) / 2) }
}

@Composable
private fun ReactionChip(item: ReactionChipItem, ring: Color, modifier: Modifier) {
    val paper = Tokens.Cream
    Row(
        modifier
            .heightIn(min = ReactionChipHeight)
            .widthIn(min = ReactionChipHeight)
            .drawWithCacheOf(ChipPaper(paper, ring))
            .padding(horizontal = 3.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(2.dp, Alignment.CenterHorizontally),
    ) {
        ReactionGlyph(item.id, 18.dp)
        if (item.count > 1) BasicText("${item.count}", style = chipCount(), modifier = Modifier.padding(end = 2.dp))
    }
}

@Composable @ReadOnlyComposable
private fun chipCount() = AppFonts.body(12f, 600, lineHeight = 1f, color = Tokens.TextMuted)

/** A chip's paper: the capsule on a ring 2 px wider of the thread's paper. */
private data class ChipPaper(val paper: Color, val ring: Color) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val r = 2.dp.toPx()
        onDrawBehind {
            val radius = size.height / 2
            drawRoundRect(ring, topLeft = Offset(-r, -r), size = androidx.compose.ui.geometry.Size(size.width + 2 * r, size.height + 2 * r), cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius + r))
            drawRoundRect(paper, cornerRadius = androidx.compose.ui.geometry.CornerRadius(radius))
        }
    }
}
