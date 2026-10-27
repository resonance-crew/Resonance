package com.resonance.app.ui

import com.resonance.design.generated.ResonanceColors
import com.resonance.design.generated.PaletteTheme
import com.resonance.design.generated.LocalResonanceColors
import com.resonance.design.OklchColor
import android.webkit.WebSettings
import android.os.Build
import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Color as AndroidColor
import android.net.Uri
import android.graphics.Rect
import android.view.MotionEvent
import android.view.View
import android.view.ViewTreeObserver
import android.view.inputmethod.InputMethodManager
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
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
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.BasicText
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.ui.unit.IntSize
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.foundation.relocation.bringIntoViewRequester
import androidx.compose.foundation.relocation.BringIntoViewRequester
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
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect as ComposeRect
import androidx.compose.ui.layout.LayoutCoordinates
import androidx.compose.ui.node.ModifierNodeElement
import androidx.compose.ui.node.requireLayoutCoordinates
import androidx.compose.ui.relocation.BringIntoViewModifierNode
import androidx.compose.ui.relocation.bringIntoView
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
    /**
     * The link the story's selection is in (round 16 §6: the island's `state.link` — a picked link card
     * included), or null; and whether the link sheet offers 卡片 for the selection now (`state.canCard`).
     */
    var link by mutableStateOf<IslandLink?>(null)
        private set
    var canCard by mutableStateOf(false)
        private set
    /** A link card in the story was tapped (it is picked now): the host opens its link sheet with 卡片 chosen. */
    var onLinkTap: (String) -> Unit = {}
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
    /** What the island was last told of its colours ([islandAppearance]), said again once it is ready. */
    private var appearance: String? = null
    private var minHeight: Int? = null

    val webView: StoryWebView = StoryWebView(context).apply {
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
        // The island is told its scheme and theme (setPalette); the browser never darkens it on its own.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            settings.isAlgorithmicDarkeningAllowed = false
        } else {
            @Suppress("DEPRECATION")
            settings.forceDark = WebSettings.FORCE_DARK_OFF
        }
        webViewClient = EditorClient()
        setBackgroundColor(AndroidColor.TRANSPARENT)
        // The writing screen scrolls; the island only grows.
        isVerticalScrollBarEnabled = false
        overScrollMode = View.OVER_SCROLL_NEVER
        setOnTouchListener { v, e ->
            if (e.actionMasked == MotionEvent.ACTION_DOWN) {
                lastTouchDown = e.downTime
                // Where the caret is about to be, until the island says (StoryWebView.getFocusedRect).
                (v as StoryWebView).touchY = e.y.roundToInt()
            }
            false
        }
        addJavascriptInterface(Bridge(), "ResonanceBridge")
        // The page around the story places it and keeps its caret in view (round 8 §6.4). Told of the
        // keyboard (the insets the AndroidView hands its view, measured from a story that runs on
        // past the screen), the browser shrank its own viewport and panned the story inside its frame
        // to show the caret — on top of the page's scroll: the line typed ended up ~200 px higher than
        // the keyboard needed. It is told of no insets at all.
        ViewCompat.setOnApplyWindowInsetsListener(this) { _, _ -> WindowInsetsCompat.CONSUMED }
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

    /**
     * The island's colours: the scheme the screen wears (always said — `data-scheme` light or dark —
     * so the island never decides by prefers-color-scheme on its own) and its theme (`data-accent`;
     * the wallpaper's, which the island's stylesheet doesn't know, as the palette's own custom
     * properties on its `<html>`). On load before the story is set, and on every change.
     */
    fun setPalette(palette: ResonanceColors) {
        val js = islandAppearance(palette)
        if (js == appearance) return
        appearance = js
        if (ready) webView.evaluateJavascript(js, null)
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

    /**
     * The story's own least height, in CSS px (dp): the canvas's editable root fills the rest of the
     * page, so a tap anywhere under the words lands in the story with the caret at its end, and its
     * placeholder has the room to wrap (the web canvas's min-height). Host styling only: the island's
     * own sheet keeps `min-height: 0` for hosts that don't ask.
     */
    fun setMinHeight(px: Int) {
        if (px == minHeight) return
        minHeight = px
        if (ready) applyMinHeight(px)
    }

    private fun applyMinHeight(px: Int) {
        webView.evaluateJavascript("(function(){var e=document.querySelector('#editor .ProseMirror');if(e)e.style.minHeight='${px}px';})()", null)
    }

    /**
     * Whether the story's selection holds words (the link sheet's default: 文字 for words selected, 卡片 on
     * an empty line), asked of the page; [answer] on the main thread.
     */
    fun selectionHasWords(answer: (Boolean) -> Unit) {
        if (!ready) return answer(false)
        webView.evaluateJavascript("(function(){var s=document.getSelection();return !!s&&!s.isCollapsed&&s.toString().trim().length>0})()") { result ->
            answer(result == "true")
        }
    }

    /**
     * The link sheet's 完成 (round 16 §6): links the selection (or the caret's link, or a picked card) to
     * [href], shown as a card or as words ([display]); [done] hears whether the island took it (false: an
     * address it doesn't link to, or 卡片 where none can stand).
     */
    fun applyLink(href: String, display: LinkDisplay, done: (Boolean) -> Unit = {}) {
        val args = JsonObject(mapOf("href" to JsonPrimitive(href), "display" to JsonPrimitive(display.key)))
        webView.evaluateJavascript("ResonanceEditor.exec('link', $args)") { done(it == "true") }
    }

    /** 移除連結: a picked card goes, a link's words stay. */
    fun removeLink() {
        webView.evaluateJavascript("ResonanceEditor.exec('unlink')", null)
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
     * Back from something that took the window a moment (the photo picker, the card picker — picked
     * or not): the story takes its caret, its selection, the keyboard and its format bar back where
     * they were, as soon as the window is the app's again (a keyboard can't be shown to a window
     * without the focus, and a picker's answer comes before the window has it back).
     */
    fun refocusWhenBack() {
        if (webView.hasWindowFocus()) {
            webView.post { refocus() }
            return
        }
        webView.viewTreeObserver.addOnWindowFocusChangeListener(object : ViewTreeObserver.OnWindowFocusChangeListener {
            override fun onWindowFocusChanged(hasFocus: Boolean) {
                if (!hasFocus) return
                webView.viewTreeObserver.removeOnWindowFocusChangeListener(this)
                webView.post { refocus() }
            }
        })
    }

    /**
     * The room the page keeps clear of the caret's line (px): [above] under the bar over the page,
     * [below] over the keyboard's format bar — the same band the page's own caret follow keeps it
     * in ([caretScroll]), so the page's keep-the-focused-thing-in-view lands it there too.
     */
    fun keepCaretClear(above: Int, below: Int) {
        webView.clearAbove = above
        webView.clearBelow = below
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
                // Its colours before its words, so the story never shows in the other scheme's ink.
                appearance?.let { webView.evaluateJavascript(it, null) }
                // The title first, so the story it opens with is read with it.
                pendingTitle?.let(::setTitle)
                pendingTitle = null
                pendingMarkdown?.let(::setMarkdown)
                pendingMarkdown = null
                minHeight?.let(::applyMinHeight)
            }
            is IslandMessage.Change -> onChange(m.markdown)
            is IslandMessage.Height -> height = maxOf(if (canvas) 0 else FIELD_MIN_HEIGHT, m.px)
            is IslandMessage.State -> {
                active = m.active
                link = m.link
                canCard = m.canCard
            }
            is IslandMessage.LinkTap -> onLinkTap(m.href)
            is IslandMessage.Focus -> {
                focused = m.focused
                if (!m.focused) {
                    caret = null
                    webView.caretLine = null
                    webView.touchY = null
                }
            }
            is IslandMessage.Script -> {
                script = m.script
                lang = m.lang
            }
            is IslandMessage.Caret -> {
                caret = m
                val px = webView.resources.displayMetrics.density
                webView.caretLine = (m.top * px).roundToInt()..(m.bottom * px).roundToInt()
            }
        }
    }

    internal companion object {
        /** The island, as the app bundles it (npm run native:editor → native/editor/dist → the assets). */
        const val EDITOR_PATH = "/android_asset/editor.html"
        /** The framed field's least height. */
        const val FIELD_MIN_HEIGHT = 200
        /** The canvas before the island has said how tall its words are: a line of them. */
        const val CANVAS_START_HEIGHT = 40

        /**
         * The script that dresses the island's `<html>` in [palette]: `data-scheme` (light or dark,
         * always), `data-accent` for one of the four themes (absent for terracotta), and for any other
         * palette (the wallpaper's) every token as a custom property on the element itself, in sRGB
         * (an older WebView reads no oklch() or display-p3) — removed again when a theme returns.
         */
        fun islandAppearance(palette: ResonanceColors): String {
            val scheme = if (palette.dark) "dark" else "light"
            val theme = PaletteTheme.entries.firstOrNull { ResonanceColors.of(it, palette.dark) == palette }
            val accent = theme?.takeIf { it != PaletteTheme.Terracotta }?.key
            val vars = if (theme != null) JsonObject(emptyMap()) else JsonObject(
                ResonanceColors.TOKENS.associate { token ->
                    val c = palette.oklchOf(token).let { (l, ch, h, a) -> OklchColor.of(l, ch, h, a) }
                    "--$token" to JsonPrimitive(cssRgb(c))
                },
            )
            return "(function(){var h=document.documentElement,v=$vars;" +
                "h.setAttribute('data-scheme','$scheme');" +
                (if (accent != null) "h.setAttribute('data-accent','$accent');" else "h.removeAttribute('data-accent');") +
                "(h.dataset.hostVars||'').split(',').forEach(function(k){if(k)h.style.removeProperty(k);});" +
                "Object.keys(v).forEach(function(k){h.style.setProperty(k,v[k]);});" +
                "h.dataset.hostVars=Object.keys(v).join(',');})()"
        }

        /** A colour as CSS reads it anywhere: `rgb(r g b / a)` in sRGB. */
        private fun cssRgb(c: androidx.compose.ui.graphics.Color): String {
            val s = c.convert(androidx.compose.ui.graphics.colorspace.ColorSpaces.Srgb)
            fun ch(v: Float) = (v.coerceIn(0f, 1f) * 255).roundToInt()
            val alpha = (s.alpha * 1000).roundToInt() / 1000.0
            return "rgb(${ch(s.red)} ${ch(s.green)} ${ch(s.blue)}" + (if (alpha < 1) " / $alpha)" else ")")
        }

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

/**
 * The island's WebView, telling the page around it where its caret is. As the keyboard shrinks the
 * page, Compose keeps the focused thing in view (foundation's ContentInViewNode), and a focused
 * View's area is its [getFocusedRect] — for a WebView the whole of it, so the page lined up the
 * story's top under the bar (or its foot over the format bar) and the line being typed went out of
 * sight. Here that area is the caret's line ([caretLine], px in this view) with the room the page's
 * bars cover above and below it ([clearAbove], [clearBelow]); until the island has said where the
 * caret is, the line the finger came down on ([touchY]); with neither, an empty line at the story's
 * top, which no shrinking page moves for.
 */
@SuppressLint("ViewConstructor")
class StoryWebView(context: Context) : WebView(context) {
    var caretLine: IntRange? = null
    var touchY: Int? = null
    var clearAbove = 0
    var clearBelow = 0

    override fun getFocusedRect(r: Rect) {
        val span = focusedSpan(caretLine, touchY, clearAbove, clearBelow, (TOUCH_LINE_DP * resources.displayMetrics.density).roundToInt())
        r.set(0, span.first, width, span.last)
    }

    internal companion object {
        /** Half a line around a touch (dp), the caret's line until the island says. */
        const val TOUCH_LINE_DP = 14
    }
}

/**
 * Between the story's WebView and the page that scrolls it (round 8 §6.4): a view taking the focus
 * asks for all of itself to be on screen (View.onFocusChanged → requestRectangleOnScreen), and so
 * does the browser as its editable takes the focus (Chromium's ImeAdapter, focusedNodeChanged) — and
 * the AndroidView brings what its view asks for into view. For a story taller than what the keyboard
 * leaves of the page, the page then lined up the story's top under the bar, and the line tapped went
 * with it (seen on a Pixel 10 Pro: a 560 px jump for a tap on a line already in view). This node,
 * ahead of the AndroidView's own, takes such a request first: (nearly) all of the story is the caret's
 * line instead ([requestedSpan]) — or nothing, with no line known — and every request keeps the room
 * the bars cover clear around it.
 */
private class StoryBringIntoViewElement(val web: StoryWebView) : ModifierNodeElement<StoryBringIntoView>() {
    override fun create() = StoryBringIntoView(web)
    override fun update(node: StoryBringIntoView) {
        node.web = web
    }
    override fun hashCode() = web.hashCode()
    override fun equals(other: Any?) = other is StoryBringIntoViewElement && other.web === web
}

private class StoryBringIntoView(var web: StoryWebView) : Modifier.Node(), BringIntoViewModifierNode {
    override suspend fun bringIntoView(childCoordinates: LayoutCoordinates, boundsProvider: () -> ComposeRect?) {
        val touchHalf = (StoryWebView.TOUCH_LINE_DP * web.resources.displayMetrics.density).roundToInt()
        fun shown(): ComposeRect? {
            val r = boundsProvider() ?: return null
            val span = requestedSpan(r.top.roundToInt(), r.bottom.roundToInt(), web.height, web.caretLine, web.touchY, web.clearAbove, web.clearBelow, touchHalf)
                ?: return null
            val mine = requireLayoutCoordinates()
            val at = if (childCoordinates.isAttached && mine.isAttached) mine.localPositionOf(childCoordinates, Offset.Zero) else Offset.Zero
            return ComposeRect(r.left + at.x, span.first + at.y, r.right + at.x, span.last + at.y)
        }
        if (shown() == null) return
        bringIntoView { shown() }
    }
}

/**
 * What a request to show [top]…[bottom] of the story (px, in a view [height] tall) asks the page for:
 * (nearly) the whole story — a view taking the focus, the browser's editable taking it — is no place
 * to scroll to, so it is the caret's [line] (or the line the finger came down on, [touchY]) instead,
 * or nothing (null) with neither; anything smaller (the browser's own caret, an accessibility node)
 * stands. Either way [above] and [below] are kept clear of it (the bars over the page).
 */
internal fun requestedSpan(top: Int, bottom: Int, height: Int, line: IntRange?, touchY: Int?, above: Int, below: Int, touchHalf: Int): IntRange? {
    val whole = height > 0 && bottom - top >= height * 9 / 10
    if (!whole) return (top - above)..(bottom + below)
    if (line == null && touchY == null) return null
    return focusedSpan(line, touchY, above, below, touchHalf)
}

/**
 * The top and bottom of [StoryWebView]'s focused area, px in its own frame: the caret's [line] — or
 * a line [touchHalf] round [touchY] — with [above] and [below] kept clear of it; with neither, an
 * empty line at the top.
 */
internal fun focusedSpan(line: IntRange?, touchY: Int?, above: Int, below: Int, touchHalf: Int): IntRange {
    val known = line ?: touchY?.let { (it - touchHalf)..(it + touchHalf) } ?: return 0..0
    return (known.first - above)..(known.last + below)
}

/** How a link shows (round 16 §6): its page's card, alone on its line, or words that link. */
enum class LinkDisplay(val key: String) { Card("card"), Text("text") }

/** The link the story's selection is in, as the island says it (`state.link`). */
data class IslandLink(val href: String, val display: LinkDisplay, val standalone: Boolean, val words: String)

/** What the island posts (native/editor/src/island.ts `Message`); a type it doesn't know is left alone. */
sealed interface IslandMessage {
    data object Ready : IslandMessage
    data class Change(val markdown: String) : IslandMessage
    /** The page's height, in CSS px (dp at the device's width). */
    data class Height(val px: Int) : IslandMessage
    data class State(val active: StoryEditorBridge.Active, val link: IslandLink? = null, val canCard: Boolean = false) : IslandMessage
    /** A link card was tapped (round 16 §6). */
    data class LinkTap(val href: String) : IslandMessage
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
                    val l = runCatching { m["link"]?.jsonObject }.getOrNull()
                    fun linkString(key: String) = (l?.get(key) as? JsonPrimitive)?.contentOrNull
                    val link = linkString("href")?.takeIf { it.isNotEmpty() }?.let { href ->
                        IslandLink(
                            href,
                            if (linkString("display") == "card") LinkDisplay.Card else LinkDisplay.Text,
                            (l?.get("standalone") as? JsonPrimitive)?.booleanOrNull ?: false,
                            linkString("words") ?: "",
                        )
                    }
                    State(
                        StoryEditorBridge.Active(on("bold"), on("italic"), on("h2"), on("h3"), on("bulletList"), on("orderedList"), on("blockquote")),
                        link,
                        (m["canCard"] as? JsonPrimitive)?.booleanOrNull ?: false,
                    )
                }
                "linkTap" -> string("href")?.takeIf { it.isNotEmpty() }?.let { LinkTap(it) }
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
 * island as tall as its words, at least [minHeight] (its editable root fills that, so a tap anywhere
 * under the words lands in the story), set in the story's type at the reading scale (up to 2× of
 * the system's text size, as the card page reads it). Formatting is the keyboard's [StoryFormatBar].
 */
@Composable
fun StoryCanvas(bridge: StoryEditorBridge, minHeight: Dp, modifier: Modifier = Modifier) {
    ReadingTextScale {
        val fontScale = LocalDensity.current.fontScale
        SideEffect { bridge.setTextScale(fontScale) }
    }
    SideEffect { bridge.setMinHeight(minHeight.value.roundToInt()) }
    val palette = LocalResonanceColors.current
    SideEffect { bridge.setPalette(palette) }
    AndroidView(
        factory = { bridge.webView },
        modifier = modifier
            .fillMaxWidth()
            .height(bridge.height.dp)
            .semantics { contentDescription = L10n.Write.storyLabel }
            // Ahead of the AndroidView's own bring-into-view: what the story asks to be shown, it is shown as (requestedSpan).
            .then(StoryBringIntoViewElement(bridge.webView)),
    )
}

/**
 * The format bar on the keyboard (writer.spec §1.5, touch): while the story has the focus, a cream
 * strip rides the keyboard with the toolbar's wave as its top edge — 插入圖片 · 插入卡片 ┆ 粗體 ·
 * 斜體 ┆ H2 · H3 ┆ 引言 · 清單 · 編號 ┆ 連結 in one row that scrolls sideways (fading where more lies), and
 * 收起鍵盤 pinned at its end. Its buttons never take the focus from the story. With the keyboard down
 * (the story still holding the focus) its paper runs on to the screen's bottom edge, under the
 * system's navigation bar — gesture or three-button — the row standing above it (the inset is the
 * paper's own padding, never air below it the story would show through).
 */
@Composable
fun StoryFormatBar(
    bridge: StoryEditorBridge,
    onInsertImage: () -> Unit,
    onInsertCard: () -> Unit,
    uploadingImage: Boolean,
    modifier: Modifier = Modifier,
    /** 連結 (round 16 §6, round 17 §6): the link editor for the selection, or the caret's link. */
    onLink: () -> Unit = {},
) {
    val scroll = rememberScrollState()
    Row(
        modifier
            .fillMaxWidth()
            .dockedWave(EDITOR_SEED + 5)
            // Inside the paper: an inset the keyboard (consumed above, imePadding) doesn't cover.
            .navigationBarsPadding()
            .padding(top = DOCK_WAVE_ROOM)
            .height(DOCK_ROW_HEIGHT)
            // A near miss between the tools is no tap on the page (which lets go of the keyboard).
            .pointerInput(Unit) { detectTapGestures { } }
            .semantics { contentDescription = L10n.Write.Editor.toolbarLabel },
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            Modifier.weight(1f).fadingEdges(scroll, DOCK_FADE).horizontalScroll(scroll).padding(horizontal = 8.dp),
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
            // 連結 last, after a rule of its own (round 17 §6.1), its glyph and words kept; washed while the selection is in a link.
            DockRule(21.0)
            DockTool(L10n.Write.Editor.link, on = bridge.link != null, icon = IconName.Link, seed = 31.0, onClick = onLink)
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

/** How far the tools fade at the row's scrolling edges. */
private val DOCK_FADE = 16.dp

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
    val wash = Tokens.TerracottaLight.copy(alpha = 0.7f)
    // A tool that turns on out of sight (a 360 dp phone: 連結, the lists past the edge) is scrolled into the
    // row the least that shows it — clear of the edges' 16 fade too (round 16 review F3).
    val bring = remember { BringIntoViewRequester() }
    val fade = with(LocalDensity.current) { DOCK_FADE.toPx() }
    var toolSize by remember { mutableStateOf(IntSize.Zero) }
    // Asked again when it is measured anew too (a narrower row may hide a tool that was on all along).
    LaunchedEffect(on, toolSize) {
        if (on && toolSize != IntSize.Zero) bring.bringIntoView(ComposeRect(-fade, 0f, toolSize.width + fade, toolSize.height.toFloat()))
    }
    Box(
        Modifier
            .bringIntoViewRequester(bring)
            .onSizeChanged { toolSize = it }
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
                    onDrawBehind { if (on) drawOutline(o, wash) }
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
@Composable
private fun Modifier.dockedWave(seed: Double): Modifier {
    val paperInk = Tokens.Cream
    val lineInk = Tokens.FieldBorderHover.copy(alpha = 0.45f)
    return drawWithCache {
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
        drawPath(paper, paperInk)
        drawPath(line, lineInk, style = pen)
    }
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
