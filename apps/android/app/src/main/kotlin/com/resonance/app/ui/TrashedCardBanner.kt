package com.resonance.app.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.PressInteraction
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.IntrinsicSize
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathOperation
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.clipPath
import androidx.compose.ui.layout.onPlaced
import androidx.compose.ui.layout.positionInParent
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.stateDescription
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.api.models.CardDetail
import com.resonance.api.models.FeedCard
import com.resonance.design.AppFonts
import com.resonance.design.ButtonLoader
import com.resonance.design.Grain
import com.resonance.design.GrainInk
import com.resonance.design.GrainMode
import com.resonance.design.InkSpread
import com.resonance.design.LocalToasts
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicIndication
import com.resonance.design.boundaryPoints
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.labelInkDrop
import com.resonance.design.polylinePath
import com.resonance.design.toPath
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.autoCurve
import com.resonance.geometry.autoSegments
import com.resonance.geometry.wobRect
import com.resonance.kit.api.isTrashed
import com.resonance.kit.l10n.L10n
import java.time.Instant
import kotlin.math.max
import kotlin.math.min

/**
 * 「這張卡片在垃圾桶裡」 — what the owner sees at the head of their card's page while it is in the
 * trash (TrashedCardBanner.tsx; trash.spec §5.4 with the critique's placement: the article's first
 * block, above the cover or the title): how long it has and that only they can see it, that an
 * anonymous card's notes went with it, then 還原 (the card comes back here, as it was) and 永久刪除
 * (asked first, in red; then [onDeleted], away from the page). Everyone else never sees the card at
 * all (it is private while it is there).
 *
 * One hand-drawn shape, cut as the segmented bar is (round 19): the words on its paper, the two ways
 * out filling its end as segments behind wavy seams — 還原 the verb's solid face, 永久刪除 the
 * danger's tonal one — and, [compact] (a phone, where the words take the width), its foot, split
 * down the middle. Drawn by [TrashBannerShape].
 */
@Composable
fun TrashedCardBanner(
    card: FeedCard,
    anonymous: Boolean,
    compact: Boolean,
    /** Bumped when the card was moved to the trash on this page: the banner's title takes the focus. */
    focusTicket: Int = 0,
    onDeleted: () -> Unit,
) {
    val trash = LocalTrash.current ?: return
    val toasts = LocalToasts.current
    var restoring by remember { mutableStateOf(false) }
    var deleting by remember { mutableStateOf(false) }
    val title = remember { FocusRequester() }
    LaunchedEffect(focusTicket) { if (focusTicket > 0) runCatching { title.requestFocus() } }
    val ref = TrashRef(card.id, card.title)
    val caption = trashBannerCaption(card)

    // Where the segments are (dp, within the banner): 還原's start (and, stacked, the foot's top), and 永久刪除's start.
    var restoreX by remember { mutableFloatStateOf(0f) }
    var footY by remember { mutableFloatStateOf(0f) }
    var deleteX by remember { mutableFloatStateOf(0f) }
    val density = LocalDensity.current
    val scope = rememberCoroutineScope()
    val restoreInk = remember { InkSpread() }
    val deleteInk = remember { InkSpread() }
    var pressed by remember { mutableStateOf<Int?>(null) }
    val paper = Tokens.CreamDark
    val restoreFace = Tokens.ButtonFill
    val dangerFace = Tokens.ButtonDangerTonal
    val seam = Tokens.Cream
    val pen = Tokens.FieldBorderHover
    val restoreWash = OrganicIndication.OnFill
    val dangerWash = Tokens.Danger.copy(alpha = 0.14f)
    val grainInk = GrainInk.current

    val words: @Composable (Modifier) -> Unit = { modifier ->
        Row(
            modifier,
            verticalAlignment = if (compact) Alignment.Top else Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            OrganicIcon(IconName.Trash, Modifier.padding(top = if (compact) 1.dp else 0.dp), size = 20.dp, color = Tokens.TextMuted)
            Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
                // Not a heading: it comes before the card's own title.
                BasicText(
                    L10n.Card.Trashed.title,
                    style = AppFonts.body(15f, 600, lineHeight = 1.4f),
                    modifier = Modifier.focusRequester(title).focusable(),
                )
                BasicText(caption, style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted))
                if (anonymous && card.publishedAt != null) {
                    BasicText(L10n.Card.Trashed.notesGone, style = AppFonts.body(13f, lineHeight = 1.5f, color = Tokens.TextMuted))
                }
            }
        }
    }
    // A segment: its glyph and words, a press spreading from the finger inside its own region.
    @Composable
    fun RowScope.Seg(
        index: Int, label: String, icon: IconName, ink: Color, busy: Boolean, enabled: Boolean,
        padStart: Dp, padEnd: Dp, minHeight: Dp, modifier: Modifier, onClick: () -> Unit,
    ) {
        val source = remember { MutableInteractionSource() }
        val spread = if (index == 0) restoreInk else deleteInk
        LaunchedEffect(source) {
            source.interactions.collect {
                when (it) {
                    is PressInteraction.Press -> {
                        pressed = index
                        // From the finger, in the banner's own space: the segment's place in it, then the press within it.
                        val at = with(density) { Offset((if (index == 0) restoreX else deleteX).dp.toPx(), footY.dp.toPx()) }
                        spread.press(scope, it.pressPosition + at)
                    }
                    is PressInteraction.Release, is PressInteraction.Cancel -> spread.release(scope)
                }
            }
        }
        Row(
            modifier
                .heightIn(min = minHeight)
                .clickable(source, indication = null, enabled = enabled, role = Role.Button, onClick = onClick)
                .semantics { if (busy) stateDescription = L10n.App.busy }
                .padding(start = padStart, end = padEnd),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp, Alignment.CenterHorizontally),
        ) {
            if (busy) ButtonLoader(ink, 16.dp, Modifier.offset(y = labelInkDrop(15f)))
            else OrganicIcon(icon, Modifier.offset(y = labelInkDrop(15f)), size = 16.dp, color = ink)
            BasicText(label, maxLines = 1, softWrap = false, style = AppFonts.body(15f, 600, lineHeight = 1f, color = ink))
        }
    }
    val restore = {
        if (!restoring) {
            restoring = true
            // The page reads the card again as it comes back: the banner goes with the trash.
            trash.launch {
                try {
                    restoreSaying(ref)
                } finally {
                    restoring = false
                }
            }
        }
    }
    val segments: @Composable RowScope.() -> Unit = {
        val minHeight = if (compact) 50.dp else 48.dp
        Seg(
            0, L10n.Me.Actions.restore, IconName.Restore, Tokens.Cream, busy = restoring, enabled = !restoring && !deleting,
            padStart = if (compact) 12.dp else 26.dp, padEnd = if (compact) 12.dp else 24.dp, minHeight = minHeight,
            modifier = (if (compact) Modifier.weight(1f) else Modifier).fillMaxHeight()
                .onPlaced { with(density) { val p = it.positionInParent(); restoreX = p.x.toDp().value; if (!compact) footY = 0f } },
            onClick = restore,
        )
        Seg(
            1, L10n.Me.Actions.deleteForever, IconName.Trash, Tokens.ButtonOnDangerTonal, busy = false, enabled = !restoring,
            padStart = if (compact) 12.dp else 24.dp, padEnd = if (compact) 12.dp else 26.dp, minHeight = minHeight,
            modifier = (if (compact) Modifier.weight(1f) else Modifier).fillMaxHeight()
                .onPlaced { with(density) { deleteX = it.positionInParent().x.toDp().value } },
        ) { deleting = true }
    }
    val drawing = Modifier.drawWithCache {
        val d = this.density
        val w = size.width / d
        val h = size.height / d
        val shape = TrashBannerShape.of(w.toDouble(), h.toDouble(), restoreX.toDouble(), footY.toDouble(), deleteX.toDouble(), compact)
        val outline = shape.outline.toPath(d)
        fun inside(path: Path) = Path().apply { op(path, outline, PathOperation.Intersect) }
        val segs = inside(polygon(shape.segments, d))
        val danger = Path().apply { op(inside(polygon(shape.danger, d)), segs, PathOperation.Intersect) }
        val restoreRegion = Path().apply { op(inside(polygon(shape.restore, d)), segs, PathOperation.Intersect) }
        val seams = shape.seams.map { polylinePath(it, d) }
        val grain = Grain.brush(GrainMode.Tile, "grain-button", size, d, 0.38f, grainInk)
        val ink = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
        onDrawBehind {
            drawPath(outline, paper)
            drawPath(segs, restoreFace)
            drawPath(danger, dangerFace)
            grain?.let { drawPath(segs, it, alpha = 0.38f) }
            when (pressed) {
                0 -> with(restoreInk) { draw(restoreRegion, restoreWash) }
                1 -> with(deleteInk) { draw(danger, dangerWash) }
            }
            clipPath(outline) {
                drawPath(seams[0], seam, style = ink)
                // Stacked, the split between the two is cut back to the foot: it never shows among the words.
                if (compact) clipPath(segs) { drawPath(seams[1], seam, style = ink) } else drawPath(seams[1], seam, style = ink)
            }
            drawPath(outline, pen, style = ink)
        }
    }
    if (compact) {
        Column(Modifier.fillMaxWidth().padding(bottom = 24.dp).then(drawing)) {
            words(Modifier.fillMaxWidth().padding(start = 18.dp, end = 18.dp, top = 14.dp, bottom = 12.dp))
            Row(Modifier.fillMaxWidth().height(50.dp).onPlaced { with(density) { footY = it.positionInParent().y.toDp().value } }) { segments() }
        }
    } else {
        Row(Modifier.fillMaxWidth().padding(bottom = 24.dp).height(IntrinsicSize.Min).heightIn(min = 76.dp).then(drawing)) {
            words(Modifier.weight(1f).align(Alignment.CenterVertically).padding(horizontal = 20.dp, vertical = 14.dp))
            segments()
        }
    }
    if (deleting) DeleteForeverDialog(trash, toasts, ref, seed = 71.0, onClose = { deleting = false }, onDeleted = onDeleted)
}

/** Points (dp) as a closed polygon, in px. */
private fun polygon(points: List<Offset>, density: Float): Path = polylinePath(points, density).apply { close() }

/**
 * The banner's drawing at [w] × [h] (dp), TrashedCardBanner.tsx's bannerShape: its outline — a card's
 * wobble, plain to see — and the regions and seams of its two segments, on one point list each, so a
 * face's edge lies exactly under its seam (the segmented bar's [boundaryPoints]). Side by side the
 * segments are the shape's end, from [restoreX], split at [deleteX]; stacked ([stacked]) its foot from
 * [footY], split at [deleteX] under a seam run across the width.
 */
internal class TrashBannerShape(
    val outline: List<com.resonance.geometry.PathCommand>,
    /** Before 還原 (stacked: under the words), then between the two. */
    val seams: List<List<Offset>>,
    /** Everything past the first seam (the outline trims it). */
    val segments: List<Offset>,
    /** Past the seam between 還原 and 永久刪除. */
    val danger: List<Offset>,
    /** 還原's own region, for its press. */
    val restore: List<Offset>,
) {
    companion object {
        const val SEED = 83.0
        /** The corner, as a card's. */
        const val RADIUS = 18.0

        fun of(w: Double, h: Double, restoreX: Double, footY: Double, deleteX: Double, stacked: Boolean): TrashBannerShape {
            val outline = wobRect(
                w, h, RADIUS, SEED, min(4.5, 2.6 + min(w, h) * 0.02),
                WobRectOptions(
                    segmentsH = SegValue.Count((autoSegments(w) + 1).toDouble()),
                    segmentsV = SegValue.Count(max(2, autoSegments(h)).toDouble()),
                    curve = autoCurve(w, h) * 1.15,
                    cornerJitter = 1.4,
                ),
            )
            val pad = max(12.0, h * 0.3)
            val p = pad.toFloat()
            val wf = w.toFloat()
            val hf = h.toFloat()
            fun rightOf(pts: List<Offset>) = pts + listOf(Offset(wf + p, hf + p), Offset(wf + p, -p))
            if (!stacked) {
                val first = boundaryPoints(restoreX, h, SEED + 11, 1.8, pad)
                val second = boundaryPoints(deleteX, h, SEED + 48, 1.8, pad)
                return TrashBannerShape(outline, listOf(first, second), rightOf(first), rightOf(second), first + second.reversed())
            }
            // The segmented bar's wave turned on its side: a seam across the shape at the foot's top, left to right.
            val under = boundaryPoints(footY, w, SEED + 11, 2.6, pad).map { Offset(it.y, it.x) }
            val split = boundaryPoints(deleteX, h - footY, SEED + 48, 1.8, pad).map { Offset(it.x, it.y + footY.toFloat()) }
            return TrashBannerShape(
                outline,
                listOf(under, split),
                under + listOf(Offset(wf + p, hf + p), Offset(-p, hf + p)),
                rightOf(split),
                listOf(Offset(-p, -p)) + split + Offset(-p, hf + p),
            )
        }
    }
}

/** The page is the owner's own card in the trash: the banner first, no share, no ⋯, no lists around it. */
internal fun ownTrashed(detail: CardDetail): Boolean = detail.isOwner && detail.card.isTrashed

/** The banner's line: 「{n} 天後永久刪除 · 只有你看得到」 (or 一天內永久刪除 in its last day). */
internal fun trashBannerCaption(card: FeedCard, now: Instant = Instant.now()): String =
    listOfNotNull(TrashWords.left(card, now), L10n.Card.Trashed.onlyYou).joinToString(" · ")
