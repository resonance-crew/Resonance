package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.interaction.DragInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.GridItemSpan
import androidx.compose.foundation.lazy.grid.LazyGridState
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.grid.rememberLazyGridState
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.design.AppFonts
import com.resonance.design.generated.IconName
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIndication
import com.resonance.design.WobRectShape
import com.resonance.design.generated.Tokens
import com.resonance.design.paperSheet
import com.resonance.design.edgeFades
import com.resonance.kit.chat.ChatSticker
import com.resonance.kit.chat.StickerCatalog
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Outline
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.LayoutDirection
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import kotlin.math.min
import kotlinx.coroutines.launch
import kotlinx.coroutines.delay
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity

/** One section of the sticker panel's grid: the 🕘 recents (once there are any), then each pack. */
internal class StickerSection(val key: String, val title: String, val pack: StickerCatalog.Pack?, val stickers: List<StickerCatalog.Sticker>)

/** The sections the panel lays out: recents first while there are any, then the packs in the catalog's order. */
internal fun stickerSections(catalog: StickerCatalog, recents: List<ChatSticker>, language: String, recentTitle: String): List<StickerSection> = buildList {
    val recent = recents.mapNotNull(catalog::find)
    if (recent.isNotEmpty()) add(StickerSection(RECENT_KEY, recentTitle, null, recent))
    catalog.packs.forEach { add(StickerSection(it.id, it.name(language), it, it.stickers)) }
}

/** Where each section's heading is in the grid (its first item), and which section an item belongs to. */
internal fun sectionStarts(sections: List<StickerSection>): List<Int> {
    var i = 0
    return sections.map { s -> i.also { i += 1 + s.stickers.size } }
}

/** The section the grid's first visible item belongs to: what the pack bar marks. */
internal fun sectionAt(starts: List<Int>, firstVisible: Int): Int = starts.indexOfLast { it <= firstVisible }.coerceAtLeast(0)

/**
 * How far down the grid [item] begins, in px: each section a [heading] tall, then its stickers in rows of
 * [columns], each [row] tall. A tab's scroll goes the whole way in one glide with it, rather than in the
 * steps a scroll to a row not yet laid out takes (the owner's notes: the grid and the bar a beat late).
 */
internal fun gridTop(sections: List<StickerSection>, columns: Int, heading: Int, row: Int, item: Int): Int {
    var top = 0
    var start = 0
    for (s in sections) {
        if (item == start) return top
        if (item <= start + s.stickers.size) return top + heading + (item - start - 1) / columns * row
        top += heading + (s.stickers.size + columns - 1) / columns * row
        start += 1 + s.stickers.size
    }
    return top
}

/** The tab's glide: one ease of 300 ms to [item]'s heading (iOS's), or the grid's own scroll while nothing is measured. */
private suspend fun LazyGridState.glideTo(sections: List<StickerSection>, columns: Int, item: Int) {
    val shown = layoutInfo.visibleItemsInfo
    val heading = shown.firstOrNull { it.contentType == "heading" }?.size?.height
    val row = shown.firstOrNull { it.contentType == "sticker" }?.size?.height
    if (heading == null || row == null) return animateScrollToItem(item)
    val from = gridTop(sections, columns, heading, row, firstVisibleItemIndex) + firstVisibleItemScrollOffset
    val to = gridTop(sections, columns, heading, row, item)
    animateScrollBy((to - from).toFloat(), tween(300, easing = FastOutSlowInEasing))
}

internal const val RECENT_KEY = "recent"

/**
 * The sticker panel (round 22 §4.1, round 23 §3), in the keyboard's place under the capsule: the foot's own paper
 * continuing — no card, no rule. A row of pack icons (🕘 recents first once there are any, then each
 * character's head) over one grid scrolling through every pack, each headed by its character's name; the
 * bar marks the pack in view and a tap on an icon scrolls to its pack. 4 columns on a phone, 5–6 wider, the cells
 * as big as the width lets them be ([StickerGridInset], [StickerGridGap], [StickerCellInset]). A tap on a sticker sends
 * it ([onTap]: one tap, the owner's — no preview); the cells in view breathe ([PickerBreath], at most [playing] at
 * once; still under [still]). Scrolling the grid only scrolls it — ↑ is what grows the panel. The grid runs on under
 * the navigation bar to the screen's edge ([navigation] of room under its last row), its bottom fade at that edge.
 */
@Composable
internal fun StickerPanel(
    catalog: StickerCatalog,
    recents: List<ChatSticker>,
    origin: String,
    onTap: (StickerCatalog.Sticker) -> Unit,
    modifier: Modifier = Modifier,
    navigation: Dp = 0.dp,
    playing: Int = PICKER_PLAYING_PHONE,
    still: Boolean = LocalContext.current.let { c -> remember(c) { c.pickerHoldsStill() } },
) {
    val language = Strings.language.tag
    val sections = remember(catalog, recents, language) { stickerSections(catalog, recents, language, L10n.Messages.stickerRecent) }
    val starts = remember(sections) { sectionStarts(sections) }
    val grid = rememberLazyGridState()
    val scope = rememberCoroutineScope()
    val current by remember(starts) { derivedStateOf { sectionAt(starts, grid.firstVisibleItemIndex) } }
    // The tab tapped is marked at once and stays through its glide (and at the end, where a short last pack never
    // reaches the top) — until a finger scrolls the grid, when the bar follows the grid again.
    var picked by remember(sections) { mutableStateOf<Int?>(null) }
    LaunchedEffect(grid) { grid.interactionSource.interactions.collect { if (it is DragInteraction.Start) picked = null } }
    BoxWithConstraints(modifier.fillMaxSize()) {
        val columns = when {
            maxWidth >= 600.dp -> 6
            maxWidth >= 480.dp -> 5
            else -> 4
        }
        Column(Modifier.fillMaxSize()) {
            PackBar(sections, picked ?: current, origin) { i ->
                picked = i
                scope.launch { grid.glideTo(sections, columns, starts[i]) }
            }
            Box(Modifier.fillMaxWidth().weight(1f)) {
                // Its edges fade where more stickers lie beyond (the owner's notes 7, the web's 16): no line, no card.
                StickerGrid(
                    sections, columns, grid, origin,
                    Modifier.fillMaxSize().edgeFades({ grid.canScrollBackward }, { grid.canScrollForward }),
                    navigation, onTap, playing, still,
                )
            }
        }
    }
}

/** The pack bar: 44 targets in a row, the one in view on a soft tonal wash (round 17's bare trigger, never the accent). */
@Composable
private fun PackBar(sections: List<StickerSection>, current: Int, origin: String, onPick: (Int) -> Unit) {
    Row(
        Modifier.fillMaxWidth().height(48.dp).padding(horizontal = 10.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(4.dp),
    ) {
        sections.forEachIndexed { i, section ->
            val chosen = i == current
            val wash = Tokens.ButtonTonal
            // The press spreads the very wash the tab in view rests on, inside the same outline.
            val shape = remember(i) { WobRectShape(14.0, 61.0 + i * 7) }
            Box(
                Modifier
                    .size(44.dp)
                    .drawBehind {
                        if (chosen) drawOutline(shape.createOutline(size, layoutDirection, this), wash)
                    }
                    .clickable(
                        interactionSource = null, indication = remember(shape, wash) { OrganicIndication(wash, shape = shape) },
                        role = Role.Tab, onClickLabel = section.title,
                    ) { onPick(i) }
                    .semantics {
                        contentDescription = section.title
                        selected = chosen
                    },
                contentAlignment = Alignment.Center,
            ) {
                val pack = section.pack
                if (pack == null) OrganicIcon(IconName.Clock, size = 22.dp, color = if (chosen) Tokens.Text else Tokens.TextMuted, strokeWidth = Tokens.Ink.value)
                else PackIcon(pack, origin, Modifier.size(32.dp))
            }
        }
    }
}

/**
 * The grid: every section's heading across the row, then its stickers' key poses; keys stable by pack and id. The
 * cells at least 60 % in view (under the navigation bar counts as out of it) breathe through [PickerBreath], while the
 * grid isn't being scrolled.
 */
@Composable
private fun StickerGrid(
    sections: List<StickerSection>,
    columns: Int,
    grid: LazyGridState,
    origin: String,
    modifier: Modifier,
    navigation: Dp,
    onTap: (StickerCatalog.Sticker) -> Unit,
    playing: Int,
    still: Boolean,
) {
    val language = Strings.language.tag
    val breath = remember(playing) { PickerBreath(playing) }
    val density = LocalDensity.current
    val hidden = with(density) { navigation.roundToPx() }
    if (!still) LaunchedEffect(breath, grid) {
        while (true) {
            breath.step(cellsInView(grid, hidden), grid.isScrollInProgress)
            delay(PickerBreath.STAGGER_MILLIS)
        }
    }
    LazyVerticalGrid(
        GridCells.Fixed(columns),
        modifier,
        state = grid,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = StickerGridInset, end = StickerGridInset, bottom = 12.dp + navigation),
        horizontalArrangement = Arrangement.spacedBy(StickerGridGap),
        verticalArrangement = Arrangement.spacedBy(StickerGridGap),
    ) {
        sections.forEach { section ->
            item(key = "h:${section.key}", span = { GridItemSpan(maxLineSpan) }, contentType = "heading") {
                BasicText(
                    section.title.uppercase(),
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = AppFonts.body(11.5f, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em),
                    // In line with the art (the cell's inset), its air over it.
                    modifier = Modifier.padding(start = StickerCellInset, top = 10.dp, bottom = 2.dp).semantics { heading() },
                )
            }
            items(section.stickers, key = { "${section.key}:${it.pack}/${it.id}" }, contentType = { "sticker" }) { sticker ->
                val key = "${section.key}:${sticker.pack}/${sticker.id}"
                val wash = Tokens.ButtonTonal
                val name = sticker.name(language)
                Box(
                    Modifier
                        .aspectRatio(1f)
                        // The press spreads the drawn cell wash inside the cell's outline: the press, never a choice.
                        .clickable(
                            interactionSource = null, indication = remember(wash) { OrganicIndication(wash, shape = CellShape) },
                            role = Role.Button, onClickLabel = L10n.Messages.stickerSendHint,
                        ) { onTap(sticker) }
                        .semantics { contentDescription = name },
                    contentAlignment = Alignment.Center,
                ) {
                    val art = Modifier.fillMaxSize().padding(StickerCellInset)
                    if (still) StickerPose(sticker, origin, art)
                    else BreathingSticker(sticker, origin, playing = breath.plays(key), onEnded = { breath.ended(key) }, modifier = art)
                }
            }
        }
    }
}

/**
 * The sticker cells at least 60 % in view, in reading order (the grid's own: row by row): what [PickerBreath] may play.
 * [hidden] px at the viewport's foot (under the navigation bar) count as out of view.
 */
private fun cellsInView(grid: LazyGridState, hidden: Int): List<String> {
    val info = grid.layoutInfo
    val top = info.viewportStartOffset
    val bottom = info.viewportEndOffset - hidden
    return info.visibleItemsInfo
        .filter { it.contentType == "sticker" }
        .filter { item ->
            val y0 = item.offset.y
            val y1 = y0 + item.size.height
            inViewEnough(item.size.height, (minOf(y1, bottom) - maxOf(y0, top)).coerceAtLeast(0))
        }
        .sortedBy { it.index }
        .map { it.key as String }
}

/**
 * The grid's measures (round 23 §3, one rule on every platform, the critique's 7): 8 from the screen's edges, 4 between
 * cells, the art 2 inside its cell — a 411 phone's four columns ≈ 95 a cell, ≈ 91 of art (from 80).
 */
internal val StickerGridInset = 8.dp
internal val StickerGridGap = 4.dp
internal val StickerCellInset = 2.dp

/**
 * A sticker cell's outline at any size: radius 16 and its own swing at a phone's ~92 across, kept in proportion
 * (the owner's notes, 2026-11-01): the press's wash spreads inside it.
 */
internal data class StickerCellShape(private val seed: Double = 37.0) : Shape {
    override fun createOutline(size: Size, layoutDirection: LayoutDirection, density: Density): Outline {
        val s = min(size.width, size.height) / density.density.toDouble()
        return WobRectShape(s * 0.174, seed, s * 0.035, CellOptions).createOutline(size, layoutDirection, density)
    }
}

private val CellOptions = WobRectOptions(curve = 1.52, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(2.0))

/** A sticker cell's wash: a press spreads inside it (round 23: there is no choice to rest on). */
private val CellShape = StickerCellShape()
