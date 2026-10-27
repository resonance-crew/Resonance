package com.resonance.design

import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.ResonanceColors
import com.resonance.design.generated.Tokens
import com.resonance.geometry.rowBoundary
import com.resonance.geometry.rowRegion
import kotlin.math.max

// Round 18 (the owner's, reversing round 17's borderless grain sheet and its paper-cut shadow): every menu is one
// flat sheet — the theme's menu paper inside one hand-drawn pen line, the header's quiet grey (a card's own menu its
// card's paper and pen), no grain, no rules between its rows and no shadow: what floats is told by its line, as a
// card is. A row's ink spreads from the finger inside that row's own band of the wobble. 封鎖 (a warning) rests on
// the warning yellow, a row that removes something (刪除, 永久刪除, 刪除對話, 捨棄) on a red wash in the danger ink;
// every wash is cut by the sheet's outline alone, so it fills its band right to the pen line, which is drawn over it.

/**
 * A menu sheet's measures (round 17 §1, §2.3): rows 44 tall, the glyph 17, 12 to the words, 20 of air at the
 * row's start and end — the sheet as wide as its longest row with them, [MinWidth] at least (a held message's
 * list [PressMinWidth]) and [MaxWidth] at most — 6 above the first
 * row; under the last, 6 more, or the quiet foot's 24-tall line (its words at the end) and 10 under that.
 */
object MenuSheet {
    val Row: Dp = 44.dp
    val Glyph: Dp = 17.dp
    val GlyphGap: Dp = 12.dp
    val PadX: Dp = 20.dp
    val PadTop: Dp = 6.dp
    val PadBottom: Dp = 6.dp
    val Footer: Dp = 24.dp
    val FooterBottom: Dp = 10.dp
    val MaxWidth: Dp = 280.dp
    /** Two short rows (the composer's 圖片 · 卡片) would otherwise make a blob of it. */
    val MinWidth: Dp = 168.dp
    /** A held message's list, as since round 16. */
    val PressMinWidth: Dp = 216.dp
    /** The wobble's corners (the press menu's sheet since round 16). */
    const val RADIUS = 22.0
    /** The words' size. */
    const val TEXT = 15f
    /** The foot's words' size. */
    const val FOOTER_TEXT = 12f
    /**
     * The room a popup keeps round its sheet (round 18: no shadow to hold any more): the wobble swings up to ~4
     * past the box and the pen line's half-width past that, so nothing of either is cut straight.
     */
    val Room: Dp = 8.dp

    /** How tall a sheet of [rows] rows is, with its quiet foot or without. */
    fun height(rows: Int, footer: Boolean): Dp =
        PadTop + Row * rows + if (footer) Footer + FooterBottom else PadBottom
}

/** A sheet's wobble at this size: what it is filled to, inked round and its rows' washes are cut to. */
private fun CacheDrawScope.sheetOutline(seed: Double): Path {
    val o = WobRectShape(MenuSheet.RADIUS, seed).createOutline(size, layoutDirection, this)
    return (o as? Outline.Generic)?.path ?: Path().apply { addOutline(o) }
}

/**
 * Each row's band of a [w]×[h] (dp) sheet of [rows] rows (and its foot's, which takes no ink): the wavy boundaries
 * the web's rowRegion draws between rows (never drawn themselves). They run [bandOvershoot] past the box on every
 * outer side — further than the wobble ever swings out of it —, so the sheet's outline, which every wash is
 * clipped to, is what ends them: on the pen line, never short of it nor past it.
 */
internal fun sheetBands(w: Double, h: Double, rows: Int, footer: Boolean, seed: Double, density: Float): List<Path> {
    val pad = bandOvershoot(h)
    val top = MenuSheet.PadTop.value.toDouble()
    val rowH = MenuSheet.Row.value.toDouble()
    val bands = rows + if (footer) 1 else 0
    val boundaries = (0 until bands - 1).map { i -> rowBoundary(top + (i + 1) * rowH, w, seed + i * 31 + 7, 2.0, pad) }
    return (0 until rows).map { rowRegion(it, bands, boundaries, w, h, pad).toPath(density) }
}

/** How far the outer bands reach past the box (the web's `max(10, h × 4 %)`). */
internal fun bandOvershoot(h: Double): Double = max(10.0, h * 0.04)

/**
 * The sheet itself, in order: its paper on the one wobble; inside it the rows' resting washes (封鎖's yellow,
 * 刪除's red) and the pressed row's ink spreading from the finger in its band; then the pen line over all of it
 * (a row's ink never covers the line); the rows' glyphs and words come after, over everything.
 */
private class SheetPaperDrawing(
    val seed: Double,
    val paper: Color,
    val pen: Color,
    val footer: Boolean,
    /** What each row rests on (null: the bare paper). */
    val rests: List<Color?>,
    /** Each row's ink when pressed. */
    val presses: List<Color>,
    val state: () -> Pair<Int?, InkSpread>,
) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val outline = sheetOutline(seed)
        val w = (size.width / density).toDouble()
        val h = (size.height / density).toDouble()
        val regions = sheetBands(w, h, presses.size, footer, seed, density)
        val line = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        onDrawBehind {
            drawPath(outline, paper)
            clipPath(outline) {
                rests.forEachIndexed { i, rest -> if (rest != null && i in regions.indices) drawPath(regions[i], rest) }
                val (i, spread) = state()
                if (i != null && i in regions.indices) with(spread) { draw(regions[i], presses[i]) }
            }
            drawPath(outline, pen, style = line)
        }
    }

    override fun equals(other: Any?) = other is SheetPaperDrawing && other.seed == seed && other.paper == paper && other.pen == pen &&
        other.footer == footer && other.rests == rests && other.presses == presses
    override fun hashCode() = ((((seed.hashCode() * 31 + paper.hashCode()) * 31 + pen.hashCode()) * 31 + rests.hashCode()) * 31 + presses.hashCode()) * 31 + footer.hashCode()
}

/** What a menu row does: an ordinary row, one that warns (封鎖: a step back from someone), or one that removes something. */
enum class RowTone { Plain, Warn, Danger }

/**
 * One row of a [PaperMenuSheet]: its words and glyph, and its [tone] — a warning rests on the yellow (its words in
 * the text ink, its glyph the others'), a loss on a red wash with its words and glyph in the danger ink.
 */
@Immutable
internal class SheetRow(val title: String, val icon: IconName, val enabled: Boolean = true, val tone: RowTone = RowTone.Plain)

/**
 * A sheet's inks: its paper and its pen line; the glyphs' pen, and the pen a pressed row's glyph and words take;
 * a row's spreading ink; the danger ink a loss wears, what it rests on and its ink; what a warning rests on and its ink.
 */
@Immutable
internal data class SheetInks(
    val paper: Color,
    val pen: Color,
    val glyph: Color,
    val glyphPressed: Color,
    val press: Color,
    val danger: Color,
    val dangerRest: Color,
    val dangerPress: Color,
    val warnRest: Color,
    val warnPress: Color,
) {
    /** What a row of [tone] rests on before any ink (the web's `menuRowRest`): null for the bare paper. */
    fun rest(tone: RowTone): Color? = when (tone) {
        RowTone.Plain -> null
        RowTone.Warn -> warnRest
        RowTone.Danger -> dangerRest
    }

    /** A row of [tone]'s ink under the finger (the web's `menuRowWash`). */
    fun pressOf(tone: RowTone): Color = when (tone) {
        RowTone.Plain -> press
        RowTone.Warn -> warnPress
        RowTone.Danger -> dangerPress
    }
}

/** How strong a pressed row's ink is, in its hue (the web's `color-mix(… 15%, transparent)`), a loss's too. */
internal const val SheetPressAlpha = 0.15f

/** What a loss rests on: the danger hue at 11 % (the web's `menuRowRest('danger')`). */
internal const val SheetDangerRestAlpha = 0.11f

/**
 * The sheet's inks for a menu of the theme's (or a card's hue): [MenuColors] on its paper, inside its pen. 封鎖's
 * yellow is laid on at 32 % by day and nearly whole at night, where the yellow is a deep olive; its ink is more of
 * the yellow by day and the text ink at 8 % at night (the web's `--menu-warn-rest` / `--menu-warn-ink`).
 */
internal fun MenuColors.sheetInks(palette: ResonanceColors): SheetInks = SheetInks(
    paper = sheet,
    pen = pen,
    glyph = border,
    glyphPressed = borderHover,
    press = borderHover.copy(alpha = SheetPressAlpha),
    danger = danger,
    dangerRest = dangerInk.copy(alpha = SheetDangerRestAlpha),
    dangerPress = dangerInk.copy(alpha = SheetPressAlpha),
    warnRest = palette.Yellow.copy(alpha = if (palette.dark) 0.90f else 0.32f),
    warnPress = if (palette.dark) palette.Text.copy(alpha = 0.08f) else palette.Yellow.copy(alpha = 0.30f),
)

/** What a [SheetRow]'s glyph and words are drawn in: the danger ink for a loss, pressed or not; else the pen pressed, or the glyph's pen and the text ink at rest. */
internal fun SheetInks.rowInks(row: SheetRow, down: Boolean, text: Color): Pair<Color, Color> = when {
    row.tone == RowTone.Danger -> danger to danger
    down -> glyphPressed to glyphPressed
    else -> glyph to text
}

/**
 * The one menu surface (round 17 §1, round 18): the rows ([SheetRow]) on a flat [MenuSheet] — its paper inside its
 * pen line, no grain, no shadow —, and an optional quiet [footer] line at its end (the full time under a held message's actions).
 * A row's press spreads the ink from the finger inside its band; [onChoose] gets the row's index. A row not
 * enabled keeps its place, faded to the web's 0.55, and takes no tap.
 */
@Composable
internal fun PaperMenuSheet(
    rows: List<SheetRow>,
    seed: Double,
    inks: SheetInks,
    footer: String?,
    onChoose: (Int) -> Unit,
    modifier: Modifier = Modifier,
    minWidth: Dp = MenuSheet.MinWidth,
) {
    var pressed by remember { mutableStateOf<Int?>(null) }
    val spread = remember { InkSpread() }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val rowPx = with(density) { MenuSheet.Row.toPx() }
    val topPx = with(density) { MenuSheet.PadTop.toPx() }
    val rests = remember(rows, inks) { rows.map { inks.rest(it.tone) } }
    val presses = remember(rows, inks) { rows.map { inks.pressOf(it.tone) } }
    Column(
        modifier
            .widthIn(min = minWidth, max = MenuSheet.MaxWidth)
            .width(IntrinsicSize.Max)
            // The sheet in a layer of its own (not clipped to its box: the wobble, its washes and its pen run past it),
            // so a row's spreading ink redraws the sheet alone.
            .graphicsLayer()
            .drawWithCacheOf(SheetPaperDrawing(seed, inks.paper, inks.pen, footer != null, rests, presses) { pressed to spread })
            .padding(top = MenuSheet.PadTop, bottom = if (footer != null) MenuSheet.FooterBottom else MenuSheet.PadBottom),
    ) {
        rows.forEachIndexed { i, row ->
            val source = remember { MutableInteractionSource() }
            val down by source.collectIsPressedAsState()
            LaunchedEffect(source) {
                source.interactions.collect {
                    when (it) {
                        is PressInteraction.Press -> {
                            pressed = i
                            // The row's touch point, in the sheet's space (rows run its whole width).
                            spread.press(scope, Offset(it.pressPosition.x, topPx + i * rowPx + it.pressPosition.y))
                        }
                        is PressInteraction.Release, is PressInteraction.Cancel -> spread.release(scope)
                    }
                }
            }
            // A pressed row's words take the pressed pen with its glyph (the web's `.option[data-active]`); a loss keeps its danger ink.
            val (glyph, words) = inks.rowInks(row, down, Tokens.Text)
            Row(
                Modifier
                    .fillMaxWidth()
                    .height(MenuSheet.Row)
                    .clickable(source, indication = null, enabled = row.enabled, role = Role.Button) { onChoose(i) }
                    // A row that can't be chosen now keeps its place, faded (the web's `.option:disabled`).
                    .fade(if (row.enabled) 1f else SheetRowDisabledAlpha)
                    .padding(horizontal = MenuSheet.PadX),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                OrganicIcon(row.icon, size = MenuSheet.Glyph, color = glyph, strokeWidth = Tokens.Ink.value)
                Spacer(Modifier.width(MenuSheet.GlyphGap))
                BasicText(row.title, maxLines = 1, style = AppFonts.body(MenuSheet.TEXT, lineHeight = 1.3f, color = words))
            }
        }
        if (footer != null) {
            // Information, not a further action: at the end of the line, directly under the last row (round 17 §2.3).
            Box(Modifier.fillMaxWidth().height(MenuSheet.Footer).padding(horizontal = MenuSheet.PadX), contentAlignment = Alignment.CenterEnd) {
                BasicText(footer, maxLines = 1, style = AppFonts.body(MenuSheet.FOOTER_TEXT, lineHeight = 1.3f, color = Tokens.TextMuted))
            }
        }
    }
}

/** A row that can't be chosen now (OrganicMenu.module.css's `.option:disabled`). */
private const val SheetRowDisabledAlpha = 0.55f
