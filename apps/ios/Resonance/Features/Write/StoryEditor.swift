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

    /// The link the selection is in (round 16 §6, the island's `state.link`): its address, how the reader
    /// shows it (its page's card, or words), whether it stands alone in its paragraph, and its words.
    struct Link: Equatable {
        enum Display: String { case card, text }
        var href: String
        var display: Display
        var standalone: Bool
        var words: String
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
    /// The link the selection is in (a picked link card too), and whether 卡片 is offered for it now.
    private(set) var link: Link?
    private(set) var canCard = false
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
    /// A link card in the story was tapped (it is picked now): the host opens its link sheet, 卡片 chosen.
    var onLinkTap: (String) -> Void = { _ in }

    @ObservationIgnored let webView: WKWebView
    @ObservationIgnored let layout: EditorPage.Layout
    @ObservationIgnored private var pendingMarkdown: String?
    @ObservationIgnored private var pendingTitle: String?
    @ObservationIgnored private var pendingPreviews: (previews: [HostLinkPreview], origin: URL)?
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
        // The island never decides its scheme by prefers-color-scheme: it wears the app's, set on its
        // <html> before the page's first paint (the window's appearance as it stands now) and again on
        // every change of the web view's own traits — a light/dark switch, a theme chosen in Settings.
        let opening = IslandAppearance(UIApplication.shared.connectedScenes.compactMap { ($0 as? UIWindowScene)?.keyWindow }
            .first?.traitCollection ?? webView.traitCollection)
        controller.addUserScript(WKUserScript(source: opening.script, injectionTime: .atDocumentStart, forMainFrameOnly: true))
        appearance = opening
        webView.registerForTraitChanges([UITraitUserInterfaceStyle.self, AccentTrait.self]) { [weak self] (view: WKWebView, _) in
            self?.wear(IslandAppearance(view.traitCollection))
        }
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

    // MARK: - The island's appearance

    /// What the island's <html> says (`data-scheme`, `data-accent`): the opening script's, then each worn since.
    @ObservationIgnored private(set) var appearance: IslandAppearance?

    /// Sets the island's scheme and theme once the page is up (until then the opening script holds;
    /// `ready` wears the web view's own again, in case it changed while the page loaded).
    func wear(_ next: IslandAppearance) {
        guard ready, next != appearance else { return }
        appearance = next
        Task { _ = try? await webView.callAsyncJavaScript(next.script, arguments: [:], contentWorld: .page) }
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

    // MARK: - Links (round 16 §6)

    /// The link sheet's 完成: links the selection the story kept (or changes the caret's link, or a picked card)
    /// to `href`, shown as `display`. False when the island refused it (an address it doesn't link to, or 卡片
    /// where no card can stand) — nothing changed then.
    func applyLink(_ href: String, display: Link.Display) async -> Bool {
        let result = try? await webView.callAsyncJavaScript("return ResonanceEditor.exec('link', { href: h, display: d })",
                                                            arguments: ["h": href, "d": display.rawValue], contentWorld: .page)
        return result as? Bool ?? false
    }

    /// The link sheet's 移除連結: a picked card goes, a link's words stay.
    func unlink() {
        exec("unlink")
    }

    /// Whether the story's selection is a caret (nothing selected) — asked as the link tool opens its sheet, so an
    /// empty line starts on 卡片 and selected words on 文字.
    func selectionIsCaret() async -> Bool {
        let script = "const s = document.getSelection(); return !s || s.isCollapsed;"
        let result = try? await webView.callAsyncJavaScript(script, arguments: [:], contentWorld: .page)
        return result as? Bool ?? true
    }

    /// One stored preview of a story link, as the island takes it.
    struct HostLinkPreview: Equatable {
        let url: String
        let title: String
        /// The server's site-relative `/api/link-image?…` path (the island shows only our own route's picture).
        let image: String?
    }

    /// A live card's stored link previews (its `linkPreviews`), for the link cards the story shows: their
    /// titles, and pictures from our own link-image route only (made absolute against `origin`).
    func setLinkPreviews(_ previews: [HostLinkPreview], origin: URL) {
        guard ready else {
            pendingPreviews = (previews, origin)
            return
        }
        let list: [[String: String]] = previews.map { p in
            var entry = ["url": p.url, "title": p.title]
            if let image = p.image, let absolute = URL(string: image, relativeTo: origin)?.absoluteString { entry["image"] = absolute }
            return entry
        }
        Task { _ = try? await webView.callAsyncJavaScript("ResonanceEditor.setLinkPreviews?.(p)", arguments: ["p": list], contentWorld: .page) }
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

    /// The state message's `link`: `{ href, display, standalone, words }`, or null for none.
    static func link(_ value: Any?) -> Link? {
        guard let map = value as? [String: Any], let href = map["href"] as? String, !href.isEmpty else { return nil }
        return Link(href: href, display: Link.Display(rawValue: map["display"] as? String ?? "") ?? .text,
                    standalone: map["standalone"] as? Bool ?? false, words: map["words"] as? String ?? "")
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
            // The appearance as the web view stands in its window now (it may have changed while the page
            // loaded); out of a window its traits say nothing yet, and its trait change on landing in one will.
            if webView.window != nil { wear(IslandAppearance(webView.traitCollection)) }
            setTextScale(textScale)
            // The title first: the story opened is read with it.
            if let pendingTitle { setTitle(pendingTitle) }
            pendingTitle = nil
            if let pendingMarkdown { setMarkdown(pendingMarkdown) }
            pendingMarkdown = nil
            if let pendingPreviews { setLinkPreviews(pendingPreviews.previews, origin: pendingPreviews.origin) }
            pendingPreviews = nil
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
            link = Self.link(body["link"])
            canCard = body["canCard"] as? Bool ?? false
        case "linkTap":
            if let href = body["href"] as? String, !href.isEmpty { onLinkTap(href) }
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

/// The island's scheme and theme, as its <html> carries them (palette.css's `data-scheme`, always
/// the resolved 'light' or 'dark', and `data-accent`).
struct IslandAppearance: Equatable {
    let scheme: PaletteScheme
    let accent: Accent

    init(_ traits: UITraitCollection) {
        scheme = PaletteScheme(traits)
        accent = traits.accent
    }

    init(scheme: PaletteScheme, accent: Accent) {
        self.scheme = scheme
        self.accent = accent
    }

    /// Sets both on the page's root element.
    var script: String {
        "document.documentElement.dataset.scheme = '\(scheme.rawValue)'; document.documentElement.dataset.accent = '\(accent.rawValue)';"
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
/// that never wraps — 插入圖片 · 插入卡片 ┆ 粗體 · 斜體 ┆ H2 · H3 ┆ 引言 · 清單 · 編號 ┆ 連結 (round 17 §6.1:
/// the link last, after a rule of its own, keeping its glyph) — scrolling sideways, fading where more
/// lies, and 收起鍵盤 pinned at its end. Its buttons never take the focus from the story (the island
/// keeps it, and each command focuses it again). Wider than a phone the row lies along the writing
/// column (``edges(width:pad:compact:inputPill:)``): its first tool's ink on the words' left edge,
/// 收起鍵盤 on their right — the wave and the paper still run from edge to edge.
struct StoryFormatBar: View {
    let bridge: StoryEditorBridge
    var onInsertImage: () -> Void
    var onInsertCard: () -> Void
    var uploadingImage = false
    /// 連結 (round 16 §6): the link editor for the selection or the caret's link.
    var onLink: () -> Void = {}
    /// A hardware keyboard's (the bar rests at the window's foot): the system's input pill sits in the
    /// window's trailing corner there, so the row keeps clear of it.
    var hardwareKeyboard = false
    @Environment(\.window) private var window
    @State private var barWidth: CGFloat = 0
    /// MarkdownEditor's `seed`; the buttons, rules and wave offset from it.
    private let seed = 17.0
    /// The row's height (each button a 44 target).
    static let rowHeight: CGFloat = 44
    /// The wave's place above the row, where the paper begins.
    static let waveTop: CGFloat = 8
    @State private var fades = (leading: false, trailing: false)
    /// Where each tool that is on lies across the row's visible width (by its id), and that width: a tool
    /// that is on is never faded at an end (review F3: the 連結 tool's wash was cut under the trailing fade).
    @State private var onFrames: [String: CGRect] = [:]
    @State private var rowWidth: CGFloat = 0

    /// The tools that are on now, by id, in the row's order.
    private var onTools: [String] {
        Self.toolOrder.filter { id in
            switch id {
            case "bold": bridge.active.bold
            case "italic": bridge.active.italic
            case "link": bridge.link != nil
            case "h2": bridge.active.h2
            case "h3": bridge.active.h3
            case "quote": bridge.active.blockquote
            case "bullets": bridge.active.bulletList
            case "numbers": bridge.active.orderedList
            default: false
            }
        }
    }

    /// The row's tools in order, by id.
    static let toolOrder = ["image", "card", "bold", "italic", "h2", "h3", "quote", "bullets", "numbers", "link"]

    var body: some View {
        let edges = Self.edges(width: barWidth, pad: window.pad, compact: window.layoutClass == .compact, inputPill: hardwareKeyboard)
        HStack(spacing: 0) {
            ScrollViewReader { proxy in
                ScrollView(.horizontal) {
                    // Android's measures (review F3): the tools side by side, 8 in from the row's ends.
                    HStack(spacing: 0) {
                        tool(L10n.Write.Editor.insertImage, id: "image", icon: .image, busy: uploadingImage, seed: 77, action: onInsertImage)
                            .disabled(uploadingImage)
                        tool(L10n.Write.Editor.insertCard, id: "card", icon: .cards, seed: 70, action: onInsertCard)
                        rule(3)
                        tool(L10n.Write.Editor.bold, id: "bold", on: bridge.active.bold, seed: 21) { bridge.exec("bold") }
                        tool(L10n.Write.Editor.italic, id: "italic", on: bridge.active.italic, seed: 28) { bridge.exec("italic") }
                        rule(9)
                        tool("H2", id: "h2", spoken: L10n.Write.Editor.h2, on: bridge.active.h2, seed: 35) { bridge.exec("h2") }
                        tool("H3", id: "h3", spoken: L10n.Write.Editor.h3, on: bridge.active.h3, seed: 42) { bridge.exec("h3") }
                        rule(15)
                        tool(L10n.Write.Editor.quote, id: "quote", on: bridge.active.blockquote, seed: 63) { bridge.exec("blockquote") }
                        tool(L10n.Write.Editor.bulletList, id: "bullets", on: bridge.active.bulletList, seed: 49) { bridge.exec("bulletList") }
                        tool(L10n.Write.Editor.orderedList, id: "numbers", on: bridge.active.orderedList, seed: 56) { bridge.exec("orderedList") }
                        // Last, after its own rule (round 17 §6.1); on (washed) while the selection is in a link.
                        rule(23)
                        tool(L10n.Write.Editor.link, id: "link", on: bridge.link != nil, icon: .link, seed: 31, action: onLink)
                    }
                    .padding(.leading, edges.leading)
                    .padding(.trailing, Self.rowInset)
                }
                .scrollIndicators(.hidden)
                .coordinateSpace(.named(Self.rowSpace))
                .onScrollGeometryChange(for: [Bool].self) { geo in
                    let range = geo.contentSize.width - geo.containerSize.width
                    return [range > 1 && geo.contentOffset.x > 1, range > 1 && geo.contentOffset.x < range - 1]
                } action: { _, ends in
                    fades = (ends[0], ends[1])
                }
                .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { rowWidth = $0 }
                // A tool coming on out of sight (the caret into a link, a heading, a list) is scrolled into view, by
                // the least distance that shows it — and one already on when the bar comes back with the keyboard.
                .onChange(of: onTools) { before, now in
                    guard let first = now.first(where: { !before.contains($0) }) else { return }
                    withAnimation(.easeOut(duration: 0.2)) { proxy.scrollTo(first) }
                }
                .task {
                    // After the row's first layout: the bar is made again each time the story takes the focus.
                    try? await Task.sleep(for: .milliseconds(50))
                    if let first = onTools.first { proxy.scrollTo(first) }
                }
                .mask {
                    let fade = Self.fadeWidths(fades: fades, onFrames: Array(onFrames.values), width: rowWidth)
                    HStack(spacing: 0) {
                        LinearGradient(colors: [.clear, .black], startPoint: .leading, endPoint: .trailing)
                            .frame(width: fade.leading)
                        Color.black
                        LinearGradient(colors: [.black, .clear], startPoint: .leading, endPoint: .trailing)
                            .frame(width: fade.trailing)
                    }
                    .animation(.easeOut(duration: 0.15), value: fade.leading)
                    .animation(.easeOut(duration: 0.15), value: fade.trailing)
                }
            }
            // Pinned outside the row: the keyboard goes, and the bar with it.
            Button { bridge.blur() } label: {
                OrganicIcon(.chevronDown, size: 18, color: Tokens.text)
                    .frame(width: 44, height: Self.rowHeight)
                    .contentShape(Rectangle())
            }
            .buttonStyle(ToolButtonStyle())
            .accessibilityLabel(L10n.Write.Editor.hideKeyboard)
            .padding(.trailing, edges.trailing)
        }
        .frame(height: Self.rowHeight)
        .onGeometryChange(for: CGFloat.self) { $0.size.width } action: { barWidth = $0 }
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
    /// The row's tools start this far in from its ends (Android's DockTool row).
    static let rowInset: CGFloat = 8
    private static let rowSpace = "storyFormatRow"
    /// A tool's ink starts this far into its button; 收起鍵盤's glyph (18) sits this far in from its 44.
    static let toolInk: CGFloat = 9
    static let chevronInk: CGFloat = 13
    /// What the system's input pill takes at the window's trailing foot under a hardware keyboard
    /// (iPadOS 26: about 62 wide, 24 in), with air.
    static let inputPillClear: CGFloat = 96

    /// The row's leading inset and 收起鍵盤's trailing one in a bar `width` wide. A phone's row runs from
    /// the bar's edges (8 in); wider, the tools start on the writing column's left edge (the page's
    /// ``LayoutClass/columnInset(_:measure:pad:)``) and 收起鍵盤 ends on its right — clear of the
    /// system's input pill under a hardware keyboard.
    static func edges(width: CGFloat, pad: CGFloat, compact: Bool, inputPill: Bool) -> (leading: CGFloat, trailing: CGFloat) {
        let clear = inputPill ? inputPillClear : 0
        guard !compact, width > 0 else { return (rowInset, max(8, clear)) }
        let column = LayoutClass.columnInset(width, pad: pad)
        return (max(rowInset, column - toolInk), max(8, column - chevronInk, clear))
    }

    /// How wide each end's fade is: ``fade`` where more of the row lies that way — but none over a tool that is
    /// on (its wash would read as cut), whose frame across the visible row is in `onFrames`.
    static func fadeWidths(fades: (leading: Bool, trailing: Bool), onFrames: [CGRect], width: CGFloat) -> (leading: CGFloat, trailing: CGFloat) {
        let leadingCovers = onFrames.contains { $0.minX < fade && $0.maxX > 0 }
        let trailingCovers = width > 0 && onFrames.contains { $0.maxX > width - fade && $0.minX < width }
        return (fades.leading && !leadingCovers ? fade : 0, fades.trailing && !trailingCovers ? fade : 0)
    }

    /// The toolbar's vertical Divider (amplitude 1.2, 4 either side), as tall as a button's face.
    private func rule(_ offset: Double) -> some View {
        OrganicVerticalRule(seed: seed + offset, amp: 1.2)
            .frame(height: 27)
            .padding(.horizontal, 4)
            .accessibilityHidden(true)
    }

    /// ToolButton: 13pt semibold on nothing, or on its wobbly terracotta wash when on; a 44 target
    /// round a 36 face.
    private func tool(_ label: String, id: String, spoken: String? = nil, on: Bool = false, icon: IconName? = nil, busy: Bool = false,
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
        .id(id)
        // Where a tool that is on lies across the visible row, so no fade covers it.
        .onGeometryChange(for: CGRect?.self) { on ? $0.frame(in: .named(Self.rowSpace)) : nil } action: { frame in
            onFrames[id] = frame
        }
    }
}

/// Whether the keyboard is a hardware one. UIKit then reports the keyboard as a sliver (iPadOS 26: no
/// height at all) while SwiftUI still keeps a band at the foot for the system's input pill; a software
/// keyboard is 260 and more, and a floating one keeps no band.
@MainActor @Observable final class KeyboardKind {
    private(set) var hardware = false
    @ObservationIgnored private var observer: NSObjectProtocol?

    /// A keyboard frame this tall is a hardware keyboard's.
    nonisolated static func isHardware(height: CGFloat) -> Bool { height < 120 }

    init() {
        observer = NotificationCenter.default.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification,
                                                          object: nil, queue: .main) { [weak self] note in
            guard let frame = note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect else { return }
            let hardware = Self.isHardware(height: frame.height)
            MainActor.assumeIsolated { self?.hardware = hardware }
        }
    }

    isolated deinit {
        if let observer { NotificationCenter.default.removeObserver(observer) }
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
