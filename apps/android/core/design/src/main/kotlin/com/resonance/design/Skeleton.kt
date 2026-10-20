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
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import com.resonance.kit.story.StoryScript

/** The shimmer's highlight: the theme's light accent, or a card's own hue inside a card. */
val LocalSkeletonHighlight = compositionLocalOf { Mixes.skeletonHighlight() }

/** CSS `ease`. */
private val Ease = CubicBezierEasing(0.25f, 0.1f, 0.25f, 1f)

/**
 * Skeleton.tsx: one warm placeholder block. The fill is a sand → highlight →
 * sand band four times the block's width sliding across it over 1.5s (the
 * web's 400% background from 100% to −100%); with animations removed it rests
 * as plain sand. Width comes from `modifier` (full width by default).
 */
@Composable
fun Skeleton(modifier: Modifier = Modifier, height: Dp = 14.dp, radius: Dp = 7.dp, circle: Boolean = false) {
    val sized = if (circle) modifier.size(height) else modifier.fillMaxWidth().height(height)
    Box(sized.clip(if (circle) CircleShape else RoundedCornerShape(radius)).shimmer())
}

/**
 * A picture's place while it is on its way (OrganicImage): the shimmer over the whole box, its shape the
 * frame's own clip — so a cover reads as loading, not as the striped "no picture" placeholder.
 */
@Composable
fun SkeletonCover() {
    Box(Modifier.fillMaxSize().shimmer())
}

@Composable
private fun Modifier.shimmer(): Modifier {
    val highlight = LocalSkeletonHighlight.current
    val context = LocalContext.current
    val still = remember(context) { context.prefersReducedMotion() }
    val t = if (still) null else rememberInfiniteTransition(label = "skeleton").animateFloat(
        0f, 1f, infiniteRepeatable(tween(1500, easing = Ease)), label = "shimmer",
    )
    return clearAndSetSemantics { }
        .drawBehind {
            val p = t?.value ?: return@drawBehind drawRect(Mixes.SkeletonBase)
            val w = size.width
            // background-position 100% → −100% moves the 4w-wide band's left edge from −3w to 3w.
            val left = -3f * w * (1f - 2f * p)
            drawRect(
                Brush.horizontalGradient(
                    0.25f to Mixes.SkeletonBase, 0.37f to highlight, 0.63f to Mixes.SkeletonBase,
                    startX = left, endX = left + 4f * w,
                ),
            )
        }
}

/** Six (or `count`) StoryCards in their loading dress, as the web's FeedSkeleton. */
fun androidx.compose.foundation.lazy.LazyListScope.storyCardSkeletons(count: Int = 6, firstUnderBar: Boolean = false, layout: CardListLayout = CardListLayout.Phone) {
    if (!layout.isGrid) {
        items(count) { i -> StoryCardSkeleton(i, isLast = i == count - 1, isFirst = firstUnderBar && i == 0, inset = layout.inset) }
        return
    }
    // The bordered grid's skeleton: the same outlines in the same columns, the first row clear of the bar.
    item(key = "grid-skeleton") {
        androidx.compose.foundation.layout.Row(
            Modifier.fillMaxWidth().padding(horizontal = layout.gridInset).padding(top = if (firstUnderBar) GridUnderBar else 0.dp),
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
 * expanded window's feed): a tablet's [TabletHeaderAir] below the bar's pen line (round 5 E2), so
 * no outline is under the bar at rest.
 */
val GridUnderBar = HeaderEdgeHeight + TabletHeaderAir - BarLineInset

/**
 * CardDetailSkeleton.tsx: the article's own head and gaps (reading-type §11.1) — the cover at its
 * 0.52 ratio, two title lines as tall as the title's type (28 apart 11 on a phone, 36 and 14
 * wider), the byline (the avatar and pen name with no rail beside the article, else the meta line
 * alone), then the story's first lines and a few tags — so nothing moves when the card arrives.
 * A CJK story's numbers (the type isn't known yet).
 */
@Composable
fun CardDetailSkeleton(modifier: Modifier = Modifier, compact: Boolean = true, byline: Boolean = true) {
    val type = StoryType(StoryScript.Cjk, compact)
    Column(modifier.fillMaxWidth().semantics { contentDescription = L10n.Home.moreLoading }) {
        Skeleton(Modifier.aspectRatio(1 / 0.52f), height = Dp.Unspecified, radius = 18.dp)
        Spacer(Modifier.height(type.coverGap.dp))
        Column(verticalArrangement = Arrangement.spacedBy(if (compact) 11.dp else 14.dp)) {
            Skeleton(Modifier.fillMaxWidth(0.9f), height = type.titleSize.dp)
            Skeleton(Modifier.fillMaxWidth(0.55f), height = type.titleSize.dp)
        }
        Spacer(Modifier.height(type.metaGap.dp))
        Row(Modifier.heightIn(min = 44.dp), verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            if (byline) Skeleton(height = Tokens.StoryBylineAvatar.dp, circle = true)
            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                if (byline) Skeleton(Modifier.width(120.dp), height = 15.dp)
                Skeleton(Modifier.width(160.dp), height = 14.dp)
            }
        }
        Spacer(Modifier.height(type.leadGap.dp))
        StorySkeleton(compact = compact)
    }
}

/**
 * The lower half of [CardDetailSkeleton]: the story's first lines (as tall as its words, 17 apart
 * 13.6 on a phone, 18 and 15 wider) and a few tags — what a card page still waits for once its
 * head is drawn from the list the card was opened in.
 */
@Composable
fun StorySkeleton(modifier: Modifier = Modifier, compact: Boolean = true) {
    val type = StoryType(StoryScript.Cjk, compact)
    Column(modifier.fillMaxWidth()) {
        Column(Modifier.padding(bottom = type.endGap.dp), verticalArrangement = Arrangement.spacedBy(if (compact) 13.6.dp else 15.dp)) {
            repeat(3) { Skeleton(height = type.bodySize.dp) }
            Skeleton(Modifier.fillMaxWidth(0.65f), height = type.bodySize.dp)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf(64, 84, 56).forEach { Skeleton(Modifier.width(it.dp), height = 26.dp, radius = 13.dp) }
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
