package com.resonance.design

// The text and picture leaves as they were before A3 (BoxWithConstraints), kept verbatim as the
// reference the new ones are compared with, pixel for pixel and size for size (LeavesWithoutSubcompositionTest).

import android.graphics.RectF
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.requiredSize
import androidx.compose.foundation.layout.width
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.draw.drawWithContent
import androidx.compose.foundation.layout.size
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.drawIntoCanvas
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.nativeCanvas
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.text
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import coil3.compose.AsyncImage
import com.resonance.design.generated.Tokens
import com.resonance.kit.story.InlineRun
import kotlin.math.ceil
import kotlin.math.min
import kotlin.math.roundToInt

@Composable
internal fun RefCssText(
    text: String,
    family: AppFonts.Family,
    sizeSp: Float,
    weight: Int = 400,
    lineHeight: Float = 1.5f,
    color: Color = Tokens.Text,
    modifier: Modifier = Modifier,
    /** CSS letter-spacing, in em. */
    letterSpacing: Float = 0f,
    /** Take the text's own width (a bubble shrink-wrapping its words) rather than all that's offered. */
    fitsContent: Boolean = false,
) {
    val scaled = LocalDensity.current
    val density = scaled.density
    BoxWithConstraints(modifier) {
        val widthPx = constraints.maxWidth
        val layout = remember(text, family, sizeSp, weight, lineHeight, widthPx, density, scaled.fontScale, color, letterSpacing, AppFonts.useBundledCJK) {
            CssLayout.build(text, family, sizeSp, weight, lineHeight, widthPx, scaled, color, letterSpacing)
        }
        // The widest line without its trailing space, rounded up to a whole pixel (the iOS twin's `ceil`).
        val boxPx = if (fitsContent) minOf(layout.width, ceil((0 until layout.lineCount).maxOfOrNull { layout.getLineMax(it) } ?: 0f).toInt()) else layout.width
        Box(
            Modifier
                .width((boxPx / density).let { androidx.compose.ui.unit.Dp(it) })
                .height(androidx.compose.ui.unit.Dp(layout.height / density))
                .semantics { this.text = AnnotatedString(text) }
                .drawBehind { drawIntoCanvas { layout.draw(it.nativeCanvas) } },
        )
    }
}

@Composable
internal fun RefChatText(
    text: String,
    modifier: Modifier = Modifier,
    sizeSp: Float = 15f,
    weight: Int = 400,
    lineHeight: Float = 1.4f,
    color: Color = Tokens.Text,
    links: List<IntRange> = emptyList(),
    linkColor: Color = Tokens.Terracotta,
    highlights: List<IntRange> = emptyList(),
    highlightColor: Color = highlightWash(false),
    /** The highlighted words in a heavier face (a search result's match). */
    highlightWeight: Int? = null,
    maxLines: Int = Int.MAX_VALUE,
    onTap: ((Int) -> Unit)? = null,
    onLongPress: ((Int?) -> Unit)? = null,
) {
    val scaled = LocalDensity.current
    val density = scaled.density
    val tap by rememberUpdatedState(onTap)
    val press by rememberUpdatedState(onLongPress)
    BoxWithConstraints(modifier) {
        val widthPx = constraints.maxWidth
        val layout = remember(text, sizeSp, weight, lineHeight, widthPx, density, scaled.fontScale, color, linkColor, links, highlights, highlightWeight, maxLines, AppFonts.useBundledCJK) {
            buildChatLayout(text, sizeSp, weight, lineHeight, widthPx, scaled, color, links, linkColor, highlightWeight.takeIf { highlights.isNotEmpty() }?.let { highlights to it }, maxLines)
        }
        val widest = ceil((0 until layout.lineCount).maxOfOrNull { layout.getLineMax(it) } ?: 0f).toInt()
        val boxPx = min(layout.width, widest)
        val hit: (Float, Float) -> Int? = { x, y -> linkAt(layout, links, x, y, 6f * density) }
        val sizePx = scaled.cssFontPx(sizeSp)
        val waves = remember(layout, links, sizePx, density) { chatLinkWaves(layout, links, sizePx, density) }
        var pressed by remember { mutableStateOf<Int?>(null) }
        // The story links' pen wave, as the leaves now draw it (--link-wave).
        val wave = Tokens.LinkWave
        Box(
            Modifier
                .width(Dp(boxPx / density))
                .height(Dp(layout.height / density))
                .semantics { this.text = AnnotatedString(text) }
                .drawBehind {
                    if (highlights.isNotEmpty()) {
                        val r = 4.dp.toPx()
                        val lift = cssFontPx(sizeSp) * 1.3f
                        for (rect in highlightRects(layout, highlights, lift, 2.dp.toPx())) {
                            drawRoundRect(highlightColor, androidx.compose.ui.geometry.Offset(rect.left, rect.top), Size(rect.width(), rect.height()), androidx.compose.ui.geometry.CornerRadius(r))
                        }
                    }
                    // The waves under the letters, as the story's: a descender rests in an arch rather than being crossed.
                    if (waves.isNotEmpty()) {
                        val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                        waves.forEach { w ->
                            translate(w.x, w.y) { drawPath(w.path, wave, alpha = if (w.link == pressed) 1f else 0.7f, style = pen) }
                        }
                    }
                    drawIntoCanvas { layout.draw(it.nativeCanvas) }
                }
                .then(
                    if (onTap != null || onLongPress != null) Modifier.pointerInput(layout, links) {
                        detectTapGestures(
                            // The pen presses harder while the finger is on a link: the web's hover.
                            onPress = { p ->
                                pressed = hit(p.x, p.y)
                                tryAwaitRelease()
                                pressed = null
                            },
                            onTap = { p -> hit(p.x, p.y)?.let { i -> tap?.invoke(i) } },
                            onLongPress = { p -> press?.invoke(hit(p.x, p.y)) },
                        )
                    } else Modifier,
                ),
        )
    }
}

@Composable
internal fun RefRichCssText(runs: List<InlineRun>, style: ProseStyle, onOpenUrl: (String) -> Unit, modifier: Modifier = Modifier) {
    val scaled = LocalDensity.current
    val density = scaled.density
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val widthPx = constraints.maxWidth
        val (layout, spanned) = remember(runs, style, widthPx, density, scaled.fontScale) { buildRichLayout(runs, style, widthPx, scaled) }
        val plain = remember(runs, style.lang) { proseSemantics(runs.joinToString("") { it.text }, style.lang) }
        val sizePx = scaled.cssFontPx(style.size)
        val strokes = remember(layout, spanned, sizePx, density) { linkStrokes(layout, spanned, sizePx, density) }
        var pressedUrl by remember { mutableStateOf<String?>(null) }
        val linkInk = Tokens.LinkWave
        Box(
            Modifier
                .width(Dp(layout.width / density))
                .height(Dp(layout.height / density))
                .semantics { this.text = plain }
                .then(if (strokes.isEmpty()) Modifier else Modifier.pointerInput(layout) {
                    fun linkAt(p: androidx.compose.ui.geometry.Offset): LinkSpan? {
                        val line = layout.getLineForVertical(p.y.roundToInt())
                        val offset = layout.getOffsetForHorizontal(line, p.x)
                        return spanned.getSpans(offset, offset, LinkSpan::class.java).firstOrNull()
                    }
                    detectTapGestures(
                        onPress = { p ->
                            // The pen presses harder while the finger is down: the web's hover.
                            pressedUrl = linkAt(p)?.url
                            tryAwaitRelease()
                            pressedUrl = null
                        },
                    ) { p -> linkAt(p)?.let { onOpenUrl(it.url) } }
                })
                .drawBehind {
                    // The waves first, under the letters (the web paints them as the link's background):
                    // a descender's foot rests in its arch rather than being crossed by it.
                    val pen = Stroke(Tokens.Ink.toPx(), cap = StrokeCap.Round, join = StrokeJoin.Round)
                    strokes.forEach { s ->
                        translate(s.x, s.y) { drawPath(s.wave, linkInk, alpha = if (s.url == pressedUrl) 1f else 0.7f, style = pen) }
                    }
                    drawIntoCanvas { layout.draw(it.nativeCanvas) }
                },
        )
    }
}

@Composable
internal fun RefStoryTitle(text: String, type: StoryType, lang: String?, modifier: Modifier = Modifier) {
    val scaled = LocalDensity.current
    val density = scaled.density
    val style = ProseStyle.title(type, lang)
    BoxWithConstraints(modifier.fillMaxWidth()) {
        val widthPx = constraints.maxWidth
        val layout = remember(text, style, widthPx, density, scaled.fontScale, AppFonts.useBundledCJK) {
            titleLayout(text, style, widthPx, scaled, clauses = type.cjk)
        }
        val read = remember(text, lang) { proseSemantics(text, lang) }
        Box(
            Modifier
                .width(Dp(layout.width / density))
                .height(Dp(layout.height / density))
                .semantics { this.text = read }
                .drawBehind { drawIntoCanvas { layout.draw(it.nativeCanvas) } },
        )
    }
}

@Composable
internal fun RefOrganicImage(
    url: String?,
    seed: Double,
    modifier: Modifier = Modifier,
    contentDescription: String? = null,
    grain: Float = 0f,
    radius: Double = 18.0,
    magFactor: Double = 0.05,
    /** The picture couldn't be loaded (the placeholder stays); a caller may drop the frame altogether. */
    onError: (() -> Unit)? = null,
    /** Laid over the picture, inside the same clip (a picked card's wash and tick). */
    overlay: (@Composable () -> Unit)? = null,
    placeholder: @Composable () -> Unit,
) {
    BoxWithConstraints(modifier) {
        val bleed = imageBleed(maxWidth.value, maxHeight.value, magFactor)
        Box(
            Modifier
                .requiredSize(maxWidth + bleed * 2, maxHeight + bleed * 2)
                .clip(BledShape(seed, bleed.value.toDouble(), radius, magFactor))
                .then(if (grain > 0f) Modifier.grainOverlay(grain) else Modifier),
        ) {
            var loading by remember(url) { mutableStateOf(url != null) }
            if (loading) SkeletonCover() else placeholder()
            if (url != null) AsyncImage(
                model = url, contentDescription = contentDescription, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize(),
                onLoading = { loading = true },
                onSuccess = { loading = false },
                onError = { loading = false; onError?.invoke() },
            )
            overlay?.invoke()
        }
    }
}

// OrganicRadio and SquareFlag as they were before A14 (their outlines built on every draw).

@Composable
internal fun RefOrganicRadio(selected: Boolean, seed: Double = 21.0, modifier: Modifier = Modifier) {
    val dot by androidx.compose.animation.core.animateFloatAsState(if (selected) 1f else 0f, androidx.compose.animation.core.spring(dampingRatio = 0.7f, stiffness = 600f), label = "radio")
    val ring = if (selected) Tokens.TerracottaDeep else Tokens.ToggleOffStroke
    val inked = Tokens.Terracotta
    androidx.compose.foundation.Canvas(modifier.size(22.dp).clearAndSetSemantics { }) {
        val ringOutline = WobCircleShape(seed, com.resonance.geometry.WobCircleOptions(segments = 7, mag = 0.7, cpJitter = 0.4))
            .createOutline(size, layoutDirection, this)
        drawOutline(ringOutline, ring, style = Stroke(Tokens.Ink.toPx()))
        if (dot > 0.01f) {
            val inset = 5.5.dp.toPx()
            val d = (size.width - inset * 2) * (0.2f + 0.8f * dot)
            val o = WobCircleShape(seed + 5, com.resonance.geometry.WobCircleOptions(segments = 6, mag = 0.5, cpJitter = 0.3))
                .createOutline(androidx.compose.ui.geometry.Size(d, d), layoutDirection, this)
            val off = (size.width - d) / 2
            drawContext.transform.translate(off, off)
            drawOutline(o, inked, alpha = dot)
            drawContext.transform.translate(-off, -off)
        }
    }
}

@Composable
internal fun RefSquareFlag(code: String, size: Dp = 18.dp, seed: Double? = null) {
    val c = code.lowercase()
    val art = FlagArt[c] ?: return
    val s = size.value.toDouble()
    val shape = remember(c, s, seed) {
        WobRectShape(s * 0.3, seed ?: com.resonance.geometry.seedFromString(c).toDouble(), mag = s * 0.05, options = com.resonance.geometry.WobRectOptions(
            curve = 1.6, cornerJitter = 3.0, cornerOffset = s * 0.06, segmentsH = com.resonance.geometry.SegValue.Count(1.0), segmentsV = com.resonance.geometry.SegValue.Count(1.0),
        ))
    }
    val pad = maxOf(1.0, s * 0.06).dp
    Box(
        Modifier
            .size(size)
            .clearAndSetSemantics { }
            .drawWithContent {
                drawContent()
                drawOutline(shape.createOutline(this.size, layoutDirection, this), FlagRim, style = Stroke(Tokens.InkLight.toPx(), join = StrokeJoin.Round))
            }
            .clip(shape),
        contentAlignment = androidx.compose.ui.Alignment.Center,
    ) {
        androidx.compose.foundation.Image(androidx.compose.ui.res.painterResource(art), contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.requiredSize(size + pad * 2))
    }
}
