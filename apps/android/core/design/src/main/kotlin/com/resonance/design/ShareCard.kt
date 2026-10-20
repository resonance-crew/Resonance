package com.resonance.design

import android.graphics.Paint
import android.graphics.text.LineBreaker
import android.text.Layout
import android.text.SpannableString
import android.text.Spanned
import android.text.StaticLayout
import android.text.TextPaint
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.runtime.remember
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.style.LineBreak
import androidx.compose.ui.unit.Dp
import kotlin.math.max
import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Density
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.kit.l10n.L10n
import com.resonance.kit.story.StoryScript
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * What a share card draws, and nothing more (share.spec §4.5): the card's own title and the opening
 * of its story (SharePassages.opening), in the story's script; its colour family and wobble from its
 * id and cover hue; the published day; and the byline — a named author's pen name, initials,
 * photo and verified mark, or for an anonymous card [ShareByline.Anonymous], which has no person in
 * it to draw.
 */
data class ShareCardModel(
    val cardId: String,
    val title: String,
    val words: String,
    val script: StoryScript,
    val accentHue: Double?,
    /** The published day as the app writes it (2026年10月10日 / Oct 10, 2026); null: none shown. */
    val date: String?,
    val byline: ShareByline,
)

/** Who a share card says wrote it. */
sealed interface ShareByline {
    data class Named(
        val handle: String,
        val initials: String,
        val avatarSeed: Double,
        val verified: Boolean,
        /** Their photo, already loaded (a recording draws nothing that is still on its way); null: the initials. */
        val photo: ImageBitmap? = null,
    ) : ShareByline

    /** 匿名 / Anonymous over the neutral「·」: never a photo, pen name, initials, region or verified mark. */
    data object Anonymous : ShareByline
}

/**
 * The 9:16 share image (360 × 640, drawn at 3× it is 1080 × 1920): the card's family fill under the
 * band's grain, the card centred between the Stories-safe lines ([ShareCardRecipe.SafeZone]). Sizes
 * are the recipe's, never the text size's: the picture is for other people (fontScale 1 inside).
 * [cover] is the card's cover, already loaded; null draws the card without one.
 */
@Composable
fun ShareCardCanvas(model: ShareCardModel, cover: ImageBitmap?, modifier: Modifier = Modifier) {
    FixedTextSize {
        Box(modifier.size(ShareCardRecipe.Canvas.WIDTH.dp, ShareCardRecipe.Canvas.HEIGHT.dp)) {
            ShareCardBackdrop(model)
            val zone = ShareCardRecipe.SafeZone
            // Centred in the safe zone, whatever its content makes its height.
            Box(
                Modifier
                    .fillMaxWidth()
                    .offset(y = zone.TOP.dp)
                    .height((zone.BOTTOM - zone.TOP).dp),
                contentAlignment = Alignment.Center,
            ) { ShareCard(model, cover) }
        }
    }
}

/** The card alone, on nothing, [ShareCardRecipe.Sticker.MARGIN] clear all round so its wobble isn't cut: Instagram's movable sticker. */
@Composable
fun ShareCardSticker(model: ShareCardModel, cover: ImageBitmap?, modifier: Modifier = Modifier) {
    FixedTextSize {
        Box(modifier.padding(ShareCardRecipe.Sticker.MARGIN.dp)) { ShareCard(model, cover) }
    }
}

/** The backdrop alone (the card's family fill under the band's grain): Instagram's background behind the sticker. */
@Composable
fun ShareCardBackdrop(model: ShareCardModel, modifier: Modifier = Modifier) {
    val palette = ShareCardRecipe.palette(model.cardId, model.accentHue)
    Box(
        modifier
            .size(ShareCardRecipe.Canvas.WIDTH.dp, ShareCardRecipe.Canvas.HEIGHT.dp)
            .drawBehind { drawRect(palette.fill) }
            .grainOverlay(ShareCardRecipe.Backdrop.GRAIN),
    )
}

/** Inside, `sp` is `dp`: the share image is a picture, the same at any system text size. */
@Composable
private fun FixedTextSize(content: @Composable () -> Unit) {
    val d = LocalDensity.current
    CompositionLocalProvider(LocalDensity provides Density(d.density, 1f), content = content)
}

/**
 * The card itself: the desktop StoryCard's outline (R 22, the card's id as its seed, 2.5 % of its
 * shorter side) round its paper and paper grain, in the family's pen; 22 in, the cover (256 × 128,
 * an OrganicImage clip seeded + 5, its grain), the title (22 / 2 lines with a cover, 26 / 3
 * without), the opening (14, 4 or 8 lines), the wavy rule, and the byline with the wave +
 * Resonance + resonance.channel lockup at its end.
 */
@Composable
fun ShareCard(model: ShareCardModel, cover: ImageBitmap?, modifier: Modifier = Modifier) {
    val palette = ShareCardRecipe.palette(model.cardId, model.accentHue)
    val seed = ShareCardRecipe.seed(model.cardId)
    Column(
        modifier
            .width(ShareCardRecipe.Card.WIDTH.dp)
            .heightIn(max = ShareCardRecipe.Card.MAX_HEIGHT.dp)
            .drawWithCache {
                val w = (size.width / density).toDouble()
                val h = (size.height / density).toDouble()
                val outline = WobRectShape(ShareCardRecipe.Card.RADIUS.toDouble(), seed, mag = min(w, h) * ShareCardRecipe.Card.OUTLINE_MAGNITUDE, options = ShareCardRecipe.Card.OUTLINE)
                    .createOutline(size, layoutDirection, this)
                val grain = Grain.brush(GrainMode.Tile, ShareCardRecipe.Card.PAPER_GRAIN_TILE, size, density, ShareCardRecipe.Card.PAPER_GRAIN)
                val pen = Stroke(ShareCardRecipe.Card.PEN_WIDTH.dp.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                onDrawBehind {
                    drawOutline(outline, palette.interior)
                    grain?.let { drawOutline(outline, it, alpha = ShareCardRecipe.Card.PAPER_GRAIN) }
                    drawOutline(outline, palette.border, style = pen)
                }
            }
            .padding(start = ShareCardRecipe.Card.PADDING.dp, end = ShareCardRecipe.Card.PADDING.dp, top = ShareCardRecipe.Card.PADDING.dp, bottom = ShareCardRecipe.Card.PADDING_BOTTOM.dp),
    ) {
        val inner = ShareCardRecipe.Card.WIDTH - ShareCardRecipe.Card.PADDING * 2
        if (cover != null) {
            CoverPicture(cover, seed + ShareCardRecipe.Cover.SEED_OFFSET, inner, inner * ShareCardRecipe.Cover.RATIO)
            Spacer(Modifier.height(ShareCardRecipe.Cover.GAP_BELOW.dp))
        }
        val withCover = cover != null
        if (model.title.isNotBlank()) {
            BasicText(
                model.title,
                maxLines = if (withCover) ShareCardRecipe.Title.MAX_LINES_WITH_COVER else ShareCardRecipe.Title.MAX_LINES_WITHOUT_COVER,
                overflow = TextOverflow.Ellipsis,
                // Balanced, as the reader sets a title.
                style = ShareCardRecipe.titleStyle(model.script, if (withCover) ShareCardRecipe.Title.SIZE_WITH_COVER else ShareCardRecipe.Title.SIZE_WITHOUT_COVER)
                    .copy(lineBreak = LineBreak(LineBreak.Strategy.Balanced, LineBreak.Strictness.Strict, LineBreak.WordBreak.Default)),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(ShareCardRecipe.Title.GAP_BELOW.dp))
        }
        if (model.words.isNotBlank()) {
            ShareWords(model.words, model.script, if (withCover) ShareCardRecipe.Words.MAX_LINES_WITH_COVER else ShareCardRecipe.Words.MAX_LINES_WITHOUT_COVER)
            Spacer(Modifier.height(ShareCardRecipe.Words.GAP_BELOW.dp))
        }
        // StoryCardSeparator: wavyLine(width, seed + 91, 1.2, 6) in the family's rule ink.
        Box(
            Modifier.fillMaxWidth().height(ShareCardRecipe.Rule.HEIGHT.dp).drawWithCache {
                val p = wavyLinePath(size.width, size.height, density, seed + ShareCardRecipe.Rule.SEED_OFFSET, ShareCardRecipe.Rule.AMPLITUDE, ShareCardRecipe.Rule.STEPS)
                val s = Stroke(ShareCardRecipe.Rule.WIDTH.dp.toPx(), cap = StrokeCap.Round)
                onDrawBehind { drawPath(p, palette.separator, style = s) }
            },
        )
        Spacer(Modifier.height(ShareCardRecipe.Rule.GAP_BELOW.dp))
        ShareByline(model, palette)
    }
}

/**
 * The card's words in the story's body type at the recipe's size — exact CSS line boxes, a CJK
 * story's justified between characters where the device can (API 35+; Compose's own justify
 * stretches only spaces, which in Chinese are the gaps a link or a line break left), at most
 * [maxLines], cut with a tail "…" on a line of natural width, paragraph breaks kept.
 */
@Composable
private fun ShareWords(text: String, script: StoryScript, maxLines: Int) {
    val type = StoryType(script, compact = false)
    val scaled = LocalDensity.current
    BoxWithConstraints(Modifier.fillMaxWidth()) {
        val widthPx = constraints.maxWidth
        val layout = remember(text, script, maxLines, widthPx, scaled.density, scaled.fontScale) { wordsLayout(text, type, maxLines, widthPx, scaled) }
        Box(
            Modifier
                .width(Dp(layout.width / scaled.density))
                .height(Dp(layout.height / scaled.density))
                .semantics { this.text = AnnotatedString(text) }
                .drawBehind { drawIntoCanvas { layout.draw(it.nativeCanvas) } },
        )
    }
}

internal fun wordsLayout(text: String, type: StoryType, maxLines: Int, widthPx: Int, density: Density): StaticLayout {
    val paint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
        typeface = AppFonts.typeface(type.bodyFamily, type.bodyWeight)
        textSize = density.cssFontPx(ShareCardRecipe.Words.SIZE)
        color = Tokens.Text.toArgb()
        letterSpacing = type.bodyTracking
    }
    val full = wordsLayout(text, type, paint, widthPx)
    if (full.lineCount <= maxLines) return full
    // Cut after the last line that fits and end it with "…": the cut line is then the text's last,
    // set natural rather than stretched to the edge as a justified line would be; a character less
    // at a time while the "…" would push it onto a line of its own.
    var end = full.getLineEnd(maxLines - 1)
    while (end > 0) {
        val cut = wordsLayout(text.substring(0, end).trimEnd() + ELLIPSIS, type, paint, widthPx)
        if (cut.lineCount <= maxLines) return cut
        end -= Character.charCount(text.codePointBefore(end))
    }
    return wordsLayout(ELLIPSIS, type, paint, widthPx)
}

private const val ELLIPSIS = "…"

private fun wordsLayout(text: String, type: StoryType, paint: TextPaint, widthPx: Int): StaticLayout {
    val spanned = SpannableString(text).apply {
        setSpan(CssLineHeightSpan(paint.textSize * type.bodyLeading, paint.fontMetrics), 0, text.length, Spanned.SPAN_INCLUSIVE_INCLUSIVE)
    }
    val b = StaticLayout.Builder.obtain(spanned, 0, text.length, paint, max(1, widthPx))
        .setAlignment(Layout.Alignment.ALIGN_NORMAL)
        .setIncludePad(false)
        .setUseLineSpacingFromFallbacks(false)
        .setBreakStrategy(LineBreaker.BREAK_STRATEGY_SIMPLE)
        .setHyphenationFrequency(Layout.HYPHENATION_FREQUENCY_NONE)
    StoryType.applyBreaking(b, justified = type.justified)
    return b.build()
}

/** The cover in OrganicImage's clip, the picture past the box by the clip's outward swing (as [OrganicImage] does), under its grain. */
@Composable
private fun CoverPicture(cover: ImageBitmap, seed: Double, width: Float, height: Float) {
    val bleed = imageBleed(width, height, 0.05)
    Box(Modifier.size(width.dp, height.dp), contentAlignment = Alignment.Center) {
        Box(
            Modifier
                .requiredSize(width.dp + bleed * 2, height.dp + bleed * 2)
                .clip(BledShape(seed, bleed.value.toDouble()))
                .grainOverlay(ShareCardRecipe.Cover.GRAIN),
        ) {
            Image(cover, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        }
    }
}

/** The byline row (32): the avatar, the pen name (and verified mark) over the date, then the lockup at its end. */
@Composable
private fun ShareByline(model: ShareCardModel, palette: CardPalette) {
    val b = ShareCardRecipe.Byline
    Row(Modifier.fillMaxWidth().heightIn(min = b.HEIGHT.dp), verticalAlignment = Alignment.CenterVertically) {
        when (val byline = model.byline) {
            is ShareByline.Named -> HandDrawnAvatar(byline.initials, color = palette.fill, size = b.AVATAR.dp, seed = byline.avatarSeed, image = byline.photo)
            ShareByline.Anonymous -> HandDrawnAvatar(ShareCardRecipe.Anonymous.INITIALS, color = ShareCardRecipe.Anonymous.FILL, size = b.AVATAR.dp, seed = ShareCardRecipe.Anonymous.SEED)
        }
        Spacer(Modifier.width(b.GAP.dp))
        Column(Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                when (val byline = model.byline) {
                    is ShareByline.Named -> {
                        BasicText(
                            byline.handle, maxLines = 1, overflow = TextOverflow.Ellipsis,
                            style = AppFonts.body(b.NAME_SIZE, b.NAME_WEIGHT, lineHeight = b.NAME_LEADING),
                            modifier = Modifier.weight(1f, fill = false),
                        )
                        if (byline.verified) {
                            Spacer(Modifier.width(b.VERIFIED_GAP.dp))
                            OrganicIcon(IconName.Verified, size = b.VERIFIED_SIZE.dp, color = Tokens.Sage, strokeWidth = 1.8f)
                        }
                    }
                    ShareByline.Anonymous -> BasicText(
                        L10n.Card.anonymousAuthor, maxLines = 1,
                        style = AppFonts.body(b.NAME_SIZE, b.NAME_WEIGHT, lineHeight = b.NAME_LEADING, color = ShareCardRecipe.Anonymous.NAME_COLOUR),
                    )
                }
            }
            model.date?.let {
                BasicText(it, maxLines = 1, style = AppFonts.body(b.DATE_SIZE, b.DATE_WEIGHT, lineHeight = 1.3f, color = Tokens.TextMuted))
            }
        }
        Spacer(Modifier.width(b.MIN_SPACE.dp))
        ShareLockup()
    }
}

/** The wave and Resonance over resonance.channel, right-aligned: where a feed card has its →. */
@Composable
private fun ShareLockup() {
    val l = ShareCardRecipe.Lockup
    Column(horizontalAlignment = Alignment.End) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            // The one pen at the size it is seen: the glyph's 24-unit box drawn 16 wide.
            OrganicIcon(l.WAVE, size = l.WAVE_SIZE.dp, color = Tokens.Terracotta, strokeWidth = l.WAVE_WIDTH * 24f / l.WAVE_SIZE)
            Spacer(Modifier.width(l.GAP.dp))
            BasicText(
                l.WORDMARK, maxLines = 1,
                style = AppFonts.style(AppFonts.Family.Heading, l.WORDMARK_SIZE, l.WORDMARK_WEIGHT, 1.2f, Tokens.Text, l.WORDMARK_TRACKING.em),
            )
        }
        BasicText(
            l.DOMAIN, maxLines = 1,
            style = AppFonts.style(AppFonts.Family.Body, l.DOMAIN_SIZE, l.DOMAIN_WEIGHT, 1.3f, Tokens.TextMuted, l.DOMAIN_TRACKING.em),
        )
    }
}

/** The share canvas's size in pixels at [scale] (3: the 1080 × 1920 composite). */
fun shareCanvasPixels(scale: Float = ShareCardRecipe.Canvas.SCALE): Pair<Int, Int> =
    (ShareCardRecipe.Canvas.WIDTH * scale).roundToInt() to (ShareCardRecipe.Canvas.HEIGHT * scale).roundToInt()

/** The sticker's width in pixels at its scale: the card and its margin on both sides (624). */
fun shareStickerWidth(scale: Float = ShareCardRecipe.Sticker.SCALE): Int =
    ((ShareCardRecipe.Card.WIDTH + ShareCardRecipe.Sticker.MARGIN * 2) * scale).roundToInt()
