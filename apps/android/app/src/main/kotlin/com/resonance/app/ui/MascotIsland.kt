package com.resonance.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.os.Build
import android.util.Log
import android.view.MotionEvent
import android.view.View
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.lazy.LazyListState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.runtime.snapshots.Snapshot
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.translate
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEvent
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.input.pointer.changedToDownIgnoreConsumed
import androidx.compose.ui.input.pointer.changedToUpIgnoreConsumed
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.layout
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.PointerInputModifierNode
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalViewConfiguration
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.resonance.app.DebugLaunch
import com.resonance.design.MascotMarks
import com.resonance.design.borderedCardOutline
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.generated.Tokens
import com.resonance.design.prefersReducedMotion
import com.resonance.design.toPath
import com.resonance.geometry.PathCommand
import com.resonance.geometry.wavyLine
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.double
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import kotlin.math.abs
import kotlin.math.ceil
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.roundToInt

/**
 * The paper puppets on a reading screen (round 19: 「偶爾會出現的小精靈」 on the home feed and a card's
 * page, only while 外觀's 小紙團 is on): the web's own stage (src/lib/mascots) running in the bundled
 * mascot island (`native/mascots/dist/mascots.html`, an asset) in a transparent WebView laid over the
 * scrolling list, under the bars, menus and toasts, that takes no focus and is not in the
 * accessibility tree. The screen marks its views ([MascotMarks], read through LocalMascotMarks by
 * the cards, the story and the screen's own parts); the island is handed them as a ReadingScene
 * ([MascotScene]) once a scroll has come to rest or what is marked changed — never per frame.
 *
 * Scrolling: the puppets' layer is moved by the WebView's own translation while the list moves, in
 * the frame the list moves in (one visible item's offset against where it was when the island last
 * placed its layer), and the island is told the new scroll once the list has come to rest
 * (`mascots.scroll`), the translation taken back once it says it has drawn that (`scrolled`). The
 * WebView reaches a screen above and below the overlay ([screenAround], the island told what of it is
 * out of view with `mascots.inset`), so a puppet carried in from an edge while the list moves is
 * already drawn there.
 *
 * Taps (round 20, the owner: 「可以讓它變成可以互動的呢」): a tap on a puppet — inside the places the
 * island says a tap reaches one (`hits`) — is the puppet's (`mascots.tap`), never the card's under
 * it; every other touch, and a tap while the layer is shifted (the list moving, the island not yet
 * caught up), goes to the list as before ([MascotTapElement]).
 *
 * Created only when the screen shows with the switch on; paused while the app is in the background,
 * stopped and destroyed with the screen.
 */
@Composable
internal fun MascotOverlay(
    list: LazyListState,
    marks: MascotMarks,
    /** What lies under the bars at the top and the foot (out of view). */
    insetTop: Dp,
    insetBottom: Dp,
    /** The contents rail beside the story (a tablet's card page): no places in that margin. */
    rail: Boolean = false,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val island = remember { MascotIsland(context) }
    DisposableEffect(island) {
        Log.i(TAG, "island created")
        onDispose {
            island.destroy()
            Log.i(TAG, "island destroyed")
        }
    }
    MascotLook(island)

    var frame by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var size by remember { mutableStateOf(IntSize.Zero) }
    // How far (dp) the WebView reaches past the overlay above and below: a screen each way.
    val reach = size.height / density.density
    LaunchedEffect(insetTop, insetBottom, reach) {
        if (reach > 0) island.call("mascots.inset(${num(reach + insetTop.value)}, ${num(reach + insetBottom.value)})")
    }
    val tracker = remember { ScrollTracker() }
    // The list's offset since the island was opened (dp), kept from frame to frame by an item both frames show.
    LaunchedEffect(list) {
        snapshotFlow { list.layoutInfo.visibleItemsInfo.map { it.key to it.offset } }.collect { tracker.moved(it, density.density) }
    }
    val railNow by rememberUpdatedState(rail)
    // At rest (a scroll ended, or the marks changed and stayed so a moment): where the island's layer is, and its scene.
    LaunchedEffect(list, marks) {
        @OptIn(FlowPreview::class)
        combine(snapshotFlow { list.isScrollInProgress }, marks.version, snapshotFlow { size }) { moving, v, s -> Triple(moving, v, s) }
            .distinctUntilChanged()
            .collectLatest { (moving, _, s) ->
                if (moving || s == IntSize.Zero) return@collectLatest
                delay(REST_MS)
                // Looked at again a moment later, and placed again while it differs: what was read may still have been
                // moving without the list scrolling — a pull to refresh springing back, cards rising in (round 20: a
                // scene read mid-spring left every place a pull's height below its card until the next scroll).
                var last: String? = null
                repeat(SETTLE_CHECKS) {
                    val overlay = frame?.takeIf { it.isAttached } ?: return@collectLatest
                    val anchor = list.layoutInfo.visibleItemsInfo.firstOrNull() ?: return@collectLatest
                    val y = tracker.y
                    val scene = MascotScene.of(sceneParts(overlay, marks, density.density), s.width / density.density, s.height / density.density, railNow)
                    val text = scene.toString()
                    if (text == last) return@collectLatest
                    last = text
                    if (Log.isLoggable(TAG, Log.DEBUG)) Log.d(TAG, "scene at $y: $text")
                    island.place(y, s.height / density.density, ScrollTracker.Anchor(anchor.key, anchor.offset, y), scene)
                    delay(SETTLE_MS)
                }
            }
    }
    MascotDebugCalls(island)

    // The layer's shift now (px): the list's move since what the island last drew.
    val shift = {
        val shown = island.shown
        val now = shown?.let { a -> list.layoutInfo.visibleItemsInfo.firstOrNull { it.key == a.key } }
        when {
            shown == null -> 0f
            now != null -> (now.offset - shown.offset).toFloat()
            else -> -(tracker.y - shown.y) * density.density
        }
    }
    val taps = remember(island, list) {
        object : MascotTapTarget {
            override fun at(position: Offset): Offset? {
                // Shifted (moving, or not yet redrawn where it rests): what the island said is stale — the list's tap.
                if (list.isScrollInProgress || island.placing) return null
                val d = density.density
                val reachNow = (frame?.size?.height ?: return null) / d
                return island.hitAt(Offset(position.x / d, (position.y - shift()) / d + reachNow))
            }

            override fun tap(point: Offset) = island.tap(point)
        }
    }
    val slop = LocalViewConfiguration.current.touchSlop
    Box(
        modifier
            // The island takes no touch of its own: what is under it gets every one but a tap on a puppet.
            .then(MascotTapElement(taps, slop))
            .onGloballyPositioned { frame = it; size = it.size }
            .graphicsLayer { translationY = shift() },
    ) {
        AndroidView(factory = { island.webView }, modifier = Modifier.screenAround())
    }
}

/** How long a scroll (or the marks) must stay still before the island is told. */
private const val REST_MS = 200L
/** At rest, the scene is read again this often, at most this many times, until two readings agree. */
private const val SETTLE_MS = 300L
private const val SETTLE_CHECKS = 6
private const val TAG = "Mascots"

/** A number for a JavaScript call: plain, never NaN or ∞. */
private fun num(v: Float): String = if (v.isFinite()) v.toString() else "0"

/** The WebView a screen taller above and below its frame (laid out as the frame): what scrolls in is already drawn. */
private fun Modifier.screenAround(): Modifier = layout { measurable, constraints ->
    val w = constraints.maxWidth
    val h = if (constraints.hasBoundedHeight) constraints.maxHeight else 0
    val placeable = measurable.measure(Constraints.fixed(w, h * 3))
    layout(w, h) { placeable.place(0, -h) }
}

/** The app's scheme and its "Remove animations", followed live; away from the screen (the app in the background), the stage sleeps. */
@Composable
private fun MascotLook(island: MascotIsland) {
    val context = LocalContext.current
    val dark = LocalResonanceColors.current.dark
    val reduced = context.prefersReducedMotion()
    LaunchedEffect(dark) { island.call("mascots.theme('${if (dark) "dark" else "light"}')") }
    LaunchedEffect(reduced) { island.call("mascots.reducedMotion($reduced)") }
    val lifecycle = LocalLifecycleOwner.current.lifecycle
    DisposableEffect(lifecycle) {
        val watch = LifecycleEventObserver { _, e ->
            when (e) {
                Lifecycle.Event.ON_STOP -> island.call("mascots.pause()")
                Lifecycle.Event.ON_START -> island.call("mascots.resume()")
                else -> {}
            }
        }
        lifecycle.addObserver(watch)
        onDispose { lifecycle.removeObserver(watch) }
    }
}

/**
 * Debug builds: the screen checks' calls (`--es mascotJs`: a visit at a chosen place, the stage's
 * time run on), each taken once by the island on screen, run once it has drawn its first scene (so
 * a call sent with the launch isn't lost to a stage with no places yet) — never again on a later
 * scene, and never retried: a visit to a place the screen hasn't is answered false, and that's all.
 */
@Composable
private fun MascotDebugCalls(island: MascotIsland) {
    LaunchedEffect(island) {
        for (js in DebugLaunch.mascotCalls) {
            snapshotFlow { island.sceneSent }.first { it }
            delay(DEBUG_SETTLE_MS)
            island.call(js) { Log.i(TAG, "$js → $it") }
        }
    }
}

/** A launch's call waits this long past the first scene, for the island to have laid it out. */
private const val DEBUG_SETTLE_MS = 400L

/** The marked views in the overlay's own dp, by their keys (cards, their title and author row, the story's parts). */
private fun sceneParts(overlay: LayoutCoordinates, marks: MascotMarks, density: Float): MascotScene.Parts {
    val rects = LinkedHashMap<String, Rect>()
    val edges = HashMap<String, Any>()
    for ((key, mark) in marks.attached()) {
        val r = runCatching { overlay.localBoundingBoxOf(mark.coordinates, clipBounds = false) }.getOrNull() ?: continue
        rects[key] = Rect(r.left / density, r.top / density, r.right / density, r.bottom / density)
        mark.extra?.let { edges[key] = it }
    }
    val line = marks.titleLine?.let { l -> Rect(l.left / density, l.top / density, l.right / density, l.bottom / density) }
    return MascotScene.Parts(rects, edges, line)
}

/**
 * Settings → 外觀's strip under the 小紙團 row (round 20, the owner: 「在設定的頁面這裡也放一隻小精靈」,
 * so it is plain what the switch is — 「讓它在下面走來走去」): a floor drawn in the light pen and the
 * island over it, a WebView of its own, as wide as the strip and [STRIP_HEADROOM] taller, reaching up
 * over the row above (drawn over it, not taking room) so a raised arm is never cut off. Off ([on]
 * false), one puppet naps on the floor; on, they walk along it, meet and point at the switch
 * ([control]); flipping it wakes the napper or sends everyone off and one back to nap (the island's
 * settleStrip). It scrolls with the list as any row; a tap on the strip, or on a puppet over the row
 * above, is the puppet's (`mascots.tap`), never blocking the list's scroll; anything else above it
 * goes to the row. Decorative: hidden from TalkBack.
 */
@Composable
internal fun MascotStrip(on: Boolean, control: LayoutCoordinates?, modifier: Modifier = Modifier) {
    val context = LocalContext.current
    val density = LocalDensity.current
    val island = remember { MascotIsland(context) }
    DisposableEffect(island) {
        Log.i(TAG, "strip island created")
        onDispose {
            island.destroy()
            Log.i(TAG, "strip island destroyed")
        }
    }
    MascotLook(island)
    // The web's strip: 116 tall, 104 on a phone's width (< 480).
    val stripHeight = if (LocalConfiguration.current.screenWidthDp >= 480) 116.dp else 104.dp
    var width by remember { mutableStateOf(0f) }
    var switchAt by remember { mutableStateOf<Rect?>(null) }
    LaunchedEffect(Unit) { island.call("mascots.inset(${STRIP_HEADROOM - 10}, 0)") }
    // On appear, on a new size, where the switch is and whenever it flips.
    LaunchedEffect(width, switchAt, on, stripHeight) {
        if (width <= 0f) return@LaunchedEffect
        val scene = MascotScene.strip(width, stripHeight.value, switchAt, asleep = !on)
        island.call("mascots.scene($scene, 0)")
        island.sceneSent = true
    }
    MascotDebugCalls(island)
    val taps = remember(island) {
        object : MascotTapTarget {
            override fun at(position: Offset): Offset? {
                val p = Offset(position.x / density.density, position.y / density.density)
                // The strip itself has nothing under it: a tap anywhere there is the puppets'; above it, only on one.
                return if (p.y >= STRIP_HEADROOM) p else island.hitAt(p)
            }

            override fun tap(point: Offset) = island.tap(point)
        }
    }
    val slop = LocalViewConfiguration.current.touchSlop
    val floor = Tokens.FieldBorderHover.copy(alpha = 0.55f)
    // One layout node: the strip's room, its floor, and the web view reaching up over the row above — so the
    // column sees it share a press with that row ([MascotTapElement] in its own chain).
    Box(
        modifier
            .fillMaxWidth()
            .height(stripHeight)
            .clearAndSetSemantics { }
            .onGloballyPositioned { strip ->
                width = strip.size.width / density.density
                val c = control?.takeIf { it.isAttached && strip.isAttached } ?: return@onGloballyPositioned
                val r = strip.localBoundingBoxOf(c, clipBounds = false)
                val d = density.density
                // In the web view's dp: it starts STRIP_HEADROOM above the strip.
                val next = Rect(r.left / d, r.top / d + STRIP_HEADROOM, r.right / d, r.bottom / d + STRIP_HEADROOM).round1()
                if (next != switchAt) switchAt = next
            }
            // The floor: wavyLine(240, 31, 1.1, 9) stretched across, 4 in from each end, its middle 12 above the foot.
            .drawWithCache {
                val d = density.density
                val w = size.width / d - 8
                val line = wavyLine(max(1.0, w.toDouble()), 31.0, 1.1, 9).toPath(d)
                val pen = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
                onDrawBehind { translate(4 * d, size.height - 12 * d) { drawPath(line, floor, style = pen) } }
            }
            // Up over the row above by the headroom, drawn over it (the strip's own room is unchanged).
            .layout { measurable, constraints ->
                val up = (STRIP_HEADROOM * density.density).roundToInt()
                val placeable = measurable.measure(Constraints.fixed(constraints.maxWidth, constraints.maxHeight + up))
                layout(constraints.maxWidth, constraints.maxHeight) { placeable.place(0, -up) }
            }
            .then(MascotTapElement(taps, slop)),
    ) {
        AndroidView(factory = { island.webView }, modifier = Modifier.fillMaxSize())
    }
}

/** Dp the strip's web view reaches above the strip (settingsStage.ts STRIP_HEADROOM): a raised arm, never a body. */
internal const val STRIP_HEADROOM = 24

private fun Rect.round1(): Rect = Rect(r1(left), r1(top), r1(right), r1(bottom))
private fun r1(v: Float): Float = (v * 10).roundToInt() / 10f

/**
 * The list's scroll as one number (dp, down the content): a lazy list has none of its own, so each
 * frame's move is read off an item both it and the frame before show ([delta]); a jump with none in
 * common (a scroll to the top) moves it by nothing, and the next scene places everything afresh.
 */
internal class ScrollTracker {
    /** Where the island's layer was placed: the item read then, its offset (px) and the scroll (dp). */
    data class Anchor(val key: Any, val offset: Int, val y: Float)

    var y = 0f
        private set
    private var last: List<Pair<Any, Int>> = emptyList()

    fun moved(now: List<Pair<Any, Int>>, density: Float) {
        y += delta(last, now) / density
        last = now
    }

    companion object {
        /** How far (px) the content went up between two frames' visible items (key to offset): 0 with none in common. */
        fun delta(before: List<Pair<Any, Int>>, now: List<Pair<Any, Int>>): Float {
            if (before.isEmpty()) return 0f
            val was = before.toMap()
            val common = now.firstOrNull { it.first in was } ?: return 0f
            return (was.getValue(common.first) - common.second).toFloat()
        }
    }
}

/** What the island tells the app (native/mascots/src/island.ts): each a JSON object with a `type`. */
internal sealed interface MascotMessage {
    /** Where a tap reaches a puppet, in the web view's own dp (a fingertip's slop included); empty once nobody is there. */
    data class Hits(val rects: List<Rect>) : MascotMessage

    /** A `mascots.scroll(y)` has been drawn. */
    data class Scrolled(val y: Double) : MascotMessage

    companion object {
        /** The message, or null for one this build doesn't know (or can't read). */
        fun parse(json: String): MascotMessage? = runCatching {
            val o = Json.parseToJsonElement(json).jsonObject
            when (o["type"]?.jsonPrimitive?.content) {
                "hits" -> Hits(o["rects"]!!.jsonArray.mapNotNull { r ->
                    val v = r.jsonArray.map { it.jsonPrimitive.double.toFloat() }
                    if (v.size < 4) null else Rect(v[0], v[1], v[0] + v[2], v[1] + v[3])
                })
                "scrolled" -> Scrolled(o["y"]!!.jsonPrimitive.double)
                else -> null
            }
        }.getOrNull()
    }
}

/**
 * The island's WebView and the calls into it, held until its page has loaded (each a line of the
 * island's API: native/mascots/src/island.ts), and what it says back ([MascotMessage], through the
 * `MascotsBridge` interface).
 */
internal class MascotIsland(context: Context) {
    /** Where the island's layer now stands (what it last drew): the overlay's translation is reckoned from it. */
    var shown: ScrollTracker.Anchor? by mutableStateOf(null)
        private set

    /** A scene has been handed over (the debug calls wait for one). */
    var sceneSent by mutableStateOf(false)

    /** Where a tap reaches a puppet now (the web view's dp), as the island last said. */
    var hits: List<Rect> = emptyList()
        private set
    private var ready = false
    private val pending = ArrayList<Pair<String, ((String) -> Unit)?>>()
    /** Scrolls handed to the island and not yet drawn: the island's scroll, and the anchor read for it. */
    private val sent = ArrayDeque<Pair<Double, ScrollTracker.Anchor>>()

    /** A scroll is on its way to the island: its layer isn't yet where the list is. */
    val placing: Boolean get() = sent.isNotEmpty()

    @SuppressLint("SetJavaScriptEnabled")
    val webView: WebView = TouchlessWebView(context).apply {
        settings.javaScriptEnabled = true
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        @Suppress("DEPRECATION")
        settings.allowFileAccessFromFileURLs = false
        @Suppress("DEPRECATION")
        settings.allowUniversalAccessFromFileURLs = false
        settings.setGeolocationEnabled(false)
        // Its scheme comes from the app (mascots.theme): the browser never darkens it on its own.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) settings.isAlgorithmicDarkeningAllowed = false
        else {
            @Suppress("DEPRECATION")
            settings.forceDark = WebSettings.FORCE_DARK_OFF
        }
        setBackgroundColor(AndroidColor.TRANSPARENT)
        isVerticalScrollBarEnabled = false
        isHorizontalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        webViewClient = object : WebViewClient() {
            // The island loads nothing but itself.
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest) = true
            override fun onPageFinished(view: WebView, url: String?) {
                ready = true
                pending.forEach { (js, then) -> view.evaluateJavascript(js) { then?.invoke(it) } }
                pending.clear()
                pendingRuns.forEach { it() }
                pendingRuns.clear()
            }
        }
        addJavascriptInterface(Bridge(), "MascotsBridge")
        loadUrl("file:///android_asset/mascots.html")
    }

    fun call(js: String, then: ((String) -> Unit)? = null) {
        if (ready) webView.evaluateJavascript(js) { then?.invoke(it) } else pending += js to then
    }

    /**
     * [js], then [drawn] on the main thread as soon as the WebView's next draw shows what it did
     * (`postVisualStateCallback`: asked after the script, answered once the page has a frame with its
     * changes ready to draw).
     */
    private fun callThenDrawn(js: String, drawn: () -> Unit) {
        val run = {
            webView.evaluateJavascript(js, null)
            webView.postVisualStateCallback(++visualToken, object : WebView.VisualStateCallback() {
                override fun onComplete(requestId: Long) = drawn()
            })
        }
        if (ready) run() else pendingRuns += run
    }
    private var visualToken = 0L
    private val pendingRuns = ArrayList<() -> Unit>()

    /**
     * The layer to [y] (the overlay's scroll, dp), then the [scene] measured there. The web view starts
     * [reach] above the overlay, so the island's own scroll is that much less (a view at the overlay's
     * top is [reach] down the web view); the overlay's translation is let go once the island says it
     * has drawn it.
     */
    fun place(y: Float, reach: Float, anchor: ScrollTracker.Anchor, scene: JsonObject) {
        val at = y - reach
        sent.addLast(at.toDouble() to anchor)
        while (sent.size > 8) sent.removeFirst()
        // The translation goes back in the frame the WebView first draws the layer moved (its visual state
        // ready): the island's own `scrolled` comes two of its frames on, which an Android WebView has
        // already put on screen — a frame or two shifted twice, the puppet gone from its place (round 20,
        // seen in a recording). Whichever comes first lets it go.
        callThenDrawn("mascots.scroll(${num(at)}); mascots.scene($scene, ${num(y)})") { reached(at.toDouble()) }
        sceneSent = true
    }

    /** The island's layer drawn at its scroll [y]: its anchor is where the layer stands; any sent before it are behind it. */
    private fun reached(y: Double) {
        val i = sent.indexOfLast { abs(it.first - y) < 0.01 }
        if (i < 0) return
        shown = sent[i].second
        repeat(i + 1) { sent.removeFirst() }
        // Now, not at the next frame's turn: the overlay's layer reads it in the very frame the WebView draws it.
        Snapshot.sendApplyNotifications()
    }

    /** The island point (the web view's dp) a tap at [p] reaches a puppet at, or null when none is there. */
    fun hitAt(p: Offset): Offset? = if (hits.any { it.contains(p) }) p else null

    fun tap(point: Offset) {
        call("mascots.tap(${num(point.x)}, ${num(point.y)})")
    }

    fun destroy() {
        runCatching { webView.evaluateJavascript("mascots.stop()", null) }
        webView.removeJavascriptInterface("MascotsBridge")
        webView.destroy()
    }

    private fun heard(message: MascotMessage) {
        when (message) {
            is MascotMessage.Hits -> hits = message.rects
            is MascotMessage.Scrolled -> reached(message.y)
        }
    }

    // On the WebView's bridge thread; the island's state on the main thread.
    private inner class Bridge {
        @JavascriptInterface
        fun post(json: String) {
            val message = MascotMessage.parse(json) ?: return
            webView.post { heard(message) }
        }
    }
}

/**
 * The island's WebView: drawn, never touched — no touch, no focus, nothing for TalkBack (the puppets
 * are a decoration; the web's layer is aria-hidden). A tap on a puppet reaches it through the app
 * ([MascotTapElement]), not the page.
 */
@SuppressLint("ViewConstructor", "ClickableViewAccessibility")
private class TouchlessWebView(context: Context) : WebView(context) {
    init {
        isFocusable = false
        isFocusableInTouchMode = false
        isClickable = false
        isLongClickable = false
        importantForAccessibility = View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS
        importantForAutofill = View.IMPORTANT_FOR_AUTOFILL_NO_EXCLUDE_DESCENDANTS
    }

    override fun dispatchTouchEvent(event: MotionEvent?): Boolean = false
    override fun onTouchEvent(event: MotionEvent?): Boolean = false
    override fun dispatchGenericMotionEvent(event: MotionEvent?): Boolean = false
    override fun onCheckIsTextEditor(): Boolean = false
}

/** Where a tap would reach a puppet: the island's point for a press at [position] (the node's px), or null; and the tap itself. */
internal interface MascotTapTarget {
    fun at(position: Offset): Offset?
    fun tap(point: Offset)
}

/**
 * A tap, told apart from the rest: a press that [down] said is a puppet's, lifted ([up]) within
 * [slop] of where it went down, with nothing else having taken a move of it (a scroll) and no second
 * finger meanwhile. Pointer ids as numbers, positions in px.
 */
internal class TapRouter(private val slop: Float) {
    private var pointer: Long? = null
    private var start = Offset.Zero
    private var point: Offset? = null

    /** A press: true (its) when [target] is where a puppet is. */
    fun down(id: Long, position: Offset, target: Offset?): Boolean {
        cancel()
        if (target == null) return false
        pointer = id
        start = position
        point = target
        return true
    }

    fun follows(id: Long): Boolean = pointer == id

    /** The press moved: past the slop, or taken by someone else (the list scrolling), it is no tap. */
    fun moved(id: Long, position: Offset, takenElsewhere: Boolean) {
        if (pointer != id) return
        if (takenElsewhere || hypot(position.x - start.x, position.y - start.y) > slop) cancel()
    }

    /** The press lifted: the island's point it was a tap at, or null. */
    fun up(id: Long): Offset? {
        if (pointer != id) return null
        val p = point
        cancel()
        return p
    }

    fun cancel() {
        pointer = null
        point = null
    }
}

/**
 * Lets what lies under the island take every pointer but a tap on a puppet. Compose gives a touch to
 * the topmost sibling it lands on (here, the island) and to none under it unless that one shares
 * (`sharePointerInputWithSiblings`); sharing, the island's node comes first in the touch's path, so
 * its Initial pass sees a press before the list (or the row) under it does. A press on a puppet is
 * taken there (the card's click never starts; the list may still scroll from it — its drag takes an
 * already-taken press), and a lift within the slop, unscrolled, is handed to [MascotTapTarget.tap].
 * The WebView itself takes nothing ([TouchlessWebView]).
 */
internal data class MascotTapElement(val target: MascotTapTarget, val slop: Float) : ModifierNodeElement<MascotTapNode>() {
    override fun create() = MascotTapNode(target, slop)
    override fun update(node: MascotTapNode) {
        node.target = target
        node.router = TapRouter(slop)
    }
}

internal class MascotTapNode(var target: MascotTapTarget, slop: Float) : Modifier.Node(), PointerInputModifierNode {
    var router = TapRouter(slop)

    override fun onPointerEvent(pointerEvent: PointerEvent, pass: PointerEventPass, bounds: IntSize) {
        val changes = pointerEvent.changes
        when (pass) {
            PointerEventPass.Initial -> {
                val down = changes.firstOrNull { it.changedToDownIgnoreConsumed() } ?: return
                // A second finger: no tap (a pinch, a scroll with two).
                if (changes.count { it.pressed } > 1) {
                    router.cancel()
                    return
                }
                if (router.down(down.id.value, down.position, target.at(down.position))) down.consume()
            }
            PointerEventPass.Main, PointerEventPass.Final -> for (c in changes) {
                if (!router.follows(c.id.value) || c.changedToDownIgnoreConsumed()) continue
                if (c.changedToUpIgnoreConsumed()) {
                    // After everyone's Main: still a tap, it is the puppet's.
                    if (pass == PointerEventPass.Final) router.up(c.id.value)?.let { p ->
                        c.consume()
                        target.tap(p)
                    }
                } else router.moved(c.id.value, c.position, c.isConsumed)
            }
        }
    }

    override fun onCancelPointerInput() = router.cancel()
    override fun sharePointerInputWithSiblings() = true
}

/**
 * A screen's marked views as the island's ReadingScene (src/lib/mascots/reading/scene.ts), in the
 * overlay's dp: the cards laid out within a screen or two of the view, each by its id (`key`), its
 * drawn edge — a band's wavy top rule; a bordered card's outline, its extent, top and whole line as drawn — and
 * the pen it is drawn with, its title and author row; the feed's foot; and a card page's story — its
 * column, its title's first line, cover, blocks, response bar and what is above it.
 */
internal object MascotScene {
    /** The marks read: rects by key, a card's edge ([MascotMarks.BandRule] / [MascotMarks.CardOutline]) by its key, the story title's first line (in its own dp). */
    class Parts(val rects: Map<String, Rect>, val edges: Map<String, Any> = emptyMap(), val titleLine: Rect? = null)

    fun of(parts: Parts, width: Float, height: Float, rail: Boolean): JsonObject = buildJsonObject {
        put("width", width.r())
        put("height", height.r())
        val r = parts.rects
        // Cards laid out from a screen above the view to two below it.
        val cards = r.filterKeys { it.startsWith("card:") && it.count { c -> c == ':' } == 1 }
            .filterValues { it.bottom > -height && it.top < height * 2 && it.width > 0 && it.height > 0 }
            .entries.sortedWith(compareBy({ it.value.top }, { it.value.left }))
        put("cards", buildJsonArray {
            for ((key, frame) in cards) add(buildJsonObject {
                put("key", key.removePrefix("card:"))
                when (val edge = parts.edges[key]) {
                    is MascotMarks.CardOutline -> {
                        val drawn = outlinePoints(borderedCardOutline(frame.width.toDouble(), frame.height.toDouble(), edge.seed), frame.left, frame.top)
                        val x0 = drawn.minOf { it.x }
                        val x1 = drawn.maxOf { it.x }
                        // Its outline's own extent: the wobble swings a little past the frame it is laid out in.
                        val box = Rect(x0, frame.top, x1, frame.bottom)
                        put("box", box.json())
                        val top = topContour(drawn, x0 + 1, x1 - 1, frame.top)
                        if (top.size >= 2) put("top", JsonArray(top.map { point(it.x, it.y) }))
                        // The whole line, about every 4: a puppet slid out past a side is cut along the line itself.
                        put("outline", JsonArray(drawn.map { point(it.x, it.y) }))
                        put("pen", Tokens.Ink.value.r())
                        put("radius", 22)
                    }
                    is MascotMarks.BandRule -> {
                        put("box", frame.json())
                        put("top", buildJsonArray {
                            MascotMarks.bandRulePoints(frame.width.toDouble(), edge.seed, 0.0).forEach { p -> add(point(frame.left + p.x, frame.top + p.y)) }
                        })
                        put("pen", Tokens.InkLight.value.r())
                        put("radius", 18)
                    }
                    else -> {
                        put("box", frame.json())
                        put("pen", Tokens.InkLight.value.r())
                        put("radius", 18)
                    }
                }
                val foot = r.filterKeys { it.startsWith("$key:foot") }.values.map { it.json() }
                if (foot.isNotEmpty()) put("foot", JsonArray(foot))
                r["$key:title"]?.let { put("words", JsonArray(listOf(it.json()))) }
            })
        })
        put("more", r["more"].json())
        put("end", r["end"].json())
        put("column", r["column"].json())
        val title = r["title"]
        val line = parts.titleLine
        if (title != null) put("title", buildJsonObject {
            put("firstLine", (if (line != null) Rect(title.left + line.left, title.top + line.top, title.left + line.right, title.top + line.bottom) else title).json())
        })
        put("cover", r["cover"].json())
        val blocks = r.filterKeys { it.startsWith("block:") }.entries.sortedBy { it.key }.map { it.value }
        if (blocks.isNotEmpty()) put("paragraphs", JsonArray(blocks.map { it.json() }))
        if (rail) r["column"]?.let { col -> put("rail", Rect(col.right, col.top, width, col.bottom).json()) }
        val respond = r["respond"]
        put("respond", respond.json())
        if (respond != null) {
            val above = listOfNotNull(r["tags"], r["story"]).filter { it.top < respond.top }.maxOfOrNull { it.bottom }
            put("respondCeiling", above?.let { JsonPrimitive((it + 2).r()) } ?: JsonNull)
        }
    }

    /**
     * Settings' strip as the island's scene, in its web view's dp: [width] wide, the strip [stripHeight]
     * tall under [STRIP_HEADROOM] of room above it (the floor starting that far down), the switch
     * ([control], above the strip: its y under the headroom) to point at, asleep while it is off.
     */
    fun strip(width: Float, stripHeight: Float, control: Rect?, asleep: Boolean): JsonObject = buildJsonObject {
        put("width", width.r())
        put("height", (stripHeight + STRIP_HEADROOM).r())
        put("settings", buildJsonObject {
            put("floor", Rect(0f, STRIP_HEADROOM.toFloat(), width, STRIP_HEADROOM + stripHeight).json())
            put("control", control.json())
            put("asleep", asleep)
        })
    }

    /** An outline (dp, at its frame's origin) as points about every 4 along it, moved to ([dx], [dy]). */
    fun outlinePoints(path: List<PathCommand>, dx: Float, dy: Float, step: Double = 4.0): List<Offset> {
        val out = ArrayList<Offset>()
        var x = 0.0
        var y = 0.0
        var sx = 0.0
        var sy = 0.0
        fun add(px: Double, py: Double) { out += Offset((px + dx).toFloat(), (py + dy).toFloat()) }
        fun line(tx: Double, ty: Double) {
            val n = max(1, ceil(hypot(tx - x, ty - y) / step).toInt())
            for (k in 1..n) add(x + (tx - x) * k / n, y + (ty - y) * k / n)
            x = tx; y = ty
        }
        for (c in path) when (c) {
            is PathCommand.Move -> { x = c.x; y = c.y; sx = x; sy = y; add(x, y) }
            is PathCommand.Line -> line(c.x, c.y)
            is PathCommand.Cubic -> {
                val length = hypot(c.x1 - x, c.y1 - y) + hypot(c.x2 - c.x1, c.y2 - c.y1) + hypot(c.x - c.x2, c.y - c.y2)
                val n = max(1, ceil(length / step).toInt())
                for (k in 1..n) {
                    val t = k.toDouble() / n
                    val u = 1 - t
                    add(
                        u * u * u * x + 3 * u * u * t * c.x1 + 3 * u * t * t * c.x2 + t * t * t * c.x,
                        u * u * u * y + 3 * u * u * t * c.y1 + 3 * u * t * t * c.y2 + t * t * t * c.y,
                    )
                }
                x = c.x; y = c.y
            }
            is PathCommand.Quad -> {
                val length = hypot(c.x1 - x, c.y1 - y) + hypot(c.x - c.x1, c.y - c.y1)
                val n = max(1, ceil(length / step).toInt())
                for (k in 1..n) {
                    val t = k.toDouble() / n
                    val u = 1 - t
                    add(u * u * x + 2 * u * t * c.x1 + t * t * c.x, u * u * y + 2 * u * t * c.y1 + t * t * c.y)
                }
                x = c.x; y = c.y
            }
            PathCommand.Close -> line(sx, sy)
        }
        return out
    }

    /**
     * The drawn top of an outline (its points near [y]), one point every 6 from [x0] to [x1], each the
     * topmost within 3 of it (gaps from the nearest): the web's topContour (landing/measure.ts).
     */
    fun topContour(points: List<Offset>, x0: Float, x1: Float, y: Float, band: Float = 24f): List<Offset> {
        val near = points.filter { abs(it.y - y) < band && it.x >= x0 - 4 && it.x <= x1 + 4 }
        if (near.isEmpty()) return emptyList()
        val out = ArrayList<Offset>()
        var x = x0.roundToInt().toFloat()
        while (x <= x1) {
            val column = near.filter { abs(it.x - x) <= 3 }
            val at = if (column.isNotEmpty()) column.minOf { it.y } else near.minBy { abs(it.x - x) }.y
            out += Offset(x, at.r())
            x += 6
        }
        return out
    }

    private fun Float.r(): Float = (this * 10).roundToInt() / 10f
    private fun point(x: Float, y: Float): JsonElement = JsonArray(listOf(JsonPrimitive(x.r()), JsonPrimitive(y.r())))
    private fun Rect?.json(): JsonElement = if (this == null) JsonNull else buildJsonObject {
        put("x", left.r()); put("y", top.r()); put("w", width.r()); put("h", height.r())
    }
}
