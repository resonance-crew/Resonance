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
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.input.pointer.PointerEvent
import androidx.compose.ui.input.pointer.PointerEventPass
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.PointerInputModifierNode
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.viewinterop.AndroidView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import androidx.lifecycle.compose.LocalLifecycleOwner
import com.resonance.app.DebugLaunch
import com.resonance.design.MascotMarks
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.prefersReducedMotion
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.debounce
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlin.math.roundToInt

/**
 * The paper puppets on a reading screen (round 19: 「偶爾會出現的小精靈」 on the home feed and a card's
 * page, only while 外觀's 小精靈 is on): the web's own stage (src/lib/mascots) running in the bundled
 * mascot island (`native/mascots/dist/mascots.html`, an asset) in a transparent WebView laid over the
 * scrolling list, under the bars, menus and toasts, that takes no touch and no focus and is not in
 * the accessibility tree. The screen marks its views ([MascotMarks], read through LocalMascotMarks by
 * the cards, the story and the screen's own parts); the island is handed them as a ReadingScene
 * ([MascotScene]) once a scroll has come to rest or what is marked changed — never per frame.
 *
 * Scrolling: the puppets' layer is moved by the WebView's own translation while the list moves, in
 * the frame the list moves in (one visible item's offset against where it was when the island last
 * placed its layer), and the island is told the new scroll once the list has come to rest
 * (`mascots.scroll`), the translation taken back once it has drawn that (`MascotHost.placed`). Per
 * frame JavaScript lagged behind the native scroll; this rides along exactly.
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
    // The app's scheme and its "Remove animations", followed live.
    val dark = LocalResonanceColors.current.dark
    val reduced = context.prefersReducedMotion()
    LaunchedEffect(dark) { island.call("mascots.theme('${if (dark) "dark" else "light"}')") }
    LaunchedEffect(reduced) { island.call("mascots.reducedMotion($reduced)") }
    LaunchedEffect(insetTop, insetBottom) { island.call("mascots.inset(${insetTop.value}, ${insetBottom.value})") }
    // Away from the screen (the app in the background): the stage sleeps.
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

    var frame by remember { mutableStateOf<LayoutCoordinates?>(null) }
    var size by remember { mutableStateOf(IntSize.Zero) }
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
                val overlay = frame?.takeIf { it.isAttached } ?: return@collectLatest
                val anchor = list.layoutInfo.visibleItemsInfo.firstOrNull() ?: return@collectLatest
                val y = tracker.y
                val scene = MascotScene.of(sceneParts(overlay, marks, density.density), s.width / density.density, s.height / density.density, railNow)
                island.place(y, ScrollTracker.Anchor(anchor.key, anchor.offset, y), scene)
            }
    }
    // Debug builds: the screen checks' calls (a visit at a chosen place, the stage's time run on).
    LaunchedEffect(island) { DebugLaunch.mascotCalls.collect { js -> island.call(js) { Log.i(TAG, "$js → $it") } } }

    Box(
        modifier
            // The island takes no touch: the list under it gets every one (see SharePointerInput).
            .then(SharePointerInput)
            .onGloballyPositioned { frame = it; size = it.size }
            .graphicsLayer {
                // The layer follows the list in the same frame; the island is told at rest.
                val shown = island.shown
                val now = shown?.let { a -> list.layoutInfo.visibleItemsInfo.firstOrNull { it.key == a.key } }
                translationY = when {
                    shown == null -> 0f
                    now != null -> (now.offset - shown.offset).toFloat()
                    else -> -(tracker.y - shown.y) * density.density
                }
            },
    ) {
        AndroidView(factory = { island.webView }, modifier = Modifier.fillMaxSize())
    }
}

/** How long a scroll (or the marks) must stay still before the island is told. */
private const val REST_MS = 200L
private const val TAG = "Mascots"

/** The marked views in the overlay's own dp, by their keys (cards, their title and author row, the story's parts). */
private fun sceneParts(overlay: LayoutCoordinates, marks: MascotMarks, density: Float): MascotScene.Parts {
    val rects = LinkedHashMap<String, Rect>()
    val rules = HashMap<String, Double>()
    for ((key, mark) in marks.attached()) {
        val r = runCatching { overlay.localBoundingBoxOf(mark.coordinates, clipBounds = false) }.getOrNull() ?: continue
        rects[key] = Rect(r.left / density, r.top / density, r.right / density, r.bottom / density)
        (mark.extra as? MascotMarks.BandRule)?.let { rules[key] = it.seed }
    }
    val line = marks.titleLine?.let { l -> Rect(l.left / density, l.top / density, l.right / density, l.bottom / density) }
    return MascotScene.Parts(rects, rules, line)
}

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

/**
 * The island's WebView and the calls into it, held until its page has loaded (each a line of the
 * island's API: native/mascots/src/island.ts).
 */
internal class MascotIsland(context: Context) {
    /** Where the island's layer now stands (what it last drew): the overlay's translation is reckoned from it. */
    var shown: ScrollTracker.Anchor? by mutableStateOf(null)
        private set
    private var ready = false
    private val pending = ArrayList<Pair<String, ((String) -> Unit)?>>()
    private var token = 0
    private val sent = HashMap<Int, ScrollTracker.Anchor>()

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
        setLayerType(View.LAYER_TYPE_HARDWARE, null)
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
            }
        }
        addJavascriptInterface(Host(), "MascotHost")
        loadUrl("file:///android_asset/mascots.html")
    }

    fun call(js: String, then: ((String) -> Unit)? = null) {
        if (ready) webView.evaluateJavascript(js) { then?.invoke(it) } else pending += js to then
    }

    /** The layer to [y], then the [scene] measured there; the overlay's translation is let go once the island has drawn it. */
    fun place(y: Float, anchor: ScrollTracker.Anchor, scene: JsonObject) {
        val t = ++token
        sent[t] = anchor
        call(
            "mascots.scroll($y); mascots.scene($scene, $y); " +
                "requestAnimationFrame(() => requestAnimationFrame(() => MascotHost.placed($t)))",
        )
    }

    fun destroy() {
        runCatching { webView.evaluateJavascript("mascots.stop()", null) }
        webView.removeJavascriptInterface("MascotHost")
        webView.destroy()
    }

    // On the WebView's bridge thread; the overlay's state on the main thread.
    private inner class Host {
        @JavascriptInterface
        fun placed(t: Int) {
            webView.post {
                val anchor = sent.remove(t) ?: return@post
                // Older calls still on their way are behind this one.
                sent.keys.removeAll { it < t }
                shown = anchor
            }
        }
    }
}

/**
 * The island's WebView: drawn, never touched — no touch, no focus, nothing for TalkBack (the puppets
 * are a decoration; the web's layer is aria-hidden).
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

/**
 * Lets what lies under the overlay take every pointer: Compose gives a touch to the topmost sibling
 * it lands on (here, the WebView's interop node) and to none under it unless that one shares
 * (`sharePointerInputWithSiblings`). The WebView itself takes nothing ([TouchlessWebView]).
 */
private object SharePointerInput : ModifierNodeElement<SharePointerInputNode>() {
    override fun create() = SharePointerInputNode()
    override fun update(node: SharePointerInputNode) {}
    override fun hashCode() = 7
    override fun equals(other: Any?) = other === this
}

private class SharePointerInputNode : Modifier.Node(), PointerInputModifierNode {
    override fun onPointerEvent(pointerEvent: PointerEvent, pass: PointerEventPass, bounds: IntSize) {}
    override fun onCancelPointerInput() {}
    override fun sharePointerInputWithSiblings() = true
}

/**
 * A screen's marked views as the island's ReadingScene (src/lib/mascots/reading/scene.ts), in the
 * overlay's dp: the cards laid out within a screen or two of the view (their band's top rule as the
 * edge to sit on, their title and author row), the feed's foot, and a card page's story — its column,
 * its title's first line, cover, blocks, response bar and what is above it.
 */
internal object MascotScene {
    /** The marks read: rects by key, the band rules' seeds by card key, the story title's first line (in its own dp). */
    class Parts(val rects: Map<String, Rect>, val rules: Map<String, Double> = emptyMap(), val titleLine: Rect? = null)

    fun of(parts: Parts, width: Float, height: Float, rail: Boolean): JsonObject = buildJsonObject {
        put("width", width.r())
        put("height", height.r())
        val r = parts.rects
        // Cards laid out from a screen above the view to two below it.
        val cards = r.filterKeys { it.startsWith("card:") && it.count { c -> c == ':' } == 1 }
            .filterValues { it.bottom > -height && it.top < height * 2 && it.width > 0 && it.height > 0 }
            .entries.sortedWith(compareBy({ it.value.top }, { it.value.left }))
        put("cards", buildJsonArray {
            for ((key, box) in cards) add(buildJsonObject {
                put("box", box.json())
                parts.rules[key]?.let { seed ->
                    put("top", buildJsonArray {
                        MascotMarks.bandRulePoints(box.width.toDouble(), seed, 0.0).forEach { p -> add(point(box.left + p.x, box.top + p.y)) }
                    })
                }
                val foot = r.filterKeys { it.startsWith("$key:foot") }.values.map { it.json() }
                if (foot.isNotEmpty()) put("foot", JsonArray(foot))
                r["$key:title"]?.let { put("words", JsonArray(listOf(it.json()))) }
                put("radius", 18)
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

    private fun Float.r(): Float = (this * 10).roundToInt() / 10f
    private fun point(x: Float, y: Float): JsonElement = JsonArray(listOf(JsonPrimitive(x.r()), JsonPrimitive(y.r())))
    private fun Rect?.json(): JsonElement = if (this == null) JsonNull else buildJsonObject {
        put("x", left.r()); put("y", top.r()); put("w", width.r()); put("h", height.r())
    }
}
