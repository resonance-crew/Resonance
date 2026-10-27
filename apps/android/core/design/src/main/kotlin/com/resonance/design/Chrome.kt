package com.resonance.design

import androidx.compose.foundation.interaction.HoverInteraction
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.platform.LocalContext
import androidx.compose.animation.core.snap
import androidx.compose.ui.unit.Constraints
import com.resonance.geometry.wobRect
import kotlin.math.min
import androidx.compose.foundation.layout.widthIn
import androidx.compose.runtime.Immutable
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.isTraversalGroup
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.foundation.hoverable
import androidx.compose.foundation.interaction.collectIsHoveredAsState
import androidx.compose.foundation.selection.selectableGroup
import androidx.compose.ui.input.pointer.PointerIcon
import androidx.compose.ui.input.pointer.pointerHoverIcon
import kotlin.math.max
import kotlin.math.roundToInt
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.statusBars
import androidx.compose.runtime.remember
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.draw.scale
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.EaseOut
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.CacheDrawScope
import androidx.compose.ui.draw.DrawResult
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.PathMeasure
import androidx.compose.ui.graphics.asAndroidPath
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.wavyPoints

// Navigation chrome in the hand-drawn language. The skeleton stays the
// platform's (Navigation 3 back stacks, predictive back); only the look is
// the brand's. Verified in spike S3.

/**
 * A tab: its [icon] (the outline glyph) and, chosen, its solid twin [selectedIcon] (round 16 §2:
 * `sparkle-fill`, `chat-fill`, `bell-fill`, `cards-fill`; none keeps the outline in the accent).
 */
data class OrganicTabItem<T>(
    val id: T,
    val title: String,
    val icon: IconName,
    val isAction: Boolean = false,
    val badge: Int = 0,
    val selectedIcon: IconName? = null,
)

/** The tab bar's height above the navigation bar, without its wavy edge (round 16 §2: 60 → 52, icons only). */
val TabBarHeight = 52.dp

/** A tab's glyph in the bar (round 16 §2). */
val TabIconSize = 26.dp

/**
 * The bar's one pen (round 17 §7): every outline glyph in it — the tabs' and the middle pencil's — at
 * INK_STRONG (2.2 in the glyph's 24 box), a step heavier than the bare glyphs' INK elsewhere, so they hold
 * their own at 26 on the bar's paper. The solid twins are filled and take no pen.
 */
val TabGlyphPen: Float = Tokens.InkStrong.value

/**
 * The tab bar, docked like the header and edged the same way: cream paper that begins on a wavy pen
 * line, so the top and bottom chrome are one pair and nothing floats or draws a frame. Round 16 §2:
 * the tabs are their glyphs alone (each named for TalkBack and a pointer's tooltip by its title); the
 * chosen one draws its solid twin in the accent — no wash behind it — and the others their outline in
 * the muted ink; a change cross-fades in 120 ms as the new one springs from 0.9. The pen sits among
 * them as a solid terracotta squircle (48 × 36) — the one filled shape in the bar, without a rim.
 */
@Composable
fun <T> OrganicTabBar(items: List<OrganicTabItem<T>>, selection: T, onSelect: (T) -> Unit, modifier: Modifier = Modifier) {
    val haptic = LocalHapticFeedback.current
    Row(
        modifier
            .fillMaxWidth()
            .blocksTouches()
            .footerEdge()
            .padding(top = HeaderEdgeHeight)
            .navigationBarsPadding()
            .height(TabBarHeight)
            .padding(horizontal = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { index, item ->
            val selected = item.id == selection
            val select = {
                haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                onSelect(item.id)
            }
            val source = remember { MutableInteractionSource() }
            val pressed by source.collectIsPressedAsState()
            if (item.isAction) {
                Box(
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .hoverable(source)
                        .clickable(source, indication = null, role = Role.Button, onClickLabel = item.title, onClick = select)
                        .semantics { contentDescription = item.title },
                    contentAlignment = Alignment.Center,
                ) { PenChip(pressed, item.icon, PenChipBarSize) }
            } else {
                TabFace(
                    item, selected, pressed,
                    Modifier
                        .weight(1f)
                        .fillMaxHeight()
                        .hoverable(source)
                        .clickable(source, indication = null, role = Role.Tab, onClickLabel = item.title, onClick = select)
                        .semantics {
                            this.selected = selected
                            contentDescription = item.title
                        },
                )
            }
        }
    }
}

/**
 * A tab as the bar draws it (round 16 §2): its glyph alone at 26 — chosen, its solid twin in the
 * accent; else the outline in the muted ink — crossing over in 120 ms as the chosen one springs up
 * from 0.9 (at once with animations off); a press settles it to 0.94. Its unread count hangs off the
 * glyph's corner on a ring of the bar's paper, so it parts from a solid glyph.
 */
@Composable
private fun <T> TabFace(item: OrganicTabItem<T>, selected: Boolean, pressed: Boolean, modifier: Modifier) {
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    val solid by animateFloatAsState(if (selected) 1f else 0f, if (still) snap() else tween(TAB_SWAP_MILLIS), label = "tabSolid")
    val pop = remember { androidx.compose.animation.core.Animatable(1f) }
    LaunchedEffect(selected) {
        if (selected && !still) {
            pop.snapTo(0.9f)
            pop.animateTo(1f, androidx.compose.animation.core.spring(dampingRatio = 0.5f, stiffness = 600f))
        }
    }
    val press by animateFloatAsState(if (pressed) 0.94f else 1f, tween(90), label = "tabPress")
    val accent = Tokens.Terracotta
    val muted = Tokens.TextMuted
    Box(modifier.tabTooltip(item.title), contentAlignment = Alignment.Center) {
        Box(Modifier.graphicsLayer { val k = pop.value * press; scaleX = k; scaleY = k }) {
            // The outline fades out under the solid twin as it fades in: one glyph to the eye.
            if (solid < 1f) OrganicIcon(item.icon, Modifier.graphicsLayer { alpha = 1f - solid }, size = TabIconSize, color = if (selected) accent else muted, strokeWidth = TabGlyphPen)
            if (solid > 0f) OrganicIcon(item.selectedIcon ?: item.icon, Modifier.graphicsLayer { alpha = solid }, size = TabIconSize, color = accent, strokeWidth = TabGlyphPen)
            if (item.badge > 0) CountBadge(item.badge, Modifier.align(Alignment.TopEnd).offset(x = 10.dp, y = (-8).dp), ring = Tokens.Cream)
        }
    }
}

/** A tab's glyph trades for its twin this fast (round 16 §2). */
private const val TAB_SWAP_MILLIS = 120

/**
 * A pointer resting on a tab (a mouse, a stylus hovering) names it, after a moment, in a small ink
 * pill above it — the label the bar no longer shows (round 16 §2). A touch never shows it; TalkBack
 * reads the tab's own name.
 */
@Composable
private fun Modifier.tabTooltip(title: String): Modifier {
    val source = remember { MutableInteractionSource() }
    val hovered by source.collectIsHoveredAsState()
    var shown by remember { mutableStateOf(false) }
    LaunchedEffect(hovered) {
        if (!hovered) {
            shown = false
            return@LaunchedEffect
        }
        kotlinx.coroutines.delay(TOOLTIP_DELAY_MILLIS)
        shown = true
    }
    if (shown) {
        val lift = with(LocalDensity.current) { 8.dp.roundToPx() }
        androidx.compose.ui.window.Popup(
            popupPositionProvider = remember(lift) { TooltipAbove(lift) },
            properties = androidx.compose.ui.window.PopupProperties(focusable = false),
        ) {
            CappedTextScale { OrganicPill(title, size = PillSize.Small, hiddenFromAccessibility = true) }
        }
    }
    return this.hoverable(source)
}

private const val TOOLTIP_DELAY_MILLIS = 500L

/** A tooltip's place: centred over its anchor, [lift] above it, kept inside the window. */
private class TooltipAbove(private val lift: Int) : androidx.compose.ui.window.PopupPositionProvider {
    override fun calculatePosition(
        anchorBounds: androidx.compose.ui.unit.IntRect,
        windowSize: androidx.compose.ui.unit.IntSize,
        layoutDirection: androidx.compose.ui.unit.LayoutDirection,
        popupContentSize: androidx.compose.ui.unit.IntSize,
    ): IntOffset {
        val x = (anchorBounds.center.x - popupContentSize.width / 2).coerceIn(0, (windowSize.width - popupContentSize.width).coerceAtLeast(0))
        val y = (anchorBounds.top - lift - popupContentSize.height).coerceAtLeast(0)
        return IntOffset(x, y)
    }
}

/**
 * The header's tabs left to right (design note B2, part C): the bar's items without the pen —
 * Feed · Messages · Notifications · Card Box — each with its place in the bar.
 */
fun <T> topTabsOrder(items: List<OrganicTabItem<T>>): List<IndexedValue<OrganicTabItem<T>>> =
    items.withIndex().filter { !it.value.isAction }

/**
 * The tab group's measures on a medium or expanded window (round 5, part C), apart from Compose so
 * they can be tested. The group is one segmented control, its segments side by side with a seam
 * between them: a segment with its label is 14 + the 20 glyph + 6 + the label + 14 wide, a glyph
 * alone 52; the group is [HEIGHT] tall in the header's [TopBarRow].
 */
object TopTabsFit {
    const val ICON_ITEM = 52f
    const val HEIGHT = 44f

    /** A segment showing its label, [textWidth] wide at 14/600 (the selected weight, so choosing one moves nothing). */
    fun labelledItem(textWidth: Float): Float = 14f + 20f + 6f + textWidth + 14f

    /** The group's width round segments this wide: they abut, the seams drawn on their edges. */
    fun groupWidth(items: List<Float>): Float = items.sum()

    /** Labels show on an expanded window when the labelled group leaves 152 beside it each side past the pad. */
    fun labels(cls: LayoutClass, labelledGroup: Float, width: Float, pad: Float): Boolean =
        cls.tabLabels && labelledGroup <= width - 2 * (pad + 152f)

    /** The widest a root bar's leading part (the brand, a tab's title) may be: 16 short of the group. */
    fun leadingMax(width: Float, group: Float, pad: Float): Float = (width - group) / 2f - pad - 16f
}

/**
 * Where a header tab's unread chip hangs (design note B2): off the glyph's top-end corner, its
 * top-end corner (+8, −7) past the glyph's — as on the glyph alone. Beside a label that corner
 * would sit 2 into the words (the gap is 6), so the glyph and its chip step toward the start, out
 * of the segment's 14 of padding, until the chip ends [CLEARANCE] before the label: the label, the
 * segment and the group keep their places and widths whether a count shows or not.
 */
object TopTabBadge {
    /** The chip's top-end corner past the glyph's. */
    const val OFFSET_X = 8f
    const val OFFSET_Y = -7f
    /** Between the glyph and its label. */
    const val LABEL_GAP = 6f
    /** Between the chip's frame and the label: 2 clear, and 1 for the chip's wobbly edge. */
    const val CLEARANCE = 3f

    /** How far the glyph (with its chip) steps toward the start: 5 beside a label with a count, else 0. */
    fun glyphShift(labelled: Boolean, badge: Int): Float =
        if (labelled && badge > 0) max(0f, OFFSET_X + CLEARANCE - LABEL_GAP) else 0f
}

/**
 * The header on a medium or expanded window (design note B2, round 5 part C). On a tab's root
 * ([tabs]) [MainTabs] draws the tab group over the middle of the page's bar and the pen at its end,
 * so the bar's leading part keeps to [leadingMax] and its actions end [trailingPad] in from the
 * window's edge. A pushed page has neither ([tabs] false): its bar is the back arrow, the page's
 * context in the middle and its actions at the end. Null on a phone, in the writer and in a pane.
 */
@Immutable
data class HeaderChrome(val width: Dp, val groupWidth: Dp, val pad: Dp, val labels: Boolean, val tabs: Boolean = true) {
    val leadingMax: Dp get() = TopTabsFit.leadingMax(width.value, groupWidth.value, edge.value).dp
    /** Where a tab root's lockup starts and its pen ends (round 15: [tabletBarEdge]). */
    val edge: Dp get() = tabletBarEdge(pad)
    /** The pen (56) and 8 before it on a tab's root; the pad alone on a pushed page (no pen there). */
    val trailingPad: Dp get() = if (tabs) edge + PenChipWidth + 8.dp else pad
}

/** The header's chrome where the window has tabs in it; null on a phone, in the writer and in a pane. */
val LocalHeaderChrome = staticCompositionLocalOf<HeaderChrome?> { null }

/** A bar's row under the status bar on a medium or expanded window (brand and inline alike), without its wavy edge. */
val TopBarRow = 72.dp

/** The bar of a pane beside a list (a thread beside the conversations): a smaller row under the header. */
val PaneBarRow = 56.dp

/** How tall the root bars' row is here: [TopBarRow] beside the header's tabs, a phone's [BrandBarHeight] else. */
@Composable
fun brandBarHeight(): Dp = if (LocalHeaderChrome.current != null) TopBarRow else BrandBarHeight

/** The pen chip's width. */
private val PenChipWidth = 56.dp

/** The labels' face in the header's tabs: body 14, 600 chosen / 500 not. */
@Composable @ReadOnlyComposable
private fun topTabStyle(selected: Boolean) =
    AppFonts.body(14f, if (selected) 600 else 500, lineHeight = 1.2f, color = if (selected) Tokens.ButtonOnTonal else Tokens.TextMuted)

/** Each tab's width in the header's group, labelled ([TopTabsFit.labelledItem], measured at 600) or glyph alone. */
@Composable
fun topTabWidths(titles: List<String>, labels: Boolean): List<Dp> {
    if (!labels) return titles.map { TopTabsFit.ICON_ITEM.dp }
    val measurer = rememberTextMeasurer()
    val density = LocalDensity.current
    return titles.map { title ->
        val px = measurer.measure(title, topTabStyle(true), maxLines = 1, softWrap = false).size.width
        TopTabsFit.labelledItem(with(density) { px.toDp() }.value).dp
    }
}

/**
 * The tab group in the middle of a tab root's header on a medium or expanded window (round 5,
 * part C): drawn as the borderless segmented buttons are (SegmentedActionBar) — one hand-drawn
 * shape with no pen line, the segments parted by wavy seams cut in the paper's cream, the buttons'
 * grain over all of it. Nothing is drawn inside a segment for the choice: the chosen segment's own
 * fill changes, cream-dark to the tonal face (`--button-tonal`), its glyph and label from muted to
 * `--button-on-tonal`, the label semibold. A pointer lays the tonal face at 0.45; a press spreads
 * its ink from the finger, as on the segmented buttons. Re-choosing the tab shown is the caller's
 * to read (pop to its root, or scroll it to the top), as on the bar.
 */
@Composable
fun <T> TopTabs(
    items: List<IndexedValue<OrganicTabItem<T>>>,
    selection: T,
    onSelect: (T) -> Unit,
    widths: List<Dp>,
    labels: Boolean,
    label: String,
    modifier: Modifier = Modifier,
) {
    val haptic = LocalHapticFeedback.current
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val ink = remember { InkSpread() }
    var pressed by remember { mutableStateOf<Int?>(null) }
    val lefts = widths.runningFold(0f) { x, w -> x + w.value }.dropLast(1)
    val leftsNow by rememberUpdatedState(lefts)
    val hovers = remember(items.size) { List(items.size) { mutableStateOf(false) } }
    // How chosen each segment is (0…1, read while drawing): its fill eases between the two faces.
    val chosen = items.map { (_, item) ->
        animateFloatAsState(if (item.id == selection) 1f else 0f, tween(160), label = "topTabFill")
    }
    val well = Tokens.CreamDark
    val face = Tokens.ButtonTonal
    val wash = OrganicIndication.Wash
    val seam = Tokens.Cream
    val grainInk = GrainInk.current
    Row(
        modifier
            .height(TopTabsFit.HEIGHT.dp)
            .drawWithCache {
                val d = this.density
                val w = size.width / d
                val h = size.height / d
                val outer = wobRect(w.toDouble(), h.toDouble(), 16.0, TOP_TABS_SEED, min(w, h) * 0.05, WobRectOptions(
                    segmentsH = SegValue.Range(7, 9), segmentsV = SegValue.Range(2, 3), curve = 1.2, cornerJitter = 1.2, cornerOffset = h * 0.04,
                )).toPath(d)
                val pad = max(12.0, h * 0.3)
                val boundaries = lefts.drop(1).mapIndexed { i, x -> boundaryPoints(x.toDouble(), h.toDouble(), TOP_TABS_SEED + i * 37 + 11, 1.6, pad) }
                val regions = items.indices.map { i ->
                    Path().apply { op(SegmentedLayout.regionPath(i, items.size, boundaries, w, h, pad.toFloat(), d), outer, PathOperation.Intersect) }
                }
                val seams = boundaries.map { polylinePath(it, d) }
                val grain = Grain.brush(GrainMode.Tile, "grain-button", size, d, 0.38f, grainInk)
                val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round)
                onDrawBehind {
                    drawPath(outer, well)
                    regions.forEachIndexed { i, region ->
                        val fill = max(chosen[i].value, if (hovers[i].value) TOP_HOVER_FILL else 0f)
                        if (fill > 0f) drawPath(region, face, alpha = fill)
                    }
                    pressed?.let { i -> with(ink) { draw(regions[i], wash) } }
                    clipPath(outer) { seams.forEach { drawPath(it, seam, style = pen) } }
                    grain?.let { drawPath(outer, it, alpha = 0.38f) }
                }
            }
            .selectableGroup()
            .semantics { isTraversalGroup = true; contentDescription = label },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        items.forEachIndexed { i, (_, item) ->
            val selected = item.id == selection
            val source = remember { MutableInteractionSource() }
            LaunchedEffect(source) {
                source.interactions.collect {
                    when (it) {
                        is PressInteraction.Press -> {
                            pressed = i
                            ink.press(scope, Offset(it.pressPosition.x + with(density) { leftsNow[i].dp.toPx() }, it.pressPosition.y))
                        }
                        is PressInteraction.Release, is PressInteraction.Cancel -> ink.release(scope)
                        is HoverInteraction.Enter -> hovers[i].value = true
                        is HoverInteraction.Exit -> hovers[i].value = false
                    }
                }
            }
            val face = if (selected) Tokens.ButtonOnTonal else Tokens.TextMuted
            Box(
                Modifier
                    .width(widths.getOrElse(i) { TopTabsFit.ICON_ITEM.dp })
                    .fillMaxHeight()
                    .hoverable(source)
                    .pointerHoverIcon(PointerIcon.Hand)
                    .clickable(source, indication = null, role = Role.Tab, onClickLabel = item.title) {
                        haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                        onSelect(item.id)
                    }
                    .semantics {
                        this.selected = selected
                        if (!labels) contentDescription = item.title
                    },
                contentAlignment = Alignment.Center,
            ) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    // Beside words, the glyph and its chip step into the leading padding so the chip
                    // ends clear of the label; nothing else moves (an offset takes no room).
                    Box(Modifier.offset(x = -TopTabBadge.glyphShift(labels, item.badge).dp)) {
                        // The chosen segment wears its glyph's solid twin, in the segment's ink (round 16 §2).
                        OrganicIcon(if (selected) item.selectedIcon ?: item.icon else item.icon, size = if (labels) 20.dp else 22.dp, color = face)
                        if (item.badge > 0) {
                            CountBadge(item.badge, Modifier.align(Alignment.TopEnd).offset(x = TopTabBadge.OFFSET_X.dp, y = TopTabBadge.OFFSET_Y.dp))
                        }
                    }
                    if (labels) {
                        Spacer(Modifier.width(TopTabBadge.LABEL_GAP.dp))
                        BasicText(item.title, maxLines = 1, softWrap = false, style = topTabStyle(selected), modifier = Modifier.clearAndSetSemantics { })
                    }
                }
            }
        }
    }
}

/** The group's shape (part B's track seed); its seams take theirs from it. */
private const val TOP_TABS_SEED = 233.0

/** A pointer over a header tab: the tonal face at 0.45. */
private const val TOP_HOVER_FILL = 0.45f

/** The pen at the header's end (design note B2): the bar's pen chip, opening the writer. */
@Composable
fun TopPen(label: String, icon: IconName, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val haptic = LocalHapticFeedback.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    Box(
        modifier
            .size(PenChipWidth, 40.dp)
            .hoverable(source)
            .pointerHoverIcon(PointerIcon.Hand)
            .clickable(source, indication = null, role = Role.Button, onClickLabel = label) {
                haptic.performHapticFeedback(HapticFeedbackType.SegmentTick)
                onClick()
            }
            .semantics { contentDescription = label },
        contentAlignment = Alignment.Center,
    ) { PenChip(pressed, icon) }
}

/** The pen chip in the 52 bar (round 16 §2); the header's keeps its 56 × 40. */
private val PenChipBarSize = androidx.compose.ui.unit.DpSize(48.dp, 36.dp)
private val PenChipHeaderSize = androidx.compose.ui.unit.DpSize(56.dp, 40.dp)

/** The pen in the tab bar: a solid terracotta squircle as tall as a tab, the nib in cream; it darkens while pressed. */
@Composable
private fun PenChip(pressed: Boolean, icon: IconName, chip: androidx.compose.ui.unit.DpSize = PenChipHeaderSize) {
    val face = Tokens.ButtonFill
    val press = OrganicIndication.OnFill
    val grainInk = GrainInk.current
    Box(
        Modifier
            .size(chip)
            .scale(if (pressed) 0.96f else 1f)
            .drawWithCache {
                val o = WobRectShape(17.0, 3.0, mag = 1.1, options = WobRectOptions(
                    curve = 1.3, cornerJitter = 3.0, cornerOffset = 2.4, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0),
                )).createOutline(size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, "grain-button", size, density, 0.38f, grainInk)
                onDrawBehind {
                    // The verb's face (--button-fill): the pen chip is the write button.
                    drawOutline(o, face)
                    grain?.let { drawOutline(o, it, alpha = 0.38f) }
                    if (pressed) drawOutline(o, press)
                }
            },
        contentAlignment = Alignment.Center,
    ) { OrganicIcon(icon, size = if (chip.height < 40.dp) 20.dp else 22.dp, color = Tokens.Cream, strokeWidth = TabGlyphPen) }
}

/**
 * NotificationBell's unread count: a wobbly terracotta chip (19×18, 26 wide
 * past 9) in the avatar's lopsided language, the number in cream 10/700.
 */
@Composable
fun CountBadge(count: Int, modifier: Modifier = Modifier, ring: Color? = null) {
    val w = if (count > 9) 26.dp else 19.dp
    val chip = Tokens.Terracotta
    Box(
        modifier
            .size(w, 18.dp)
            .clearAndSetSemantics { }
            .drawWithCache {
                val options = WobRectOptions(curve = 1.5, cornerJitter = 3.0, cornerOffset = 18 * 0.06, segmentsH = SegValue.Count(1.0), segmentsV = SegValue.Count(1.0))
                val o = WobRectShape(18 * 0.4, 9.0, mag = 1.3, options = options).createOutline(size, layoutDirection, this)
                // Round 16 §2: a second, larger wob of the bar's paper behind the chip — a 2 pt ring parting it from a solid glyph.
                val grow = BadgeRing.toPx()
                val halo = ring?.let {
                    WobRectShape(18 * 0.4 + BadgeRing.value, 9.0, mag = 1.3, options = options)
                        .createOutline(androidx.compose.ui.geometry.Size(size.width + 2 * grow, size.height + 2 * grow), layoutDirection, this)
                }
                onDrawBehind {
                    if (halo != null && ring != null) withTransform({ translate(-grow, -grow) }) { drawOutline(halo, ring) }
                    drawOutline(o, chip)
                }
            },
        contentAlignment = Alignment.Center,
    ) { BasicText("$count", style = AppFonts.body(10f, 700, lineHeight = 1f, color = Tokens.Cream)) }
}

/** The paper ring round a tab's unread chip (round 16 §2). */
private val BadgeRing = 2.dp

/** CSS `ease`, the header's opacity transition. */
private val Ease = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/** The header's pen line: half ink at rest, full once the page has scrolled past 20 (AppHeader's `scrolled`). */
@Composable
private fun edgeInk(scrolled: Boolean): () -> Float {
    val alpha by animateFloatAsState(if (scrolled) 1f else 0.5f, tween(300, easing = Ease), label = "edge")
    return { alpha }
}

/** The root bar's height under the status bar, without its wavy edge. */
val BrandBarHeight = 58.dp

/** The wordmark. */
private const val BRAND = "Resonance"

/** A screen's title in a phone's bar (a tab's in the brand's place, a pushed page's beside the arrow): Playfair 20/700. */
@Composable @ReadOnlyComposable
private fun phoneBarTitle() = AppFonts.heading(PHONE_BAR_TITLE, 700, lineHeight = 1.2f).copy(letterSpacing = (-0.02).em)

private const val PHONE_BAR_TITLE = 20f

/**
 * How far a tab's title in the brand's place drops below where its line box sets it. CJK ideographs
 * fill the em box evenly, so a CJK title centred by the heading face's line metrics reads higher
 * beside the mark than the wordmark, whose weight sits low at its x-height (measured on both apps:
 * 私訊's ink 1.6dp higher against the wave than "Resonance"'s). 0.08em brings it level; a Latin title
 * stays. Beside a pushed page's arrow there is no wordmark to match: the title is centred on the
 * arrow as its line box sets it (寫一張新卡片's ink 0.5dp from the arrow's middle; dropped, 2.1dp
 * under it). iOS's barTitleDrop.
 */
internal fun barTitleDrop(title: String): Dp =
    if (title.any { Character.isIdeographic(it.code) }) (PHONE_BAR_TITLE * 0.08f).dp else 0.dp

/**
 * The root screens' pinned header (AppHeader on a phone): the brand lockup —
 * ResonanceIcon (the wave glyph, 38, terracotta, INK) and "Resonance" in
 * Playfair 22/700 — on an opaque cream bar that ends on the wavy pen line;
 * content scrolls under it. Lay it over the list.
 *
 * On a phone a tab other than the feed hangs its own title where the brand would be
 * (`brand` = the title, `isHeading`), a step smaller (20: its CJK reads larger than the
 * wordmark), and its actions at the end; beside a tablet header's tabs the brand stays.
 */
@Composable
fun OrganicBrandBar(
    scrolled: Boolean,
    modifier: Modifier = Modifier,
    brand: String = BRAND,
    /** `brand` is the screen's title: announced as its heading (the wordmark is no heading). A phone's only: a tablet's header shows the brand. */
    isHeading: Boolean = false,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val chrome = LocalHeaderChrome.current
    val style = AppFonts.heading(22f, 700, lineHeight = 1.2f).copy(letterSpacing = (-0.02).em)
    val titleStyle = if (isHeading) phoneBarTitle() else style
    Row(
        modifier
            .fillMaxWidth()
            .blocksTouches()
            .headerEdge(edgeInk(scrolled), pen = LocalBarPen.current, lead = LocalBarLineLead.current)
            .statusBarsPadding()
            .padding(bottom = HeaderEdgeHeight)
            .height(if (chrome != null) TopBarRow else BrandBarHeight)
            .padding(start = chrome?.edge ?: 20.dp, end = chrome?.trailingPad ?: 20.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (chrome == null) {
            // The mark is nudged down 7% so it sits level with the wordmark's mass.
            OrganicIcon(IconName.Wave, Modifier.offset(y = (38 * 0.07).dp), size = 38.dp, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value)
            BasicText(
                brand, maxLines = 1, overflow = TextOverflow.Ellipsis, style = titleStyle,
                modifier = Modifier.weight(1f).offset(y = if (isHeading) barTitleDrop(brand) else 0.dp)
                    .then(if (isHeading) Modifier.semantics { heading() } else Modifier),
            )
        } else {
            // Beside the header's tabs (design note B2): the leading part keeps clear of them. It is
            // always the brand (round 5 D5) — the tab group already says which tab this is, so a
            // tab's title stays a phone's. The wordmark that doesn't fit leaves the mark alone, named for TalkBack.
            val measurer = rememberTextMeasurer()
            val density = LocalDensity.current
            val wordmark = with(density) { measurer.measure(BRAND, style, maxLines = 1, softWrap = false).size.width.toDp() }
            val markAlone = 38.dp + 10.dp + wordmark > chrome.leadingMax
            Row(Modifier.widthIn(max = chrome.leadingMax), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                OrganicIcon(
                    IconName.Wave, Modifier.offset(y = (38 * 0.07).dp).then(if (markAlone) Modifier.semantics { contentDescription = BRAND } else Modifier),
                    size = 38.dp, color = Tokens.Terracotta, strokeWidth = Tokens.Ink.value,
                )
                if (!markAlone) BasicText(BRAND, maxLines = 1, overflow = TextOverflow.Ellipsis, style = style, modifier = Modifier.weight(1f, fill = false))
            }
            Spacer(Modifier.weight(1f))
        }
        trailing()
    }
}

/** A root screen's title in the page (home's h1): Playfair 32/700, line-height 1.1, −0.02em. */
@Composable
fun OrganicPageTitle(title: String, modifier: Modifier = Modifier, trailing: @Composable RowScope.() -> Unit = {}) {
    Row(modifier.fillMaxWidth(), verticalAlignment = Alignment.CenterVertically) {
        BasicText(
            title,
            style = AppFonts.heading(32f, 700, lineHeight = 1.1f).copy(letterSpacing = (-0.02).em),
            modifier = Modifier.weight(1f).semantics { heading() },
        )
        trailing()
    }
}

/**
 * Pushed-screen bar (AppHeader's phone takeover): the bare back arrow and,
 * when given, the screen's title in Playfair 20/700 beside it, level with the arrow; trailing
 * actions at the end. Edged by the header's wavy line.
 *
 * On a medium or expanded window (round 5, part C) a pushed page's bar is the whole header — no
 * tabs, no pen over it: the arrow leads, the page's context ([title], else [centre]) stands in the
 * middle of the window (one line, truncated, kept clear of both ends), its actions end on the pad.
 * A [title] not [titleShown] yet (the card's title still on the page) is faded out and silent.
 */
@Composable
fun OrganicInlineBar(
    backLabel: String,
    onBack: () -> Unit,
    title: String? = null,
    scrolled: Boolean = false,
    modifier: Modifier = Modifier,
    /** Without the arrow, `leading` starts the bar (a thread's search field takes the arrow's place). */
    showBack: Boolean = true,
    /** Beside the arrow when there is no title (the card page's author, once the byline has scrolled away). */
    leading: @Composable RowScope.() -> Unit = {},
    /** How far a story has been read (0…1, read while drawing): the card page's progress on the pen line. */
    progress: (() -> Float)? = null,
    /** Whether [title] shows: it fades in (160 ms; at once under reduced motion) when this turns true. */
    titleShown: Boolean = true,
    /** The page's context when it isn't a title (a thread's person): the middle of a tablet's header, beside the arrow on a phone. */
    centre: (@Composable RowScope.() -> Unit)? = null,
    /** [title] is the page's own (a card's, risen from the article): a tablet's header sets it a step larger and bold ([TabletPageTitle]). */
    pageTitle: Boolean = false,
    /**
     * The bar says a save state under its [title] (the writer's, round 8 §2.1, round 11 §5): the
     * title's subtitle — [status], or nothing yet, its line kept so the title never moves, and its
     * live region standing from the start, so TalkBack hears the first word too.
     */
    hasStatus: Boolean = false,
    /** The save state's word ([hasStatus]); null: nothing to say now. */
    status: BarStatus? = null,
    trailing: @Composable RowScope.() -> Unit = {},
) {
    val chrome = LocalHeaderChrome.current
    // Beside the header's tabs the row is the root bars', with no air above it (design note B2).
    val air = if (chrome != null) 0.dp else 4.dp
    val still = LocalContext.current.prefersReducedMotion()
    val titleAlpha by animateFloatAsState(if (titleShown) 1f else 0f, if (still) snap() else tween(TITLE_FADE_MILLIS), label = "barTitle")
    val back: @Composable () -> Unit = {
        if (showBack && !LocalBarBackHidden.current) OrganicIconButton(IconName.ArrowRight, backLabel, mirrored = true, onClick = onBack) else Spacer(Modifier.width(12.dp))
    }
    // A phone's title beside the arrow is 20 bold; a tablet header's context, an inline title's 17
    // semibold (round 5 D5: iPadOS's inline title), one line, truncated.
    val titleStyle = if (chrome != null) {
        if (pageTitle) AppFonts.heading(TabletPageTitle, 700, lineHeight = 1.25f).copy(letterSpacing = (-0.01).em)
        else AppFonts.heading(17f, 600, lineHeight = 1.25f).copy(letterSpacing = (-0.01).em)
    } else phoneBarTitle()
    val titleText: @Composable (Modifier) -> Unit = { m ->
        BasicText(
            title.orEmpty(), maxLines = 1, overflow = TextOverflow.Ellipsis,
            style = titleStyle,
            modifier = m
                .graphicsLayer { alpha = titleAlpha }
                .then(if (titleShown) Modifier.semantics { heading() } else Modifier.clearAndSetSemantics { }),
        )
    }
    val bar = modifier
        .fillMaxWidth()
        .blocksTouches()
        .headerEdge(edgeInk(scrolled), progress, LocalBarPen.current, LocalBarLineLead.current)
        .statusBarsPadding()
    if (chrome == null) {
        Row(
            bar
                // Puts the arrow on the page's 20 margin, as the web's -8 margin + 8 padding does.
                .padding(start = 4.dp, end = 8.dp)
                .padding(top = air, bottom = HeaderEdgeHeight)
                // Its row as tall as ever — unless a title with its save state under it needs more (round 17 §8: a large
                // text size), when the bar grows to hold both lines rather than cutting the second off.
                .heightIn(min = LocalInlineBarHeight.current - air),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            back()
            if (title != null) {
                Spacer(Modifier.width(4.dp))
                // Level with the arrow: no brand-place drop here (barTitleDrop).
                if (hasStatus) TitleWithStatus(titleText, status, centred = false, Modifier.weight(1f)) else titleText(Modifier.weight(1f))
            } else {
                Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                    leading()
                    centre?.invoke(this)
                }
            }
            trailing()
        }
        return
    }
    // The arrow's and the last action's 48 hit boxes centred on their glyphs' inset from the window's sides (round 15).
    val startPad = tabletBarGlyphInset(chrome.pad) - 24.dp
    val endPad = tabletBarGlyphInset(chrome.pad) - 24.dp
    // A pushed page's whole row sits a little under the bar's middle (round 11 §6), the bar's height and pen line kept.
    val drop = if (chrome.tabs) 0.dp else TabletBarRowDrop
    Layout(
        contents = listOf(
            { Row(verticalAlignment = Alignment.CenterVertically) { back(); leading() } },
            {
                if (title != null) { if (hasStatus) TitleWithStatus(titleText, status, centred = true, Modifier) else titleText(Modifier) }
                else if (centre != null) Row(verticalAlignment = Alignment.CenterVertically, content = centre)
            },
            { Row(verticalAlignment = Alignment.CenterVertically, content = trailing) },
        ),
        modifier = bar.padding(bottom = HeaderEdgeHeight).height(LocalInlineBarHeight.current),
    ) { (lead, middle, end), constraints ->
        val w = constraints.maxWidth
        val h = constraints.maxHeight
        val sp = startPad.roundToPx()
        val ep = endPad.roundToPx()
        val dy = drop.roundToPx()
        val loose = Constraints(maxHeight = h)
        val endP = end.firstOrNull()?.measure(loose.copy(maxWidth = (w - sp - ep).coerceAtLeast(0)))
        val endW = endP?.width ?: 0
        val leadP = lead.firstOrNull()?.measure(loose.copy(maxWidth = (w - sp - ep - endW).coerceAtLeast(0)))
        val leadW = leadP?.width ?: 0
        val room = InlineBarCentre.room(w / density, (sp + leadW) / density, (ep + endW) / density)
        val midP = if (room != null) middle.firstOrNull()?.measure(loose.copy(maxWidth = (room * density).toInt())) else null
        layout(w, h) {
            leadP?.place(sp, tabletRowTop(h, leadP.height, dy))
            endP?.place(w - ep - endW, tabletRowTop(h, endP.height, dy))
            midP?.place((w - midP.width) / 2, tabletRowTop(h, midP.height, dy))
        }
    }
}

/**
 * How far a tablet's back bar — the header row of a pushed page (the writer and its publish step,
 * a card, a person's settings, a thread filling the window) — sets its row's content (←, the title
 * with its save state, share, ⋯, ✓) under the middle of its [TopBarRow] (round 11 §6): all of it
 * together, the bar's height and pen line unchanged. The tall bar matches the home header's; with
 * the row centred in it, a back arrow and a 17 title — far lighter than the home header's 44 tab
 * group and wordmark — read as floating high in it. A phone's bar doesn't move; a tab root's header
 * doesn't either.
 */
val TabletBarRowDrop = 6.dp

/**
 * The line a tablet's pushed page stands its row on, under the status bar: the middle of [TopBarRow],
 * [TabletBarRowDrop] lower (42). What floats where a bar would be — the thought map's controls, the
 * writer's first row in the split's pane — stands on it too, so nothing moves as one page gives way to
 * the other (round 15).
 */
val TabletBarRowLine: Dp = TopBarRow / 2 + TabletBarRowDrop

/**
 * How far in from the window's sides a tablet bar's ← and its last action stand their glyphs' centres (round 15): no
 * further than its row line lies under the status bar ([TabletBarRowLine], 42), so the gap at the side reads as the one
 * above — at the page's pad they stood 56 in on a 1280-wide tablet and looked set too far in — and on a narrow tablet
 * no further in than they stood before (8 past the pad).
 */
fun tabletBarGlyphInset(pad: Dp): Dp = minOf(pad + 8.dp, TabletBarRowLine)

/**
 * Where a tab root's header starts its lockup and ends its pen, from the window's sides (round 15): where a pushed
 * page's ← and last action end their glyphs (18 across, centred [tabletBarGlyphInset] in) — so the root's header
 * and a pushed page's keep one edge as one gives way to the other.
 */
fun tabletBarEdge(pad: Dp): Dp = tabletBarGlyphInset(pad) - 9.dp

/** The centre of a tablet pushed page's ← glyph from the window's leading edge ([tabletBarGlyphInset]). */
fun tabletBackCentre(pad: Dp): Dp = tabletBarGlyphInset(pad)

/**
 * Where a tablet bar's piece [height] tall goes in its row [row] tall: centred, then [drop] lower —
 * never so low that it reaches into the bar's foot (a 48 tap box keeps clear of the pen line).
 */
fun tabletRowTop(row: Int, height: Int, drop: Int): Int = ((row - height) / 2 + drop).coerceAtMost((row - height).coerceAtLeast(0))

/**
 * How wide a pushed page's context may be in the middle of a tablet's header (round 5, part C),
 * apart from Compose so it can be tested: centred on the window, it keeps [GAP] clear of the wider
 * of the two ends ([leading] and [trailing]: how far each reaches in from its edge), so it stays on
 * the window's centre; under [MIN] of room it isn't shown (the arrow and the actions stay).
 */
object InlineBarCentre {
    const val GAP = 16f
    const val MIN = 72f

    fun room(width: Float, leading: Float, trailing: Float): Float? {
        val r = width - 2 * (max(leading, trailing) + GAP)
        return if (r >= MIN) r else null
    }
}

/**
 * A save state as a bar says it (the writer's, round 8 §2.1): 儲存中⋯ · 已儲存 · 修改已暫存 · 未儲存 —
 * one word, never a sentence or a time; [failed] (the last write didn't land) in the error ink.
 */
@Immutable
data class BarStatus(val text: String, val failed: Boolean = false)

/**
 * A save state ([BarStatus]): [size] (13; the title's subtitle's 12, [SaveStateSubtitleSize]) in the
 * muted ink — the error ink when it [BarStatus.failed] — one line, ellipsized, a polite live region,
 * so TalkBack hears each change; empty while there is nothing to say, its line's height kept (the
 * region stays, and hears the first word too). Under a bar's title ([OrganicInlineBar]'s `status`)
 * and under the step's heading at the writer's split; before the floating ✓ there.
 */
@Composable
fun SaveStateText(status: BarStatus?, modifier: Modifier = Modifier, size: Float = SaveStateSize) {
    val style = AppFonts.body(size, lineHeight = SAVE_STATE_LEADING, color = if (status?.failed == true) Tokens.Danger else Tokens.TextMuted)
    BasicText(
        status?.text.orEmpty(),
        maxLines = 1,
        softWrap = false,
        overflow = TextOverflow.Ellipsis,
        style = style,
        modifier = modifier.heightIn(min = lineHeightOf(style)).semantics { liveRegion = LiveRegionMode.Polite },
    )
}

/** A save state's size where it stands alone (before the split's ✓): 13 px/pt on every platform. */
const val SaveStateSize = 13f

/** A save state's size as the title's subtitle (round 11 §5): 12. */
const val SaveStateSubtitleSize = 12f

/** A save state's line: 1.4 (the web's). */
private const val SAVE_STATE_LEADING = 1.4f

/**
 * A title with its save state as its subtitle (round 11 §5, iOS's `navigationSubtitle`): the title
 * alone on the first line, the state under it at 12, [SubtitleGap] apart — start-aligned under a
 * phone's start-aligned title, [centred] under a tablet's centred one. The two lines together are
 * one block, centred on the bar's row by whoever places it (the same middle as ← and ✓). The
 * second line keeps its height while it says nothing (before the first save, a live card not yet
 * edited), so the bar never grows; meanwhile the title, alone, stands down on the row's own line
 * ([aloneDrop]: half the second line), gliding up (160 ms ease-out; at once with the system's
 * animations off) as the state comes. Each line ellipsizes on its own.
 */
@Composable
fun TitleWithStatus(title: @Composable (Modifier) -> Unit, status: BarStatus?, centred: Boolean, modifier: Modifier = Modifier) {
    val second = lineHeightOf(AppFonts.body(SaveStateSubtitleSize, lineHeight = SAVE_STATE_LEADING))
    val still = LocalContext.current.prefersReducedMotion()
    val alone = status?.text.isNullOrEmpty()
    val drop by animateDpAsState(if (alone) aloneDrop(second) else 0.dp, if (still) snap() else tween(TITLE_FADE_MILLIS, easing = EaseOut), label = "titleAlone")
    Column(modifier, horizontalAlignment = if (centred) Alignment.CenterHorizontally else Alignment.Start) {
        title(Modifier.offset { IntOffset(0, drop.roundToPx()) })
        SaveStateText(status, Modifier.padding(top = SubtitleGap), size = SaveStateSubtitleSize)
    }
}

/** How far a title stands down while its save state's line is empty: half that line and its gap, onto the row's middle. */
fun aloneDrop(subtitleLine: Dp): Dp = (subtitleLine + SubtitleGap) / 2

/** Between a title and its save state under it. */
private val SubtitleGap = 1.dp

/**
 * A card's title in the middle of a tablet's header, once the article's own has gone up under it:
 * the context's 17 two steps up (the owner's "a little bigger") and bold — Noto Serif TC's semibold
 * read faint beside the bar's glyphs; bold is the bar titles' and the article title's own weight.
 * iPad's twin (19 bold).
 */
const val TabletPageTitle = 19f

/** The pushed bar's title coming in once the page's own has scrolled under the header. */
private const val TITLE_FADE_MILLIS = 160

/**
 * Whether something at the top of a list's first item has gone up under the bar laid over the
 * list (the card's title, a person's name): the list starts on the bar's line, so it has once the
 * first item has scrolled by as much as that thing's bottom lies below the item's top
 * ([bottomInItem], unknown until measured) — or the first item is gone altogether.
 */
fun scrolledUnderBar(firstIndex: Int, firstOffset: Int, bottomInItem: Float?): Boolean =
    firstIndex > 0 || (bottomInItem != null && firstOffset >= bottomInItem)

/**
 * The inline bar's height under the status bar, without its wavy edge: its
 * 4 of air and the 48 arrow. A page lays the bar over its scrolling content
 * and pads that content by [inlineBarTop], so what scrolls shows right up to
 * the pen line instead of stopping short of it in a band of cream.
 */
val InlineBarHeight = 52.dp

/** Where a pushed page's content starts under its overlaid [OrganicInlineBar]. */
@Composable
fun inlineBarTop(): Dp = WindowInsets.statusBars.asPaddingValues().calculateTopPadding() + LocalInlineBarHeight.current + HeaderEdgeHeight

/**
 * How tall the pushed pages' bars are here: [InlineBarHeight], or in a pane beside a root list the
 * list's [BrandBarHeight], so the two bars' waves run level (design note §9).
 */
val LocalInlineBarHeight = staticCompositionLocalOf { InlineBarHeight }

/** The page is a pane's first (a thread beside the conversations): its bar has no way back. */
val LocalBarBackHidden = staticCompositionLocalOf { false }

/**
 * A bar lies over the page's scrolling content, so it must take the touches
 * that land on it — its blank middle and its wavy band included — or a tap
 * there would reach a link or a card hidden under the paper.
 */
fun Modifier.blocksTouches(): Modifier = pointerInput(Unit) {}

/** Room under a bar's content for its wavy edge (the web's HEADER_WAVE_H band). */
val HeaderEdgeHeight = 10.dp

/**
 * The web AppHeader's backdrop and bottom edge: the cream fill stops exactly
 * on the wavy pen line (the web masks its backdrop to the same curve), so the
 * line *is* the bar's edge — no band of fill below it, and content scrolled
 * beneath shows right up to the line. Uses the header's curve: wavyPoints
 * across the width, seed 211, 12 steps ([headerEdgePaths]). `lineAlpha` is read
 * while drawing, so fading the line redraws without rebuilding the paths.
 *
 * With a [pen] (the two-pane Messages, [LocalBarPen]) the line is that colour at full strength
 * whatever `lineAlpha` says, and reaches [lead] past the bar's start in a level stroke — to the
 * rule beside the pane, where it meets it.
 */
@Composable
fun Modifier.headerEdge(
    lineAlpha: () -> Float = FullInk,
    progress: (() -> Float)? = null,
    pen: Color? = null,
    lead: Dp = 0.dp,
): Modifier = drawWithCacheOf(HeaderEdge(lineAlpha, progress, pen, lead, HeaderInks(Tokens.Cream, Tokens.FieldBorderHover, Tokens.ReadingProgress, Tokens.ReadingProgressGlowAlpha)))

/** What the header's edge is drawn in: its paper, its line, and the reading progress's pen and glow. */
@Immutable
private data class HeaderInks(val paper: Color, val line: Color, val progress: Color, val glowAlpha: Float)

/** The line at full ink: one value, so two bars' edges are equal. */
private val FullInk: () -> Float = { 1f }

/**
 * [headerEdge]'s drawing, as a value ([drawWithCacheOf]): recomposed with equal inputs it is an equal modifier,
 * which keeps what it cached (outline, paths, grain) instead of building it again at the next draw.
 */
private data class HeaderEdge(val lineAlpha: () -> Float, val progress: (() -> Float)?, val pen: Color?, val lead: Dp, val inks: HeaderInks) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val ink = Tokens.Ink.toPx()
        val (line, fill) = headerEdgePaths(size.width, size.height, density)
        val leadIn = if (pen != null && lead > 0.dp) {
            val y = headerLineY(size.height, density)
            Path().apply { moveTo(-lead.toPx(), y); lineTo(0f, y) }
        } else null
        val measure = if (progress != null) PathMeasure().apply { setPath(line, false) } else null
        val read = Path()
        val readPen = Stroke(ReadingProgressPen.width.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        val glow = if (progress != null) ReadingProgressPen.glowPaint(readPen.width, ReadingProgressPen.glow.toPx(), inks.progress, inks.glowAlpha) else null
        val stroke = Stroke(ink, cap = StrokeCap.Round)
        onDrawBehind {
            drawPath(fill, inks.paper)
            if (pen != null) {
                // Opaque, so the lead-in, the line and the rule they meet never darken where they overlap.
                leadIn?.let { drawPath(it, pen, style = stroke) }
                drawPath(line, pen, style = stroke)
            } else {
                drawPath(line, inks.line, alpha = lineAlpha(), style = stroke)
            }
            // How far the story has been read: a marker over the pen line itself, centred on it and
            // covering it, from the leading edge; nothing at all before the first step (no lone cap dot).
            val p = progress?.invoke() ?: 0f
            if (measure != null && p >= READ_MIN) {
                read.reset()
                measure.getSegment(0f, p.coerceAtMost(1f) * measure.length, read, true)
                // Its soft glow first, behind it: the same stroke blurred, in the same colour at 55 % (round 5 E1).
                glow?.let { paint -> drawIntoCanvas { it.nativeCanvas.drawPath(read.asAndroidPath(), paint) } }
                drawPath(read, inks.progress, style = readPen)
            }
        }
    }
}

/**
 * The reading progress's pen (round 5 D1, E1): the header's own pen width (`--reading-progress-width`,
 * 1.8, round caps) in `--reading-progress`, a brighter terracotta-orange, over the header's line —
 * the unread rest of that line reads as its track — with a soft glow of the same colour behind it:
 * the stroke blurred by `--reading-progress-glow` (4) at [glowAlpha] (the web's drop-shadow, iOS's
 * shadow) — 0.55 in light, softer in dark (`--reading-progress-glow-alpha`), where a glow at light's
 * strength reads as neon.
 */
object ReadingProgressPen {
    val color: Color @Composable @ReadOnlyComposable get() = Tokens.ReadingProgress
    val width: Dp get() = Tokens.ReadingProgressWidth.dp
    val glow: Dp get() = Tokens.ReadingProgressGlow.dp
    /** `--reading-progress-glow-alpha`. */
    val glowAlpha: Float @Composable @ReadOnlyComposable get() = Tokens.ReadingProgressGlowAlpha

    /** The glow's paint: the pen's stroke in [color] at [alpha], [blur] px soft (a blur mask: the canvas is hardware drawn, API 28+). */
    fun glowPaint(width: Float, blur: Float, color: Color, alpha: Float): android.graphics.Paint = android.graphics.Paint(android.graphics.Paint.ANTI_ALIAS_FLAG).apply {
        style = android.graphics.Paint.Style.STROKE
        strokeWidth = width
        strokeCap = android.graphics.Paint.Cap.ROUND
        strokeJoin = android.graphics.Paint.Join.ROUND
        // As Compose's own paint takes it (the line drawn over it is the same colour).
        this.color = color.copy(alpha = alpha).toArgb()
        maskFilter = android.graphics.BlurMaskFilter(blur, android.graphics.BlurMaskFilter.Blur.NORMAL)
    }
}

/** The header's pen line and the paper above it, for a bar [width] × [height] px at [density]: [headerEdge]'s geometry. */
data class HeaderEdgePaths(val line: Path, val fill: Path)

/** Where the header's line sits at the bar's two ends (its wave starts and ends level there), in px from the bar's top. */
fun headerLineY(height: Float, density: Float): Float = (height / density - 1.4f - Tokens.Ink.value) * density

/**
 * [headerEdge]'s line — wavyPoints across the width, 1.4 above the bar's foot plus the pen,
 * seed 211, 12 steps — and the fill that stops on it. Anything that must meet the header's
 * wave (the rule between the Messages panes, tucked under its paper) cuts itself with [fill].
 */
fun headerEdgePaths(width: Float, height: Float, density: Float): HeaderEdgePaths {
    val d = density
    val y0 = headerLineY(height, d) / d
    val pts = wavyPoints((width / d).toDouble(), y0.toDouble(), 1.4, 211.0, 12).map { (it.x * d).toFloat() to (it.y * d).toFloat() }
    val line = Path().apply {
        moveTo(pts[0].first, pts[0].second)
        for (i in 1 until pts.size) {
            val (x0, y0p) = pts[i - 1]
            val (x1, y1) = pts[i]
            val mid = (x0 + x1) / 2
            cubicTo(mid, y0p, mid, y1, x1, y1)
        }
    }
    val fill = Path().apply {
        moveTo(0f, 0f)
        lineTo(width, 0f)
        lineTo(pts.last().first, pts.last().second)
        for (i in pts.size - 2 downTo 0) {
            val (x0, y0p) = pts[i + 1]
            val (x1, y1) = pts[i]
            val mid = (x0 + x1) / 2
            cubicTo(mid, y0p, mid, y1, x1, y1)
        }
        close()
    }
    return HeaderEdgePaths(line, fill)
}

/**
 * One pen for every bar's edge here, constant (round 5 D4): the two-pane Messages draws the
 * header's line, the thread pane bar's line and the rule between the panes as one stroke — the
 * same width and colour, which content scrolling under a bar never inks in. Null elsewhere: a
 * bar's line rests at half ink and inks in fully once its page has scrolled.
 */
val LocalBarPen = staticCompositionLocalOf<Color?> { null }

/** How far a bar's pen line reaches past the bar's start to meet what is beside it (a pane's bar, the rule); 0 elsewhere. */
val LocalBarLineLead = staticCompositionLocalOf { 0.dp }

/** Less read than this draws no progress (design note §3). */
private const val READ_MIN = 0.002f

/**
 * How far through a story the reader is (design note §3), 0…1: 0 while the story's top is still
 * below the bar's pen line, 1 once its bottom reaches the bottom of what can be seen, and 0 when
 * the whole story fits ([storyHeight] ≤ [visible], nothing to show). All in the same unit, the
 * story's top measured on screen.
 */
fun readingProgress(storyTop: Float, storyHeight: Float, lineY: Float, visible: Float): Float {
    val room = storyHeight - visible
    if (storyHeight <= 0f || room <= 0f) return 0f
    return ((lineY - storyTop) / room).coerceIn(0f, 1f)
}

/**
 * The tab bar's backdrop and top edge — [headerEdge] turned over: the cream
 * begins on a wavy pen line (its own seed, 223) and runs to the bottom, so
 * content scrolled beneath shows right down to the line. The line rests at
 * half ink, like the header's before the page scrolls.
 */
@Composable
fun Modifier.footerEdge(lineAlpha: Float = 0.5f): Modifier = drawWithCacheOf(FooterEdge(lineAlpha, Tokens.Cream, Tokens.FieldBorderHover))

/**
 * [footerEdge]'s drawing, as a value ([drawWithCacheOf]): recomposed with equal inputs it is an equal modifier,
 * which keeps what it cached (outline, paths, grain) instead of building it again at the next draw.
 */
private data class FooterEdge(val lineAlpha: Float, val paper: Color, val pen: Color) : (CacheDrawScope) -> DrawResult {
    override fun invoke(scope: CacheDrawScope): DrawResult = with(scope) {
        val d = density
        val ink = Tokens.Ink.toPx()
        val y0 = 1.4 + Tokens.Ink.value
        val pts = wavyPoints((size.width / d).toDouble(), y0, 1.4, 223.0, 12).map { (it.x * d).toFloat() to (it.y * d).toFloat() }
        val line = Path().apply {
            moveTo(pts[0].first, pts[0].second)
            for (i in 1 until pts.size) {
                val (x0, y0p) = pts[i - 1]
                val (x1, y1) = pts[i]
                val mid = (x0 + x1) / 2
                cubicTo(mid, y0p, mid, y1, x1, y1)
            }
        }
        val fill = Path().apply {
            addPath(line)
            lineTo(size.width, size.height)
            lineTo(0f, size.height)
            close()
        }
        onDrawBehind {
            drawPath(fill, paper)
            drawPath(line, pen, alpha = lineAlpha, style = Stroke(ink, cap = StrokeCap.Round))
        }
    }
}
