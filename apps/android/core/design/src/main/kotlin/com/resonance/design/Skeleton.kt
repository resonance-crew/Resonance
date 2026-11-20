package com.resonance.design

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.State
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.text.BasicText
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.runtime.ReadOnlyComposable
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.style.TextOverflow
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import com.resonance.kit.l10n.Strings
import com.resonance.kit.story.PlainText
import com.resonance.kit.story.StoryScript
import kotlin.math.roundToInt

/** The shimmer's highlight inside a card of its own hue ([WithSkeletonHue]); null: the theme's accent family's. */
val LocalSkeletonHighlight = compositionLocalOf<Color?> { null }

/** CSS `ease`. */
private val Ease = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/**
 * Skeleton.tsx: one warm placeholder block. The fill is a sand → highlight →
 * sand band four times the block's width sliding across it over 1.5s (the
 * web's 400% background from 100% to −100%); with animations removed it rests
 * as plain sand. Width comes from `modifier` (full width by default).
 */
@Composable
fun Skeleton(modifier: Modifier = Modifier, height: Dp = 14.dp, radius: Dp = 7.dp, circle: Boolean = false, shape: Shape? = null) {
    val sized = if (circle) modifier.size(height) else modifier.fillMaxWidth().height(height)
    Box(sized.clip(shape ?: if (circle) CircleShape else RoundedCornerShape(radius)).shimmer())
}

/**
 * A picture's place while it is on its way (OrganicImage): the shimmer over the whole box, its shape the
 * frame's own clip — so a cover reads as loading, not as the striped "no picture" placeholder.
 */
@Composable
fun SkeletonCover() {
    Box(Modifier.fillMaxSize().shimmer())
}

/**
 * How much words of [size] sp have grown with the text size in force (1 at the default; the app's
 * [CappedTextScale], or a story's [ReadingTextScale], with the platform's non-linear curve): a
 * skeleton's bars grow by it, so a bar keeps its share of the line it stands for.
 */
@Composable
@ReadOnlyComposable
fun textGrowth(size: Float): Float = with(LocalDensity.current) { size.sp.toDp() } / size.dp

/**
 * What a skeleton sets its unseen lines in: Han beside Latin in a Chinese interface, Latin alone in an
 * English one — a Compose text's line holding Han takes its height from the fallback face (Noto TC's
 * metrics, taller than the style's leading: a 14 sp line of 1.3 is 21 dp, not 18.2), so the lines a
 * reader mostly sees are the ones it matches.
 */
fun skeletonSample(language: Strings.Language = Strings.language): String = if (language == Strings.Language.ZhTW) "讀Ag" else "Ag"

/**
 * Lines of words still on their way (the owner, at 1.5× text: 「私訊頁面的 skeleton 和實際位置不一樣」):
 * as tall as one line of [style] for each of [bars] — [sample] set there unseen, so the text size and
 * the fallback face make them exactly as tall as they make the words — with a bar [height] tall, grown
 * with the text, in the middle of each line at [alignment], its corners [radius]. [bars] shape each bar
 * (a width; a fixed one is the default size's — times [textGrowth]); [modifier] is the lines' box (the
 * row's width unless given one). For words in CSS line boxes ([CssText], a story's title and body) see [CssSkeletonLines].
 */
@Composable
fun SkeletonLines(
    style: TextStyle,
    height: Dp,
    vararg bars: Modifier,
    modifier: Modifier = Modifier.fillMaxWidth(),
    alignment: Alignment = Alignment.CenterStart,
    sample: String = skeletonSample(),
    radius: Dp = 7.dp,
) {
    val grow = textGrowth(style.fontSize.value)
    Box(modifier) {
        // One sample a line, each a real line of words: a line padded out by `minLines` takes the plain face's
        // height, never the fallback's a line of Han takes.
        BasicText(
            List(bars.size.coerceAtLeast(1)) { sample }.joinToString("\n"), Modifier.alpha(0f).clearAndSetSemantics { }, style = style,
            softWrap = false, overflow = TextOverflow.Clip, maxLines = bars.size.coerceAtLeast(1),
        )
        Column(Modifier.matchParentSize()) {
            bars.forEach { bar -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = alignment) { Skeleton(bar, height = height * grow, radius = radius) } }
        }
    }
}

/**
 * [SkeletonLines] for words in CSS line boxes ([CssText], a story's title and body): each line exactly
 * [size] × [leading] at the text size in force ([cssFontPx], rounded to a pixel as [CssLineHeightSpan]
 * rounds it), whatever the script, with a bar [height] tall, grown with the text, in its middle.
 */
@Composable
fun CssSkeletonLines(
    size: Float,
    leading: Float,
    height: Dp,
    vararg bars: Modifier,
    modifier: Modifier = Modifier.fillMaxWidth(),
    alignment: Alignment = Alignment.CenterStart,
) {
    val density = LocalDensity.current
    val linePx = (density.cssFontPx(size) * leading).roundToInt()
    val grow = textGrowth(size)
    Column(modifier.height(with(density) { (linePx * bars.size).toDp() })) {
        bars.forEach { bar -> Box(Modifier.weight(1f).fillMaxWidth(), contentAlignment = alignment) { Skeleton(bar, height = height * grow) } }
    }
}

/**
 * [CssSkeletonLines] for a paragraph as long as [sample]: as many lines as [sample] takes in that CSS
 * type ([CssLayout], the words' own layout) at this width and text size — so a typical paragraph's
 * place, at any size — every bar the line's width but the last, [last] of it.
 */
@Composable
fun CssSkeletonParagraph(
    sample: String,
    family: AppFonts.Family,
    size: Float,
    weight: Int,
    leading: Float,
    height: Dp,
    last: Float = 0.7f,
    modifier: Modifier = Modifier.fillMaxWidth(),
) {
    BoxWithConstraints(modifier) {
        val density = LocalDensity.current
        val widthPx = constraints.maxWidth
        val lines = remember(sample, family, size, weight, leading, widthPx, density.density, density.fontScale, AppFonts.useBundledCJK) {
            if (!constraints.hasBoundedWidth || widthPx <= 0) 3
            else CssLayout.build(sample, family, size, weight, leading, widthPx, density, Color.Transparent).lineCount.coerceAtLeast(1)
        }
        CssSkeletonLines(size, leading, height, *Array(lines) { i -> if (i == lines - 1 && lines > 1) Modifier.fillMaxWidth(last) else Modifier })
    }
}

/**
 * As long as a feed card's excerpt mostly is: the story's first [PlainText.EXCERPT_CHARS] characters
 * and an ellipsis (the web's `excerpt`, src/lib/markdown/plainText.ts — most stories run longer), in
 * the interface's script — ordinary prose, its punctuation (narrower than a Han character in the
 * face) as often as a story's, so it takes the lines a real excerpt takes.
 */
fun excerptSample(language: Strings.Language = Strings.language): String =
    (if (language == Strings.Language.ZhTW) ZH_EXCERPT else EN_EXCERPT).take(PlainText.EXCERPT_CHARS) + "…"

private const val ZH_EXCERPT =
    "緣分真的是件很奇妙的事。我們在同一間教室裡待了三年，卻直到畢業那天才第一次好好說話。那天下著雨，走廊盡頭的燈一盞一盞地熄了，" +
        "她說：「原來你也在這裡。」我想了很久，才知道那句話的意思。後來每次下雨，我都會想起她。"
private const val EN_EXCERPT =
    "We met on the first day of school and talked until the lights went out at the far end of the long hallway, and then we walked home."

/**
 * A [TagPill] still on its way: a pill [width] long (the default size's, grown with the text) and as
 * tall as a [size] pill — its words' line set unseen in the pill's type, inside the pill's padding.
 */
@Composable
fun SkeletonTag(width: Dp, size: TagSize = TagSize.Md) {
    Box(Modifier.width(width * textGrowth(size.font))) {
        BasicText(
            skeletonSample(), Modifier.alpha(0f).clearAndSetSemantics { }.padding(vertical = size.padY),
            style = AppFonts.body(size.font, 600, lineHeight = 1.3f), softWrap = false, overflow = TextOverflow.Clip, maxLines = 1,
        )
        Skeleton(Modifier.matchParentSize(), height = Dp.Unspecified, shape = RoundedCornerShape(percent = 50))
    }
}

/** The shimmer's phase (0…1) over its 1.5 s, or null with animations removed (the block rests as plain sand). */
@Composable
private fun shimmerPhase(): State<Float>? {
    val context = LocalContext.current
    val still = rememberMotionBudget().reducedMotion
    return if (still) null else rememberInfiniteTransition(label = "skeleton").animateFloat(
        0f, 1f, infiniteRepeatable(tween(1500, easing = Ease)), label = "shimmer",
    )
}

/** A [SharedShimmer]'s clock, for the blocks inside it. */
private class ShimmerClock(val phase: State<Float>?)

private val LocalShimmerClock = compositionLocalOf<ShimmerClock?> { null }

/**
 * One shimmer clock for every block of a skeleton composed together — a card's eleven blocks, a
 * list's rows — instead of an infinite animation each, resumed every frame. Blocks that start
 * together run in step either way, so nothing shows of it: wrap only blocks composed with the
 * skeleton itself (one shown later starts its own clock, outside any).
 */
@Composable
fun SharedShimmer(content: @Composable () -> Unit) {
    val phase = shimmerPhase()
    val clock = remember(phase) { ShimmerClock(phase) }
    CompositionLocalProvider(LocalShimmerClock provides clock, content = content)
}

@Composable
private fun Modifier.shimmer(): Modifier {
    val highlight = LocalSkeletonHighlight.current ?: Mixes.skeletonHighlight()
    val base = Mixes.SkeletonBase
    val shared = LocalShimmerClock.current
    val t = if (shared != null) shared.phase else shimmerPhase()
    return clearAndSetSemantics { }
        .drawWithCache {
            val w = size.width
            // One 4w-wide band per size (A9), moved under the block each frame rather than made again.
            val band = Brush.horizontalGradient(0.25f to base, 0.37f to highlight, 0.63f to base, startX = 0f, endX = 4f * w)
            onDrawBehind {
                val p = t?.value ?: return@onDrawBehind drawRect(base)
                // background-position 100% → −100% moves the band's left edge from −3w to 3w.
                val left = -3f * w * (1f - 2f * p)
                translate(left = left) { drawRect(band, topLeft = Offset(-left, 0f), size = size) }
            }
        }
}

/** Six (or `count`) StoryCards in their loading dress, as the web's FeedSkeleton. */
fun androidx.compose.foundation.lazy.LazyListScope.storyCardSkeletons(count: Int = 6, firstUnderBar: Boolean = false, layout: CardListLayout = CardListLayout.Phone) {
    if (!layout.isGrid) {
        items(count, contentType = { "storyCardSkeleton" }) { i -> StoryCardSkeleton(i, isLast = i == count - 1, isFirst = firstUnderBar && i == 0, inset = layout.inset) }
        return
    }
    // The bordered grid's skeleton: the same outlines in the same columns, the first row clear of the bar.
    item(key = "grid-skeleton") {
        androidx.compose.foundation.layout.Row(
            Modifier.fillMaxWidth().padding(horizontal = layout.gridInset).padding(top = if (firstUnderBar) LocalWindowLayout.current.gridUnderBar else 0.dp),
            horizontalArrangement = Arrangement.spacedBy(Tokens.FeedGap.dp),
        ) {
            for (c in 0 until layout.columns) {
                Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(Tokens.FeedGap.dp)) {
                    for (i in c until count step layout.columns) BorderedStoryCardSkeleton(i)
                }
            }
        }
    }
}

/**
 * Where a bordered grid's first row starts in a list that begins under the bar's wavy band (an
 * expanded window's feed): a tablet's [tabletHeaderAir] below the bar's pen line (round 5 E2), so
 * no outline is under the bar at rest.
 */
val WindowLayout.gridUnderBar: Dp get() = HeaderEdgeHeight + tabletHeaderAir(width.value) - BarLineInset

/**
 * CardDetailSkeleton.tsx: the article's own head and gaps (reading-type §11.1) — the cover at its
 * 0.52 ratio, two title lines in the title's own line boxes, the byline (the avatar and pen name
 * with no rail beside the article, else the meta line alone) in its lines, then the story's first
 * lines and a few tags — so nothing moves when the card arrives, at any text size: the title and
 * the story at the reading scale ([ReadingTextScale]) as the page draws them, the byline at the
 * app's. A CJK story's numbers (the type isn't known yet).
 */
@Composable
fun CardDetailSkeleton(modifier: Modifier = Modifier, compact: Boolean = true, byline: Boolean = true) {
    val type = StoryType(StoryScript.Cjk, compact)
    SharedShimmer {
    Column(modifier.fillMaxWidth().semantics { contentDescription = L10n.Home.moreLoading }) {
        Skeleton(Modifier.aspectRatio(1 / 0.52f), height = Dp.Unspecified, radius = 18.dp)
        Spacer(Modifier.height(type.coverGap.dp))
        // StoryTitle's line boxes (the title's size × its leading), each bar as tall as its type.
        ReadingTextScale {
            CssSkeletonLines(type.titleSize, type.titleLeading, type.titleSize.dp, Modifier.fillMaxWidth(0.9f), Modifier.fillMaxWidth(0.55f))
        }
        Spacer(Modifier.height(type.metaGap.dp))
        // StoryByline: the 40 avatar beside the pen name's line (15, 1.35) over the meta line (1.4), 2 apart; at least 44.
        Row(Modifier.heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (byline) Skeleton(height = Tokens.StoryBylineAvatar.dp, circle = true)
            Column(Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
                if (byline) SkeletonLines(AppFonts.body(15f, 600, lineHeight = 1.35f), 15.dp, Modifier.width(120.dp * textGrowth(15f)))
                SkeletonLines(AppFonts.body(type.metaSize, lineHeight = 1.4f), 14.dp, Modifier.width(160.dp * textGrowth(type.metaSize)))
            }
        }
        Spacer(Modifier.height(type.leadGap.dp))
        StorySkeleton(compact = compact)
    }
    }
}

/**
 * The lower half of [CardDetailSkeleton]: the story's first four lines in its own line boxes (its
 * size × its leading, at the reading scale, each bar as tall as its words) and a few tags — what a
 * card page still waits for once its head is drawn from the list the card was opened in.
 */
@Composable
fun StorySkeleton(modifier: Modifier = Modifier, compact: Boolean = true) {
    val type = StoryType(StoryScript.Cjk, compact)
    SharedShimmer {
        Column(modifier.fillMaxWidth()) {
            ReadingTextScale {
                CssSkeletonLines(
                    type.bodySize, type.bodyLeading, type.bodySize.dp, Modifier, Modifier, Modifier, Modifier.fillMaxWidth(0.65f),
                    modifier = Modifier.fillMaxWidth().padding(bottom = type.endGap.dp),
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                listOf(64, 84, 56).forEach { Skeleton(Modifier.width(it.dp), height = 26.dp, radius = 13.dp) }
            }
        }
    }
}

/**
 * Provides a card's own shimmer (`oklch(88% 0.08 hue)`, StoryCard.tsx's `--skeleton-highlight`) to
 * the skeletons inside it — a cover on its way included.
 */
@Composable
fun WithSkeletonHue(hue: Double, content: @Composable () -> Unit) {
    CompositionLocalProvider(LocalSkeletonHighlight provides Mixes.skeletonHighlight(hue), content = content)
}
