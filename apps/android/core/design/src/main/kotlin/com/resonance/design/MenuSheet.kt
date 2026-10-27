package com.resonance.design

import android.graphics.BlurMaskFilter
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
import androidx.compose.ui.graphics.addOutline
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.drawscope.DrawScope
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.IconName
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.ResonanceColors
import com.resonance.design.generated.Tokens
import com.resonance.geometry.rowBoundary
import com.resonance.geometry.rowRegion
import kotlin.math.max

// Round 17 §1: every menu is the press menu's sheet — the menus' paper and the sheet grain, no pen line round it
// and no rules between its rows, a soft shadow following its wobble instead of the outline, and a row's ink
// spreading from the finger inside that row's own band of the wobble.

/**
 * A menu sheet's measures (round 17 §1, §2.3): rows 44 tall, the glyph 17, 12 to the words, 20 of air at the
 * row's start and end — the sheet as wide as its longest row with them, [MaxWidth] at most — 6 above the first
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
    /** The wobble's corners (the press menu's sheet since round 16). */
    const val RADIUS = 22.0
    /** The sheet's grain: PaperSheet's (the thought map's cluster recipe), over the whole filled wobble. */
    const val GRAIN = 0.3f
    /** The words' size. */
    const val TEXT = 15f
    /** The foot's words' size. */
    const val FOOTER_TEXT = 12f

    /** How tall a sheet of [rows] rows is, with its quiet foot or without. */
    fun height(rows: Int, footer: Boolean): Dp =
        PadTop + Row * rows + if (footer) Footer + FooterBottom else PadBottom
}

/**
 * The soft shadow a floating sheet casts (round 17 §1, the web's `--sheet-shadow`): by day two, `0 8px 24px
 * oklch(30% 0.04 50 / 0.16)` and `0 1px 3px oklch(30% 0.04 50 / 0.10)`; at night one, `0 10px 28px oklch(0% 0 0 /
 * 0.45)`. Each [blur] is the CSS blur radius (a Gaussian of half its deviation).
 */
@Immutable
data class SheetShadow(val dy: Dp, val blur: Dp, val color: Color) {
    companion object {
        private val dayFar = SheetShadow(8.dp, 24.dp, OklchColor.of(0.30, 0.04, 50.0, 0.16))
        private val dayNear = SheetShadow(1.dp, 3.dp, OklchColor.of(0.30, 0.04, 50.0, 0.10))
        private val night = SheetShadow(10.dp, 28.dp, OklchColor.of(0.0, 0.0, 0.0, 0.45))

        fun of(palette: ResonanceColors): List<SheetShadow> = if (palette.dark) listOf(night) else listOf(dayFar, dayNear)

        /**
         * How far past its frame a sheet's shadow reaches (the room a popup window keeps round the sheet, so
         * nothing of it is cut straight): two of the deepest shadow's deviations past its offset — the rest is
         * under 3 % of its ink.
         */
        val Room: Dp = 40.dp

        /** Skia's blur radius for a CSS [blur] at [density] (its deviation is half the CSS radius; Skia's is 0.57735 × r + 0.5). */
        internal fun skiaRadius(blur: Dp, density: Float): Float = max(0.1f, (blur.value * density / 2f - 0.5f) / 0.57735f)
    }
}

/** The paints that draw [shadows] blurred (a blur mask: the canvas is hardware drawn, API 28+). */
internal fun shadowPaints(shadows: List<SheetShadow>, density: Float): List<Pair<Float, android.graphics.Paint>> = shadows.map { s ->
    s.dy.value * density to android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        color = s.color.toArgb()
        maskFilter = BlurMaskFilter(SheetShadow.skiaRadius(s.blur, density), BlurMaskFilter.Blur.NORMAL)
    }
}

/** [outline] filled with each shadow's paint, offset down by its dy and blurred: the shadow follows the wobble. */
internal fun DrawScope.drawSheetShadows(outline: Path, paints: List<Pair<Float, android.graphics.Paint>>) {
    val native = outline.asAndroidPath()
    drawIntoCanvas { canvas ->
        paints.forEach { (dy, paint) ->
            canvas.nativeCanvas.save()
            canvas.nativeCanvas.translate(0f, dy)
            canvas.nativeCanvas.drawPath(native, paint)
            canvas.nativeCanvas.restore()
        }
    }
}

/** A sheet's wobble at this size: what it is filled to, its grain covers, its shadow follows and its rows' ink is cut to. */
private fun CacheDrawScope.sheetOutline(seed: Double): Path {
    val o = WobRectShape(MenuSheet.RADIUS, seed).createOutline(size, layoutDirection, this)
    return (o as? Outline.Generic)?.path ?: Path().apply { addOutline(o) }
}

/** The shadow under a sheet ([MenuSheet]), drawn into the layer round the sheet's own, so a row's ink redraws only the sheet. */
private data class SheetShadowDrawing(val seed: Double, val shadows: List<SheetShadow>) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val outline = sheetOutline(seed)
        val paints = shadowPaints(shadows, density)
        onDrawBehind { drawSheetShadows(outline, paints) }
    }
}

/**
 * The sheet itself: its paper and grain on the one wobble, then — inside it — the warning row's wash and the
 * pressed row's ink spreading from the finger, each in its row's band: the wavy boundaries the web's rowRegion
 * draws between rows (never drawn themselves), the first band reaching past the top, the last past the foot.
 */
private class SheetPaperDrawing(
    val seed: Double,
    val paper: Color,
    val grain: GrainInk,
    val rows: Int,
    val footer: Boolean,
    val warning: Int,
    val warningWash: Color,
    val state: () -> Pair<Int?, InkSpread>,
    val inkFor: (Int) -> Color,
) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val outline = sheetOutline(seed)
        val brush = Grain.brush(GrainMode.Tile, "grain-card", size, density, MenuSheet.GRAIN, grain)
        val w = (size.width / density).toDouble()
        val h = (size.height / density).toDouble()
        val pad = max(10.0, h * 0.04)
        val top = MenuSheet.PadTop.value.toDouble()
        val rowH = MenuSheet.Row.value.toDouble()
        val bands = rows + if (footer) 1 else 0
        val boundaries = (0 until bands - 1).map { i -> rowBoundary(top + (i + 1) * rowH, w, seed + i * 31 + 7, 2.0, pad) }
        val regions = (0 until rows).map { rowRegion(it, bands, boundaries, w, h, pad).toPath(density) }
        onDrawBehind {
            drawPath(outline, paper)
            brush?.let { drawPath(outline, it, alpha = MenuSheet.GRAIN) }
            clipPath(outline) {
                if (warning in regions.indices) drawPath(regions[warning], warningWash)
                val (i, spread) = state()
                if (i != null && i in regions.indices) with(spread) { draw(regions[i], inkFor(i)) }
            }
        }
    }

    override fun equals(other: Any?) = other is SheetPaperDrawing && other.seed == seed && other.paper == paper && other.grain == grain &&
        other.rows == rows && other.footer == footer && other.warning == warning && other.warningWash == warningWash
    override fun hashCode() = ((((seed.hashCode() * 31 + paper.hashCode()) * 31 + rows) * 31 + warning) * 31 + footer.hashCode())
}

/** One row of a [PaperMenuSheet]: its words and glyph; [warning]: the menus' loss (a yellow wash under it); [danger]: words and glyph in the danger ink. */
@Immutable
internal class SheetRow(val title: String, val icon: IconName, val enabled: Boolean = true, val warning: Boolean = false, val danger: Boolean = false)

/** A sheet's inks: its paper, the glyphs' pen and their pen pressed, a row's spreading ink, and the warning row's wash at rest and pressed. */
@Immutable
internal data class SheetInks(val paper: Color, val glyph: Color, val glyphPressed: Color, val press: Color, val warning: Color, val warningPressed: Color)

/** The sheet's inks for a menu of the theme's (or a card's hue): [MenuColors] on the raised paper. */
internal fun MenuColors.sheetInks(): SheetInks = SheetInks(sheet, border, borderHover, borderHover.copy(alpha = 0.15f), dangerWash, dangerWashPressed)

/**
 * The one menu surface (round 17 §1): the rows ([SheetRow]) on a [MenuSheet] of borderless paper with its grain
 * and its shadow, and an optional quiet [footer] line at its end (the full time under a held message's actions).
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
) {
    val palette = LocalResonanceColors.current
    val grain = GrainInk.current
    var pressed by remember { mutableStateOf<Int?>(null) }
    val spread = remember { InkSpread() }
    val scope = rememberCoroutineScope()
    val density = LocalDensity.current
    val rowPx = with(density) { MenuSheet.Row.toPx() }
    val topPx = with(density) { MenuSheet.PadTop.toPx() }
    val warning = rows.indexOfFirst { it.warning }
    val shadows = remember(palette) { SheetShadow.of(palette) }
    Column(
        modifier
            .widthIn(max = MenuSheet.MaxWidth)
            .width(IntrinsicSize.Max)
            .drawWithCacheOf(SheetShadowDrawing(seed, shadows))
            // The sheet in a layer of its own: a row's spreading ink redraws it, never the blurred shadow under it.
            .graphicsLayer()
            .drawWithCacheOf(
                SheetPaperDrawing(seed, inks.paper, grain, rows.size, footer != null, warning, inks.warning, { pressed to spread }) { i ->
                    if (i == warning) inks.warningPressed else inks.press
                },
            )
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
            val glyph = when {
                row.danger -> Tokens.Danger
                down -> inks.glyphPressed
                else -> inks.glyph
            }
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
                BasicText(row.title, maxLines = 1, style = AppFonts.body(MenuSheet.TEXT, lineHeight = 1.3f, color = if (row.danger) Tokens.Danger else Tokens.Text))
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
