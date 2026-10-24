import DesignSystem
import ResonanceKit
import SwiftUI
import WebKit

/// The story editor island (native/editor, the web's Tiptap schema) in a
/// WKWebView, embedded: the page is transparent and never scrolls; it
/// reports its height, its Markdown, which toolbar buttons are on, how the
/// story is set (its script, for the title above it) and — while it has the
/// focus — the caret's line, and takes toolbar commands (ResonanceEditor.exec)
/// and the card's title. The web view reaches only the page and its fonts,
/// and never leaves the page (`EditorPage`).
@MainActor @Observable
final class StoryEditorBridge: NSObject, WKScriptMessageHandler, WKNavigationDelegate, WKUIDelegate {
    struct Active: Equatable {
        var bold = false, italic = false, h2 = false, h3 = false
        var bulletList = false, orderedList = false, blockquote = false
    }

    /// The caret's line in the page, in its points as laid out (the text scale's zoom included).
    struct Caret: Equatable {
        var top: CGFloat
        var bottom: CGFloat
    }

    private(set) var ready = false
    private(set) var height: CGFloat
    private(set) var active = Active()
    private(set) var canUndo = false
    private(set) var focused = false
    /// How the island sets the story now (writerScript: an empty story in the interface language's
    /// type, changing only once it clearly leans the other way): the title is set the same way.
    private(set) var script: StoryScript
    /// The story's language, when the island could tell (`lang` on the title and the story).
    private(set) var scriptLang: String?
    /// Where the caret is while the story has the focus (nil otherwise).
    private(set) var caret: Caret?
    /// How tall what is written stands (the canvas: the editable root's foot, the text scale's zoom
    /// included) — the page under it may be taller, as tall as the view the island is given.
    private(set) var contentHeight: CGFloat?
    /// The story as the editor serializes it (the web's Markdown).
    var onChange: (String) -> Void = { _ in }

    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored let layout: EditorPage.Layout
    @ObservationIgnored private var pendingMarkdown: String?
    @ObservationIgnored private var pendingTitle: String?
    @ObservationIgnored private var textScale: CGFloat = 1
    /// Holds the island's own scroll view at its top (its delegate; the scroll view keeps it weakly).
    @ObservationIgnored private let pin = PinnedScroll()
    /// Where a web link the writer taps in the story opens.
    @ObservationIgnored private let openInBrowser: (URL) -> Void

    /// The field's least height (the framed field's 200; the canvas sizes itself to what is written).
    private var minimumHeight: CGFloat { layout == .field ? 200 : 0 }

    /// `locale`: the interface language, whose type an empty story starts in (and the title with it).
    init(placeholder: String, layout: EditorPage.Layout = .field, locale: String? = nil,
         openInBrowser: @escaping (URL) -> Void = { InAppBrowser.open($0) }) {
        self.openInBrowser = openInBrowser
        self.layout = layout
        height = layout == .field ? 200 : 0
        script = locale.map(ScriptRule.localeScript) ?? .cjk
        let config = WKWebViewConfiguration()
        let controller = WKUserContentController()
        config.userContentController = controller
        // The page and its fonts, from the bundle under the page's own scheme — nothing else.
        config.setURLSchemeHandler(EditorPageHandler(), forURLScheme: EditorPage.scheme)
        // It keeps nothing: no cookies, storage or cache on disk.
        config.websiteDataStore = .nonPersistent()
        config.preferences.javaScriptCanOpenWindowsAutomatically = false
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        // A long press on a link would load it in a preview.
        webView.allowsLinkPreview = false
        // The content controller keeps its handlers alive, and the web view
        // (which this bridge holds) keeps the controller: registered directly,
        // the bridge and its web view would never be freed. The go-between
        // holds the bridge weakly, so closing the writer lets both go.
        controller.add(WeakScriptMessageHandler(self), name: "editor")
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        // The writing screen scrolls; the island only grows.
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.bounces = false
        // Nor does WebKit scroll it to show the caret over the keyboard (it would slide the story out of its
        // own frame, leaving the writer looking at an empty page): the writing screen keeps the caret in view.
        webView.scrollView.delegate = pin
        // The story is one field: the web form bar (‹ › ✓) over the keyboard has nowhere to go, and
        // the page's own toolbar is above it.
        webView.hideFormAccessoryBar()
        #if DEBUG
        webView.isInspectable = true
        #endif
        webView.load(URLRequest(url: EditorPage.url(placeholder: placeholder, layout: layout, locale: locale)))
    }

    // MARK: - Staying on the page

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        let decision = EditorNavigation.decide(action.request.url, mainFrame: action.targetFrame?.isMainFrame ?? false,
                                               tapped: action.navigationType == .linkActivated)
        if case let .openInBrowser(url) = decision { openInBrowser(url) }
        return decision == .allow ? .allow : .cancel
    }

    /// The editor opens a tapped link in a new window (Tiptap's openOnClick):
    /// a web page goes to the in-app browser, and no window is ever made.
    /// (WebKit asks only for a tap: the page can't open windows by itself.)
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if case let .openInBrowser(url) = EditorNavigation.decide(action.request.url, mainFrame: false, tapped: true) {
            openInBrowser(url)
        }
        return nil
    }

    /// The card's title, which the island reads with the story to set them both (`script`).
    func setTitle(_ title: String) {
        guard ready else {
            pendingTitle = title
            return
        }
        Task { _ = try? await webView.callAsyncJavaScript("ResonanceEditor.setTitle(t)", arguments: ["t": title], contentWorld: .page) }
    }

    /// Loads a saved story (kept out of undo history by the island).
    func setMarkdown(_ markdown: String) {
        guard ready else {
            pendingMarkdown = markdown
            return
        }
        Task { _ = try? await webView.callAsyncJavaScript("return ResonanceEditor.setMarkdown(md)", arguments: ["md": markdown], contentWorld: .page) }
    }

    /// A toolbar command; `args` for insertCard (href, title) and insertImage (src, alt).
    func exec(_ command: String, _ args: [String: String] = [:]) {
        Task { _ = try? await webView.callAsyncJavaScript("return ResonanceEditor.exec(c, a)", arguments: ["c": command, "a": args], contentWorld: .page) }
    }

    func focus() {
        Task { _ = try? await webView.callAsyncJavaScript("ResonanceEditor.focus()", arguments: [:], contentWorld: .page) }
    }

    /// The story's focus again with its caret (or selection) where it was — the photo picker borrowed
    /// the keyboard (round 8 §6.5). Not `focus()`, which puts the caret at the story's end: the story's
    /// editable root takes the focus itself, and ProseMirror, which keeps its selection while it is
    /// blurred, puts that selection back on the page as it does.
    func refocus() {
        let script = "const root = document.querySelector('.ProseMirror'); if (root) root.focus({ preventScroll: true });"
        Task { _ = try? await webView.callAsyncJavaScript(script, arguments: [:], contentWorld: .page) }
    }

    #if DEBUG
    /// Pastes into the story as a paste from the system's pasteboard reaches it — the page's own
    /// paste event, carrying `text` (and `html` beside it, as a rich-text source puts it) — so the
    /// island's paste rule is checked on a simulator without the person's own clipboard (screen
    /// checks only: `-writePaste`).
    func debugPaste(text: String, html: String?) {
        let script = """
        const root = document.querySelector('.ProseMirror');
        if (!root) return false;
        root.focus();
        const data = new DataTransfer();
        data.setData('text/plain', text);
        if (html) data.setData('text/html', html);
        return root.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
        """
        Task {
            _ = try? await webView.callAsyncJavaScript(script, arguments: ["text": text, "html": html ?? NSNull()], contentWorld: .page)
        }
    }
    #endif

    /// Lets go of the story's focus (the keyboard goes with it).
    func blur() {
        Task { _ = try? await webView.callAsyncJavaScript("ResonanceEditor.blur()", arguments: [:], contentWorld: .page) }
    }

    /// The page's own text doesn't follow Dynamic Type, so the page is zoomed
    /// by the factor the rest of the story text takes (it reflows to the width
    /// and reports its zoomed height).
    func setTextScale(_ factor: CGFloat) {
        textScale = factor
        guard ready else { return }
        Task { _ = try? await webView.callAsyncJavaScript("document.body.style.zoom = z", arguments: ["z": factor], contentWorld: .page) }
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], let type = body["type"] as? String else { return }
        handle(type, body)
    }

    /// One message from the island (`type` and its fields); a type it doesn't know is left alone.
    func handle(_ type: String, _ body: [String: Any]) {
        switch type {
        case "ready":
            ready = true
            // In case WebKit made its content view anew with the page.
            webView.hideFormAccessoryBar()
            setTextScale(textScale)
            // The title first: the story opened is read with it.
            if let pendingTitle { setTitle(pendingTitle) }
            pendingTitle = nil
            if let pendingMarkdown { setMarkdown(pendingMarkdown) }
            pendingMarkdown = nil
        case "change":
            onChange(body["markdown"] as? String ?? "")
        case "height":
            if let px = Self.number(body["px"]) { height = max(minimumHeight, CGFloat(px)) }
            if layout == .canvas { measureContent() }
        case "state":
            let a = body["active"] as? [String: Bool] ?? [:]
            active = Active(bold: a["bold"] ?? false, italic: a["italic"] ?? false, h2: a["h2"] ?? false, h3: a["h3"] ?? false,
                            bulletList: a["bulletList"] ?? false, orderedList: a["orderedList"] ?? false, blockquote: a["blockquote"] ?? false)
            canUndo = body["canUndo"] as? Bool ?? false
        case "focus":
            focused = body["focused"] as? Bool ?? false
            if !focused { caret = nil }
        case "script":
            if let raw = body["script"] as? String, let next = StoryScript(rawValue: raw) { script = next }
            scriptLang = body["lang"] as? String
        case "caret":
            if let top = Self.number(body["top"]), let bottom = Self.number(body["bottom"]), focused {
                caret = Caret(top: CGFloat(top), bottom: CGFloat(bottom))
            }
        default:
            break
        }
    }

    /// Asks the island how tall what is written stands (its page is as tall as the view it is given,
    /// so `height` can't shrink below that): measured as the island measures the caret.
    private func measureContent() {
        Task {
            let script = """
            const el = document.querySelector('.ProseMirror');
            if (!el) return null;
            const zoom = parseFloat(document.body.style.zoom || '1') || 1;
            const drawn = document.body.getBoundingClientRect().height;
            const laidOut = document.body.offsetHeight;
            const scale = zoom !== 1 && Math.abs(drawn - laidOut) < Math.abs(drawn - laidOut * zoom) ? zoom : 1;
            return Math.ceil((el.getBoundingClientRect().bottom + window.scrollY) * scale);
            """
            if let px = Self.number(try? await webView.callAsyncJavaScript(script, arguments: [:], contentWorld: .page)) {
                contentHeight = CGFloat(px)
            }
        }
    }

    /// A number as WebKit hands one over (an NSNumber, whatever JavaScript made of it).
    private static func number(_ value: Any?) -> Double? {
        (value as? NSNumber)?.doubleValue
    }
}

extension WKWebView {
    /// Leaves out the bar WebKit puts over the keyboard for a web form (‹ › Done). There is no
    /// setting for it: the view that takes the keyboard (WebKit's content view) is given a subclass,
    /// made once with public runtime calls, whose `inputAccessoryView` is nil.
    func hideFormAccessoryBar() {
        guard let content = scrollView.subviews.first(where: { String(describing: type(of: $0)).hasPrefix("WKContent") }) else { return }
        let base: AnyClass = type(of: content)
        let suffix = "_ResonanceNoAccessory"
        // Given its subclass already.
        if NSStringFromClass(base).hasSuffix(suffix) { return }
        let name = NSStringFromClass(base) + suffix
        let subclass: AnyClass
        if let made = NSClassFromString(name) {
            subclass = made
        } else {
            guard let made = objc_allocateClassPair(base, name, 0) else { return }
            let none: @convention(block) (AnyObject) -> UIView? = { _ in nil }
            guard let method = class_getInstanceMethod(UIResponder.self, #selector(getter: UIResponder.inputAccessoryView)) else { return }
            class_addMethod(made, #selector(getter: UIResponder.inputAccessoryView), imp_implementationWithBlock(none),
                            method_getTypeEncoding(method))
            objc_registerClassPair(made)
            subclass = made
        }
        object_setClass(content, subclass)
    }
}

/// Keeps a scroll view at its top: the island's page never scrolls inside its web view (WebKit would,
/// to bring the caret above the keyboard), so the story always fills its frame from the first line.
final class PinnedScroll: NSObject, UIScrollViewDelegate {
    func scrollViewDidScroll(_ scrollView: UIScrollView) {
        if scrollView.contentOffset != .zero { scrollView.contentOffset = .zero }
    }
}

/// Passes the island's messages to a handler it doesn't keep alive.
final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    private weak var target: WKScriptMessageHandler?

    init(_ target: WKScriptMessageHandler) {
        self.target = target
    }

    func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        target?.userContentController(controller, didReceive: message)
    }
}

private struct IslandView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

/// The writer's story, as a bare page (writer.spec §1.4): the island in the canvas layout — no
/// frame and no toolbar, set in the reader's own type (src/styles/story.css under the web's tokens)
/// — at least as tall as what is left of the screen under the title, so a tap anywhere under the
/// words puts the caret in the story. The formatting is the keyboard's ``StoryFormatBar``.
struct StoryCanvasField: View {
    let bridge: StoryEditorBridge
    /// The least height the story takes (what is left of the window under the title).
    var minHeight: CGFloat

    var body: some View {
        let written = bridge.contentHeight ?? 0
        let height = max(written, minHeight, 44)
        IslandView(webView: bridge.webView)
            .frame(height: height)
            // Under the words the island's page is empty: a tap there writes on, at the story's end.
            .overlay(alignment: .bottom) {
                if height - written > 1 {
                    Color.clear
                        .frame(height: height - written)
                        .contentShape(Rectangle())
                        .onTapGesture { bridge.focus() }
                        .accessibilityHidden(true)
                }
            }
            // A story's words follow the person's text size up to 2× (the reading curve), as the reader's do.
            .onChange(of: TextScale.readingFactor(relativeTo: .body), initial: true) { _, factor in bridge.setTextScale(factor) }
            .accessibilityLabel(L10n.Write.storyLabel)
    }
}

/// The formatting bar docked on the keyboard while the story has the focus (writer.spec §1.5,
/// the web's KeyboardFormatBar): the cream paper with the toolbar's wave as its top edge, one row
/// that never wraps — 插入圖片 · 插入卡片 ┆ 粗體 · 斜體 ┆ H2 · H3 ┆ 引言 · 清單 · 編號 — scrolling
/// sideways, fading where more lies, and 收起鍵盤 pinned at its end. Its buttons never take the
/// focus from the story (the island keeps it, and each command focuses it again).
struct StoryFormatBar: View {
    let bridge: StoryEditorBridge
    var onInsertImage: () -> Void
    var onInsertCard: () -> Void
    var uploadingImage = false
    /// MarkdownEditor's `seed`; the buttons, rules and wave offset from it.
    private let seed = 17.0
    /// The row's height (each button a 44 target).
    static let rowHeight: CGFloat = 44
    /// The wave's place above the row, where the paper begins.
    static let waveTop: CGFloat = 8
    @State private var fades = (leading: false, trailing: false)

    var body: some View {
        HStack(spacing: 0) {
            ScrollView(.horizontal) {
                HStack(spacing: 2) {
                    tool(L10n.Write.Editor.insertImage, icon: .image, busy: uploadingImage, seed: 77, action: onInsertImage)
                        .disabled(uploadingImage)
                    tool(L10n.Write.Editor.insertCard, icon: .cards, seed: 70, action: onInsertCard)
                    rule(3)
                    tool(L10n.Write.Editor.bold, on: bridge.active.bold, seed: 21) { bridge.exec("bold") }
                    tool(L10n.Write.Editor.italic, on: bridge.active.italic, seed: 28) { bridge.exec("italic") }
                    rule(9)
                    tool("H2", spoken: L10n.Write.Editor.h2, on: bridge.active.h2, seed: 35) { bridge.exec("h2") }
                    tool("H3", spoken: L10n.Write.Editor.h3, on: bridge.active.h3, seed: 42) { bridge.exec("h3") }
                    rule(15)
                    tool(L10n.Write.Editor.quote, on: bridge.active.blockquote, seed: 63) { bridge.exec("blockquote") }
                    tool(L10n.Write.Editor.bulletList, on: bridge.active.bulletList, seed: 49) { bridge.exec("bulletList") }
                    tool(L10n.Write.Editor.orderedList, on: bridge.active.orderedList, seed: 56) { bridge.exec("orderedList") }
                }
                .padding(.horizontal, 12)
            }
            .scrollIndicators(.hidden)
            .onScrollGeometryChange(for: [Bool].self) { geo in
                let range = geo.contentSize.width - geo.containerSize.width
                return [range > 1 && geo.contentOffset.x > 1, range > 1 && geo.contentOffset.x < range - 1]
            } action: { _, ends in
                fades = (ends[0], ends[1])
            }
            .mask {
                HStack(spacing: 0) {
                    LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing)
                        .frame(width: fades.leading ? Self.fade : 0)
                    Color.black
                    LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                        .frame(width: fades.trailing ? Self.fade : 0)
                }
                .animation(.easeOut(duration: 0.15), value: fades.leading)
                .animation(.easeOut(duration: 0.15), value: fades.trailing)
            }
            // Pinned outside the row: the keyboard goes, and the bar with it.
            Button { bridge.blur() } label: {
                OrganicIcon(.chevronDown, size: 18, color: Tokens.text)
                    .frame(width: 44, height: Self.rowHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(ToolButtonStyle())
            .accessibilityLabel(L10n.Write.Editor.hideKeyboard)
            .padding(.trailing, 8)
        }
        .frame(height: Self.rowHeight)
        .padding(.top, Self.waveTop)
        .background(alignment: .top) {
            ZStack(alignment: .top) {
                Tokens.cream.padding(.top, Self.waveTop)
                // The toolbar's wave, turned over: the bar's top edge.
                ToolbarWave(seed: seed + 5)
                    .scaleEffect(x: 1, y: -1)
                    .frame(height: 54)
                    .offset(y: Self.waveTop - 54 * (1 - (42 + 12 * 0.35) / 54))
                    .allowsHitTesting(false)
            }
            .ignoresSafeArea(edges: .bottom)
        }
        .accessibilityElement(children: .contain)
        .accessibilityLabel(L10n.Write.Editor.toolbarLabel)
    }

    /// The edge fade where more of the row lies (the web's useEdgeFades).
    static let fade: CGFloat = 16

    /// The toolbar's vertical Divider (amplitude 1.2, 4 either side), as tall as a button's face.
    private func rule(_ offset: Double) -> some View {
        OrganicVerticalRule(seed: seed + offset, amp: 1.2)
            .frame(height: 27)
            .padding(.horizontal, 4)
            .accessibilityHidden(true)
    }

    /// ToolButton: 13pt semibold on nothing, or on its wobbly terracotta wash when on; a 44 target
    /// round a 36 face.
    private func tool(_ label: String, spoken: String? = nil, on: Bool = false, icon: IconName? = nil, busy: Bool = false,
                      seed: Double, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if busy {
                    SketchLoader(size: 15)
                } else if let icon {
                    OrganicIcon(icon, size: 15, color: on ? Tokens.terracotta : Tokens.text)
                }
                Text(label).font(AppFonts.body(13, weight: .semibold)).lineLimit(1).fixedSize()
            }
            .foregroundStyle(on ? Tokens.terracotta : Tokens.text)
            .padding(.horizontal, 9)
            .frame(minHeight: 36)
            .background { if on { ToolWashShape(seed: self.seed + seed).fill(Tokens.terracottaLight.opacity(0.7)) } }
            .frame(minWidth: 44, minHeight: Self.rowHeight)
            .contentShape(Rectangle())
        }
        .buttonStyle(ToolButtonStyle())
        .accessibilityLabel(spoken ?? label)
        .accessibilityAddTraits(on ? .isSelected : [])
    }
}

/// When the format bar shows: while the story has the focus, and for a moment after it lets go
/// (a tap moving from one of the bar's buttons back into the story mustn't make it blink).
struct FormatBarPresence {
    /// How long the bar stays after the story lets go of the focus.
    static let grace: Duration = .milliseconds(120)
}

/// A disabled tool fades (the web's 0.6).
private struct ToolButtonStyle: ButtonStyle {
    @Environment(\.isEnabled) private var enabled
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.opacity(enabled ? 1 : 0.6)
    }
}

/// ToolButton's wash: a soft two-turn pill (R 0.4h, mag 1.4, bow 1.5).
private nonisolated struct ToolWashShape: Shape {
    let seed: Double
    func path(in rect: CGRect) -> Path {
        let h = Double(rect.height)
        return WobRectShape(radius: h * 0.4, seed: seed, mag: 1.4, options: WobRectOptions(
            curve: 1.5, cornerJitter: 2.6, cornerOffset: h * 0.05, segmentsH: .count(2), segmentsV: .count(1)
        )).path(in: rect)
    }
}

/// The toolbar's pen line: AppHeader's construction — an 800×54 box stretched
/// over the toolbar, low in it, edge to edge — with as many turns as the width
/// it is shown at takes (``steps(width:)``), so a phone's isn't ten squeezed in.
struct ToolbarWave: View {
    let seed: Double

    /// The web's ruleSteps: a turn per ~80 of the toolbar's width, 4 at the fewest and 12 at the
    /// most; the old ten until it is measured.
    static func steps(width: CGFloat) -> Int {
        guard width > 0 else { return 10 }
        return min(12, max(4, Int((width / 80).rounded())))
    }

    var body: some View {
        Canvas { ctx, size in
            let steps = Self.steps(width: size.width)
            let line = pointsToBezier(wavyPoints(800, y0: 42 + 12 * 0.35, amp: 2, seed: seed, steps: steps)).path()
            let fitted = line.applying(CGAffineTransform(scaleX: size.width / 800, y: size.height / 54))
            ctx.stroke(fitted, with: .color(Tokens.fieldBorderHover.opacity(0.45)), style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
        }
        .accessibilityHidden(true)
    }
}
