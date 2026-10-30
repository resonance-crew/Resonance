package com.resonance.app.ui

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.foundation.clickable
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
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.input.nestedscroll.NestedScrollConnection
import androidx.compose.ui.input.nestedscroll.nestedScroll
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
import com.resonance.design.WobRectShape
import com.resonance.design.generated.Tokens
import com.resonance.design.paperSheet
import com.resonance.kit.chat.ChatSticker
import com.resonance.kit.chat.StickerCatalog
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import kotlinx.coroutines.launch

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

internal const val RECENT_KEY = "recent"

/**
 * The sticker panel (round 22 §4.1), in the keyboard's place under the capsule: the foot's own paper
 * continuing — no card, no rule. A row of pack icons (🕘 recents first once there are any, then each
 * character's head) over one grid scrolling through every pack, each headed by its character's name; the
 * bar marks the pack in view and a tap on an icon scrolls to its pack. 4 columns on a phone, 5–6 wider.
 * A tap on a sticker previews it ([onTap]: the screen previews, a second tap sends). Scrolling the grid
 * up grows the panel first ([nested]).
 */
@Composable
internal fun StickerPanel(
    catalog: StickerCatalog,
    recents: List<ChatSticker>,
    origin: String,
    previewing: ChatSticker?,
    nested: NestedScrollConnection,
    onTap: (StickerCatalog.Sticker) -> Unit,
    modifier: Modifier = Modifier,
) {
    val language = Strings.language.tag
    val sections = remember(catalog, recents, language) { stickerSections(catalog, recents, language, L10n.Messages.stickerRecent) }
    val starts = remember(sections) { sectionStarts(sections) }
    val grid = rememberLazyGridState()
    val scope = rememberCoroutineScope()
    val current by remember(starts) { derivedStateOf { sectionAt(starts, grid.firstVisibleItemIndex) } }
    Column(modifier.fillMaxSize()) {
        PackBar(sections, current, origin) { i -> scope.launch { grid.animateScrollToItem(starts[i]) } }
        BoxWithConstraints(Modifier.fillMaxWidth().weight(1f)) {
            val columns = when {
                maxWidth >= 600.dp -> 6
                maxWidth >= 480.dp -> 5
                else -> 4
            }
            StickerGrid(sections, columns, grid, origin, previewing, Modifier.fillMaxSize().nestedScroll(nested), onTap)
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
            Box(
                Modifier
                    .size(44.dp)
                    .drawBehind {
                        if (chosen) drawOutline(WobRectShape(14.0, 61.0 + i * 7).createOutline(size, layoutDirection, this), wash)
                    }
                    .clickable(role = Role.Tab, onClickLabel = section.title) { onPick(i) }
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

/** The grid: every section's heading across the row, then its stickers' key poses; keys stable by pack and id. */
@Composable
private fun StickerGrid(
    sections: List<StickerSection>,
    columns: Int,
    grid: LazyGridState,
    origin: String,
    previewing: ChatSticker?,
    modifier: Modifier,
    onTap: (StickerCatalog.Sticker) -> Unit,
) {
    val language = Strings.language.tag
    LazyVerticalGrid(
        GridCells.Fixed(columns),
        modifier,
        state = grid,
        contentPadding = androidx.compose.foundation.layout.PaddingValues(start = 10.dp, end = 10.dp, bottom = 12.dp),
    ) {
        sections.forEach { section ->
            item(key = "h:${section.key}", span = { GridItemSpan(maxLineSpan) }, contentType = "heading") {
                BasicText(
                    section.title.uppercase(),
                    maxLines = 1, overflow = TextOverflow.Ellipsis,
                    style = AppFonts.body(11.5f, 600, lineHeight = 1.3f, color = Tokens.TextMuted).copy(letterSpacing = 0.06.em),
                    modifier = Modifier.padding(start = 6.dp, top = 10.dp, bottom = 4.dp).semantics { heading() },
                )
            }
            items(section.stickers, key = { "${section.key}:${it.pack}/${it.id}" }, contentType = { "sticker" }) { sticker ->
                val chosen = previewing == sticker.ref
                val wash = Tokens.ButtonTonal
                val name = sticker.name(language)
                Box(
                    Modifier
                        .aspectRatio(1f)
                        .padding(3.dp)
                        .drawBehind { if (chosen) drawOutline(WobRectShape(16.0, 37.0).createOutline(size, layoutDirection, this), wash) }
                        .clickable(role = Role.Button, onClickLabel = if (chosen) L10n.Messages.send else name) { onTap(sticker) }
                        .semantics { contentDescription = name },
                    contentAlignment = Alignment.Center,
                ) { StickerPose(sticker, origin, Modifier.fillMaxSize().padding(6.dp)) }
            }
        }
    }
}

/**
 * The sticker being previewed (round 22 §4.1): the animated file at [size] on a flat paper sheet over the
 * thread's foot, its name and 「再點一次傳送」 under it — a tap on it sends. Heard by TalkBack as
 * 「預覽：謝謝，再點一次傳送」 as it comes.
 */
@Composable
internal fun StickerPreview(
    sticker: StickerCatalog.Sticker?,
    origin: String,
    onSend: (StickerCatalog.Sticker) -> Unit,
    modifier: Modifier = Modifier,
    size: Dp = 144.dp,
) {
    AnimatedVisibility(
        visible = sticker != null,
        modifier = modifier,
        enter = fadeIn(tween(140)) + scaleIn(tween(160), initialScale = 0.92f),
        exit = fadeOut(tween(100)) + scaleOut(tween(100), targetScale = 0.96f),
    ) {
        val s = sticker ?: return@AnimatedVisibility
        val name = s.name(Strings.language.tag)
        Column(
            Modifier
                .paperSheet(seed = 47.0)
                .clickable(interactionSource = null, indication = null, role = Role.Button, onClickLabel = L10n.Messages.send) { onSend(s) }
                .semantics {
                    contentDescription = L10n.Messages.stickerPreviewA11y(name)
                    liveRegion = LiveRegionMode.Polite
                }
                .padding(start = 14.dp, end = 14.dp, top = 12.dp, bottom = 10.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
        ) {
            // A new sticker previewed plays from its start (its key under it all).
            androidx.compose.runtime.key(s.pack, s.id) {
                PlayingSticker(s, origin, key = "preview:${s.pack}/${s.id}", size = size, autoplay = true, replays = 0)
            }
            BasicText(
                "$name · ${L10n.Messages.stickerPreviewHint}",
                maxLines = 1, overflow = TextOverflow.Ellipsis,
                style = AppFonts.body(12f, lineHeight = 1.3f, color = Tokens.TextMuted).copy(textAlign = TextAlign.Center),
                modifier = Modifier.padding(top = 6.dp),
            )
        }
    }
}
