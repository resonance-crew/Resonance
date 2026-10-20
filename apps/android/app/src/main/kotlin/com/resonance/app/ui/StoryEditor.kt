package com.resonance.app.ui

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.view.MotionEvent
import android.view.View
import android.view.inputmethod.InputMethodManager
import android.webkit.JavascriptInterface
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawWithCache
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawOutline
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import com.resonance.design.AppFonts
import com.resonance.design.OrganicIcon
import com.resonance.design.OrganicVerticalRule
import com.resonance.design.ReadingTextScale
import com.resonance.design.SketchLoader
import com.resonance.design.WobRectShape
import com.resonance.design.fade
import com.resonance.design.generated.IconName
import com.resonance.design.generated.Tokens
import com.resonance.design.plainClickable
import com.resonance.design.toPath
import com.resonance.geometry.SegValue
import com.resonance.geometry.WobRectOptions
import com.resonance.geometry.pointsToBezier
import com.resonance.geometry.wavyPoints
import com.resonance.kit.l10n.L10n
import com.resonance.kit.story.StoryScript
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlin.math.roundToInt

/**
 * What the writer's model asks of its story editor: the story it holds, the commands it runs, the
 * title it reads the story's type with, and letting it go. The island ([StoryEditorBridge]) on
 * screen; a stand-in under test.
 */
interface StoryEditor {
    /** The story as the editor serializes it (the web's Markdown), on every change. */
    var onChange: (String) -> Unit

    /** Loads a saved story (kept out of undo history by the island). */
    fun setMarkdown(markdown: String)

    /** A toolbar command; `args` for insertCard (href, title) and insertImage (src, alt). */
    fun exec(command: String, args: Map<String, String> = emptyMap())

    /** The card's title, which the island reads with the story to set them both (writerScript). */
    fun setTitle(title: String)

    fun destroy()
}

/**
 * The story editor island (native/editor, the web's Tiptap schema) in a WebView, embedded: the page
 * is transparent and never scrolls; it reports its height, its Markdown, which formatting is on,
 * how the story is set (its script and language: [script], [lang], for the title field beside it)
 * and where the caret's line is ([caret], to keep it above the keyboard's format bar), and takes the
 * toolbar's commands (ResonanceEditor.exec). The twin of iOS's StoryEditorBridge.
 *
 * The writer loads it as its bare page ([canvas]: `?layout=canvas`, no frame or padding of its
 * own), in the type of the UI's [locale] while the story is empty (`?locale=`), the story's own once
 * there is enough of it (writer.spec §1.8). Without them it is the framed field older builds had.
 *
 * The WebView only ever holds the bundled island — it is what the bridge is exposed to: any other
 * page a link or a script would load is refused, and an http(s) link the writer taps opens in the
 * browser instead. It reads no files but the app's assets, and no content providers.
 */
@Stable
@SuppressLint("SetJavaScriptEnabled", "ClickableViewAccessibility")
class StoryEditorBridge(
    context: Context,
    placeholder: String,
    private val canvas: Boolean = false,
    locale: String? = null,
    /** How the story is set until the island says: the writer's own reading of what it opens with. */
    script: StoryScript = StoryScript.Cjk,
    lang: String? = null,
) : StoryEditor {
    data class Active(
        val bold: Boolean = false, val italic: Boolean = false, val h2: Boolean = false, val h3: Boolean = false,
        val bulletList: Boolean = false, val orderedList: Boolean = false, val blockquote: Boolean = false,
    )

    var ready by mutableStateOf(false)
        private set
    /** The page's height in dp (CSS px at device width): never under the framed field's 200; the canvas one is as tall as its words. */
    var height by mutableIntStateOf(if (canvas) CANVAS_START_HEIGHT else FIELD_MIN_HEIGHT)
        private set
    var active by mutableStateOf(Active())
        private set
    var focused by mutableStateOf(false)
        private set
    /** How the story is set now (the island's `script` message): the title field beside it follows. */
    var script by mutableStateOf(script)
        private set
    /** The language the story is written in, when it says (`zh-TW`, `ja`, `ko`, `en`): the title takes it too. */
    var lang by mutableStateOf(lang)
        private set
    /** The caret's line in the page, in dp from its top, while the story has the focus. */
    var caret by mutableStateOf<IslandMessage.Caret?>(null)
        private set
    override var onChange: (String) -> Unit = {}
    /**
     * When the latest touch on the story went down (its MotionEvent's downTime): the WebView takes a
     * touch after the page around it has seen it, so the page tells a tap in the story from one beside it by this.
     */
    var lastTouchDown = -1L
        private set
    private var pendingMarkdown: String? = null
    private var pendingTitle: String? = null

    val webView: WebView = WebView(context).apply {
        settings.javaScriptEnabled = true
        // Assets are readable from file:///android_asset regardless of allowFileAccess (the fonts
        // sit at the asset root, apps/shared/fonts): nothing else on the device is.
        settings.allowFileAccess = false
        settings.allowContentAccess = false
        @Suppress("DEPRECATION")
        settings.allowFileAccessFromFileURLs = false
        @Suppress("DEPRECATION")
        settings.allowUniversalAccessFromFileURLs = false
        settings.setGeolocationEnabled(false)
        webViewClient = EditorClient()
        setBackgroundColor(AndroidColor.TRANSPARENT)
        // The writing screen scrolls; the island only grows.
        isVerticalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        setOnTouchListener { _, e ->
            if (e.actionMasked == MotionEvent.ACTION_DOWN) lastTouchDown = e.downTime
            false
        }
        addJavascriptInterface(Bridge(), "ResonanceBridge")
        loadUrl("file://" + editorQuery(placeholder, canvas, locale))
    }

    /**
     * The island's text at the scale the story is read at (the writer's canvas: [readingTextScale]
     * up to 2×), in place of the WebView's own follow of the system's whole setting.
     */
    fun setTextScale(scale: Float) {
        val zoom = (scale * 100).roundToInt()
        if (webView.settings.textZoom != zoom) webView.settings.textZoom = zoom
    }

    override fun setMarkdown(markdown: String) {
        if (!ready) {
            pendingMarkdown = markdown
            return
        }
        webView.evaluateJavascript("ResonanceEditor.setMarkdown(${JsonPrimitive(markdown)})", null)
    }

    override fun exec(command: String, args: Map<String, String>) {
        val a = JsonObject(args.mapValues { JsonPrimitive(it.value) })
        webView.evaluateJavascript("ResonanceEditor.exec(${JsonPrimitive(command)}, $a)", null)
    }

    override fun setTitle(title: String) {
        if (!ready) {
            pendingTitle = title
            return
        }
        webView.evaluateJavascript("ResonanceEditor.setTitle(${JsonPrimitive(title)})", null)
    }

    /** Puts the caret in the story, at its end (a tap under the words, the title's Next). */
    fun focus() {
        webView.requestFocus()
        webView.evaluateJavascript("ResonanceEditor.focus()", null)
        webView.context.getSystemService(InputMethodManager::class.java)?.showSoftInput(webView, 0)
    }

    /**
     * The story takes the focus again where its caret was (back from the publish step): the
     * editable root itself is focused, so ProseMirror keeps its selection rather than going to the end.
     */
    fun refocus() {
        if (!ready) return
        webView.requestFocus()
        webView.evaluateJavascript("document.querySelector('.ProseMirror')?.focus()", null)
        webView.context.getSystemService(InputMethodManager::class.java)?.showSoftInput(webView, 0)
    }

    /**
     * Lets go of the keyboard while the page is still on screen (leaving the
     * writer, a tap beside the fields, an action below the story): unlike a
     * Compose field, a WebView keeps the IME up after it leaves the composition.
     * The story lets go of its caret too.
     */
    fun releaseKeyboard() {
        if (ready) webView.evaluateJavascript("ResonanceEditor.blur()", null)
        webView.clearFocus()
        webView.context.getSystemService(InputMethodManager::class.java)?.hideSoftInputFromWindow(webView.windowToken, 0)
    }

    /**
     * The story is out of sight (the publish step over it): TalkBack leaves it, words and all —
     * the WebView's own nodes aren't Compose's to clear.
     */
    fun setHidden(hidden: Boolean) {
        webView.importantForAccessibility =
            if (hidden) View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS else View.IMPORTANT_FOR_ACCESSIBILITY_AUTO
    }

    override fun destroy() {
        webView.removeJavascriptInterface("ResonanceBridge")
        webView.destroy()
    }

    /** Keeps the WebView on the island: its own page loads, an http(s) link the writer taps opens in the browser, nothing else. */
    private class EditorClient : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            if (isEditor(url)) return false
            if (request.isForMainFrame && request.hasGesture() && url.scheme?.lowercase() in setOf("http", "https")) {
                InAppBrowser.open(view.context, url.toString())
            }
            return true
        }
    }

    // Called on the WebView's JavaBridge thread; state changes go to the main thread.
    private inner class Bridge {
        @JavascriptInterface
        fun postMessage(message: String) {
            val m = IslandMessage.parse(message) ?: return
            webView.post { handle(m) }
        }
    }

    private fun handle(m: IslandMessage) {
        when (m) {
            IslandMessage.Ready -> {
                ready = true
                // The title first, so the story it opens with is read with it.
                pendingTitle?.let(::setTitle)
                pendingTitle = null
                pendingMarkdown?.let(::setMarkdown)
                pendingMarkdown = null
            }
            is IslandMessage.Change -> onChange(m.markdown)
            is IslandMessage.Height -> height = maxOf(if (canvas) 0 else FIELD_MIN_HEIGHT, m.px)
            is IslandMessage.State -> active = m.active
            is IslandMessage.Focus -> {
                focused = m.focused
                if (!m.focused) caret = null
            }
            is IslandMessage.Script -> {
                script = m.script
                lang = m.lang
            }
            is IslandMessage.Caret -> caret = m
        }
    }

    internal companion object {
        /** The island, as the app bundles it (npm run native:editor → native/editor/dist → the assets). */
        const val EDITOR_PATH = "/android_asset/editor.html"
        /** The framed field's least height. */
        const val FIELD_MIN_HEIGHT = 200
        /** The canvas before the island has said how tall its words are: a line of them. */
        const val CANVAS_START_HEIGHT = 40

        /** The bundled island itself (whatever its query), the one page the editor's WebView may hold. */
        fun isEditor(url: Uri): Boolean = url.scheme == "file" && url.authority.isNullOrEmpty() && url.path == EDITOR_PATH

        /**
         * The island's address: embedded (the host sizes and scrolls it), with the story's placeholder;
         * the writer's bare page adds `layout=canvas` and the UI's `locale`, whose type an empty story
         * starts in. The placeholder and locale are encoded; the fonts are the app's own assets.
         */
        fun editorQuery(placeholder: String, canvas: Boolean, locale: String?): String = buildString {
            append(EDITOR_PATH).append("?embed=1&fonts=&placeholder=").append(encode(placeholder))
            if (canvas) append("&layout=canvas")
            if (canvas && locale != null) append("&locale=").append(encode(locale))
        }

        /** A query value, percent-encoded as Uri.encode does it (a space as %20). */
        private fun encode(value: String): String = java.net.URLEncoder.encode(value, "UTF-8").replace("+", "%20")
    }
}

/** What the island posts (native/editor/src/island.ts `Message`); a type it doesn't know is left alone. */
sealed interface IslandMessage {
    data object Ready : IslandMessage
    data class Change(val markdown: String) : IslandMessage
    /** The page's height, in CSS px (dp at the device's width). */
    data class Height(val px: Int) : IslandMessage
    data class State(val active: StoryEditorBridge.Active) : IslandMessage
    data class Focus(val focused: Boolean) : IslandMessage
    /** How the story is set now: CJK or Latin, and its language when it says. */
    data class Script(val script: StoryScript, val lang: String?) : IslandMessage
    /** The caret's line in the page (its text zoom included), dp from its top. */
    data class Caret(val top: Float, val bottom: Float) : IslandMessage

    companion object {
        private val json = Json { ignoreUnknownKeys = true }

        fun parse(message: String): IslandMessage? {
            val m = runCatching { json.parseToJsonElement(message).jsonObject }.getOrNull() ?: return null
            fun string(key: String) = (m[key] as? JsonPrimitive)?.contentOrNull
            fun number(key: String) = (m[key] as? JsonPrimitive)?.doubleOrNull
            return when (string("type")) {
                "ready" -> Ready
                "change" -> Change(string("markdown") ?: "")
                "height" -> number("px")?.let { Height(it.toInt()) }
                "state" -> {
                    val a = runCatching { m["active"]?.jsonObject }.getOrNull()
                    fun on(key: String) = (a?.get(key) as? JsonPrimitive)?.booleanOrNull ?: false
                    State(StoryEditorBridge.Active(on("bold"), on("italic"), on("h2"), on("h3"), on("bulletList"), on("orderedList"), on("blockquote")))
                }
                "focus" -> Focus((m["focused"] as? JsonPrimitive)?.booleanOrNull ?: false)
                "script" -> Script(if (string("script") == "latin") StoryScript.Latin else StoryScript.Cjk, string("lang"))
                "caret" -> {
                    val top = number("top")
                    val bottom = number("bottom")
                    if (top == null || bottom == null) null else Caret(top.toFloat(), bottom.toFloat())
                }
                else -> null
            }
        }
    }
}

/**
 * The story on the writer's bare page (writer.spec §1.4): no frame, no toolbar of its own — the
 * island as tall as its words, set in the story's type at the reading scale (up to 2× of the
 * system's text size, as the card page reads it), and under it the rest of the page, whose tap puts
 * the caret in the story. Formatting is the keyboard's [StoryFormatBar].
 */
@Composable
fun StoryCanvas(bridge: StoryEditorBridge, minHeight: Dp, modifier: Modifier = Modifier) {
    ReadingTextScale {
        val fontScale = LocalDensity.current.fontScale
        SideEffect { bridge.setTextScale(fontScale) }
    }
    Column(modifier.fillMaxWidth()) {
        AndroidView(
            factory = { bridge.webView },
            modifier = Modifier.fillMaxWidth().height(bridge.height.dp).semantics { contentDescription = L10n.Write.storyLabel },
        )
        // A tap anywhere under the words lands in the story.
        Box(
            Modifier
                .fillMaxWidth()
                .heightIn(min = (minHeight - bridge.height.dp).coerceAtLeast(0.dp))
                .pointerInput(bridge) { detectTapGestures { bridge.focus() } },
        )
    }
}

/**
 * The format bar on the keyboard (writer.spec §1.5, touch): while the story has the focus, a cream
 * strip rides the keyboard with the toolbar's wave as its top edge — 插入圖片 · 插入卡片 ┆ 粗體 ·
 * 斜體 ┆ H2 · H3 ┆ 引言 · 清單 · 編號 in one row that scrolls sideways (fading where more lies), and
 * 收起鍵盤 pinned at its end. Its buttons never take the focus from the story.
 */
@Composable
fun StoryFormatBar(
    bridge: StoryEditorBridge,
    onInsertImage: () -> Unit,
    onInsertCard: () -> Unit,
    uploadingImage: Boolean,
    modifier: Modifier = Modifier,
) {
    val scroll = rememberScrollState()
    Row(
        modifier
            .fillMaxWidth()
            .dockedWave(EDITOR_SEED + 5)
            .padding(top = DOCK_WAVE_ROOM)
            .height(DOCK_ROW_HEIGHT)
            // A near miss between the tools is no tap on the page (which lets go of the keyboard).
            .pointerInput(Unit) { detectTapGestures { } }
            .semantics { contentDescription = L10n.Write.Editor.toolbarLabel },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.weight(1f).fadingEdges(scroll, 16.dp).horizontalScroll(scroll).padding(horizontal = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            val a = bridge.active
            DockTool(L10n.Write.Editor.insertImage, icon = IconName.Image, busy = uploadingImage, enabled = !uploadingImage, seed = 77.0, onClick = onInsertImage)
            DockTool(L10n.Write.Editor.insertCard, icon = IconName.Cards, seed = 70.0, onClick = onInsertCard)
            DockRule(3.0)
            DockTool(L10n.Write.Editor.bold, on = a.bold, seed = 21.0) { bridge.exec("bold") }
            DockTool(L10n.Write.Editor.italic, on = a.italic, seed = 28.0) { bridge.exec("italic") }
            DockRule(9.0)
            DockTool("H2", on = a.h2, seed = 35.0, spoken = L10n.Write.Editor.h2) { bridge.exec("h2") }
            DockTool("H3", on = a.h3, seed = 42.0, spoken = L10n.Write.Editor.h3) { bridge.exec("h3") }
            DockRule(15.0)
            DockTool(L10n.Write.Editor.quote, on = a.blockquote, seed = 63.0) { bridge.exec("blockquote") }
            DockTool(L10n.Write.Editor.bulletList, on = a.bulletList, seed = 49.0) { bridge.exec("bulletList") }
            DockTool(L10n.Write.Editor.orderedList, on = a.orderedList, seed = 56.0) { bridge.exec("orderedList") }
        }
        Box(
            Modifier
                .size(DOCK_ROW_HEIGHT)
                .plainClickable(role = Role.Button, onClick = bridge::releaseKeyboard)
                .semantics { contentDescription = L10n.Write.Editor.hideKeyboard },
            contentAlignment = Alignment.Center,
        ) { OrganicIcon(IconName.ChevronDown, size = 20.dp, color = Tokens.Text) }
    }
}

/** MarkdownEditor's `seed`; the buttons, rules and wave offset from it. */
private const val EDITOR_SEED = 17.0

/** The docked bar's row: a finger's 44. */
internal val DOCK_ROW_HEIGHT = 44.dp

/** The room above the row the bar's wavy top edge swings in. */
private val DOCK_WAVE_ROOM = 8.dp

/** The docked bar's whole height: its wave's room and its row. */
internal val DOCK_BAR_HEIGHT = DOCK_ROW_HEIGHT + DOCK_WAVE_ROOM

/**
 * ToolButton on the keyboard: 13sp semibold on nothing, or on its wobbly terracotta wash when on;
 * a finger's 44 tall around its 36 face; a disabled tool fades (0.6).
 */
@Composable
private fun DockTool(
    label: String,
    on: Boolean = false,
    icon: IconName? = null,
    busy: Boolean = false,
    seed: Double,
    enabled: Boolean = true,
    /** What TalkBack says when the face is a sign (H2: 大標). */
    spoken: String? = null,
    onClick: () -> Unit,
) {
    val color = if (on) Tokens.Terracotta else Tokens.Text
    Box(
        Modifier
            .heightIn(min = DOCK_ROW_HEIGHT)
            .widthIn(min = DOCK_ROW_HEIGHT)
            .plainClickable(role = Role.Button) { if (enabled) onClick() }
            .semantics {
                selected = on
                if (spoken != null) contentDescription = spoken
            },
        contentAlignment = Alignment.Center,
    ) {
        Row(
            Modifier
                .fade(if (enabled) 1f else 0.6f)
                .height(36.dp)
                .drawWithCache {
                    val h = (size.height / density).toDouble()
                    // A soft two-turn pill (R 0.4h, mag 1.4, bow 1.5).
                    val o = WobRectShape(h * 0.4, EDITOR_SEED + seed, mag = 1.4, options = WobRectOptions(
                        curve = 1.5, cornerJitter = 2.6, cornerOffset = h * 0.05, segmentsH = SegValue.Count(2.0), segmentsV = SegValue.Count(1.0),
                    )).createOutline(size, layoutDirection, this)
                    onDrawBehind { if (on) drawOutline(o, Tokens.TerracottaLight.copy(alpha = 0.7f)) }
                }
                .padding(horizontal = 9.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(5.dp),
        ) {
            if (busy) SketchLoader(15.dp) else if (icon != null) OrganicIcon(icon, size = 15.dp, color = color)
            BasicText(label, style = AppFonts.body(13f, 600, lineHeight = 1.3f, color = color))
        }
    }
}

/** The toolbar's vertical Divider (amplitude 1.2, 4 either side), as tall as a button's face. */
@Composable
private fun DockRule(offset: Double) {
    OrganicVerticalRule(Modifier.height(27.dp).padding(horizontal = 4.dp), seed = EDITOR_SEED + offset, amp = 1.2)
}

/**
 * The docked bar's paper and its top edge: the toolbar's pen line (wavyPath's construction, as
 * many turns as its width takes: [ruleSteps]) along the top, the cream below it.
 */
private fun Modifier.dockedWave(seed: Double): Modifier = drawWithCache {
    val w = (size.width / density).toDouble()
    val line = pointsToBezier(wavyPoints(w, DOCK_WAVE_ROOM.value / 2.0 + 1, 1.6, seed, ruleSteps(w.toFloat()))).toPath(density)
    val paper = Path().apply {
        addPath(line)
        lineTo(size.width, size.height)
        lineTo(0f, size.height)
        close()
    }
    val pen = Stroke(Tokens.InkLight.toPx(), cap = StrokeCap.Round)
    onDrawBehind {
        drawPath(paper, Tokens.Cream)
        drawPath(line, Tokens.FieldBorderHover.copy(alpha = 0.45f), style = pen)
    }
}

/**
 * wavyPath.ts `ruleSteps`: how many turns a hand-drawn rule across a box [width] dp wide takes —
 * one per ~80, 4 at the fewest and 12 at the most (10 before it is measured).
 */
internal fun ruleSteps(width: Float): Int =
    if (!(width > 0f)) 10 else (width / 80f).roundToInt().coerceIn(4, 12)

/**
 * How far the writer's page scrolls to keep the caret's line where it can be seen while typing:
 * the line ([top]…[bottom], in the page's viewport) below [bandTop] (the bar over the page) and
 * above [bandBottom] (the keyboard's format bar, 16 clear of it). Zero while it is inside — the
 * page never scrolls on every keystroke, only when the caret leaves the band.
 */
internal fun caretScroll(top: Float, bottom: Float, bandTop: Float, bandBottom: Float): Float = when {
    bottom > bandBottom -> bottom - bandBottom
    top < bandTop -> top - bandTop
    else -> 0f
}
