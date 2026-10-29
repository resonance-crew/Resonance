import DesignSystem
import OSLog
import SwiftUI
import UIKit
import WebKit

/// The paper puppets on a reading page (round 19, the owner's: 「偶爾會出現的小精靈」 on the home feed
/// and a card's page, behind Settings → 外觀 → 小紙團, off until turned on). The app doesn't draw them:
/// the web's own engine, cast and places run in the mascot island (`native/mascots/dist/mascots.html`,
/// `npm run native:mascots`), a transparent web view that is not there for VoiceOver. The app tells it where
/// its views are (``ReadingMarks`` → ``ReadingScene``) and what of the page is in view.
///
/// Round 20 (the owner, on the iPad: the puppets jumped frame by frame while the page scrolled): the island
/// lies *in* the scrolled content (``MascotLayer``, from `.mascotContent()` on the content's root), as tall as
/// the content, its points the content's own — so it moves with the page in the very frame the page moves,
/// with nothing to tell it per frame and no shift to put back. Its scroll stays 0; what of it is in view
/// (under no bar) is `mascots.inset`, sent now and then while the page moves and at once when it rests.
///
/// Applied to the page's `ScrollView`, whose content root is `.mascotContent()`; its marked views tell the
/// stage's ``ReadingMarkSink`` where they are. With the switch off — or `allowed` false (a card in the
/// trash) — no web view is made at all. The puppets pause while the page isn't showing (another tab, a
/// page pushed over it, the app in the background) and go with the page.
struct MascotStage: ViewModifier {
    /// Which page this is (the log's).
    var page: String
    /// The page may host them (not a card in the trash).
    var allowed = true
    /// Points of the scroll view's foot under something drawn over it (the phone's tab bar).
    var footRoom: CGFloat = 0
    /// Something standing in the right margin beside the story (a tablet's contents rail).
    var rail: CGRect?
    @State private var island: MascotIsland?
    /// Where the page's marked views are (they say so themselves).
    @State private var sink = ReadingMarkSink()
    /// What of the content was last in view (it moves every frame of a scroll: nothing here redraws for it).
    @State private var seen = Seen()
    @State private var appeared = false

    final class Seen {
        var view: MascotView?
    }
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isSelectedTab) private var selectedTab
    private let store = AppearanceStore.shared

    private var on: Bool { store.mascots && allowed }
    private var showing: Bool { appeared && selectedTab && scenePhase == .active }

    func body(content: Content) -> some View {
        content
            .environment(\.readingMarkSink, on ? sink : nil)
            // The content's root lays the island over itself (``MascotLayer``).
            .environment(\.mascotIsland, on ? island : nil)
            // What of the content is in view: the island hears it now and then on the way, and at rest.
            .onScrollGeometryChange(for: MascotView.self) { MascotView($0, footRoom: footRoom) } action: { _, view in
                // Kept whether or not there is an island yet: one made later (a card page once its card is in)
                // starts from it, since the page may not move again for a while.
                seen.view = view
                island?.view(view)
            }
            .onScrollPhaseChange { _, phase in island?.moving(phase != .idle) }
            .onAppear { appeared = true }
            .onDisappear { appeared = false }
            .task(id: on) {
                if on, island == nil {
                    island = MascotIsland(page: page)
                    MascotIsland.log.info("island made: \(page, privacy: .public)")
                } else if !on, let made = island {
                    made.stop()
                    island = nil
                    MascotIsland.log.info("island gone: \(page, privacy: .public)")
                }
                let made = island
                if let view = seen.view { made?.view(view) }
                made?.sceneSource = { [sink, rail] size in ReadingSceneBuilder.scene(sink.all, size: size, rail: rail) }
                sink.onChange = on ? { [weak made] in made?.sceneChanged() } : nil
                applySettings()
                made?.sceneChanged()
            }
            .onChange(of: rail) {
                island?.sceneSource = { [sink, rail] size in ReadingSceneBuilder.scene(sink.all, size: size, rail: rail) }
                island?.sceneChanged()
            }
            .onChange(of: colorScheme) { applySettings() }
            .onChange(of: reduceMotion) { applySettings() }
            .onChange(of: showing) { applySettings() }
    }

    private func applySettings() {
        guard let island else { return }
        island.theme(colorScheme == .dark ? "dark" : "light")
        island.reducedMotion(reduceMotion)
        island.paused(!showing)
    }
}

/// What of a scroll view's content is in view and under no bar, in the content's points: from under its
/// top insets (the status bar, a bar laid in its safe area) to above its bottom ones and `footRoom` (a tab
/// bar drawn over it).
struct MascotView: Equatable {
    var top: CGFloat
    var bottom: CGFloat

    init(top: CGFloat, bottom: CGFloat) {
        self.top = top
        self.bottom = bottom
    }

    /// The container is already what shows inside the insets (as the card page's reading meter reads it).
    init(_ geo: ScrollGeometry, footRoom: CGFloat) {
        top = (geo.contentOffset.y + geo.contentInsets.top).rounded()
        bottom = (top + geo.containerSize.height - footRoom).rounded()
    }
}

extension EnvironmentValues {
    /// The page's mascot island, for its content's root to lay over itself (``MascotLayer``).
    @Entry var mascotIsland: MascotIsland? = nil
}

extension View {
    /// The scrolled content's root on a page that may host the paper puppets: the space its marks are
    /// measured in, and the island laid over it (``MascotLayer``) while the page has one.
    func mascotContent() -> some View {
        readingContent().overlay(alignment: .topLeading) { MascotLayer() }
    }
}

/// The island over the scrolled content: its web view as wide as the content and at least as tall (in steps,
/// so a lazy list settling its height doesn't resize it each time), its points the content's, never touched;
/// and over it, where a puppet is, a tap that reaches the puppet instead of the card under it.
struct MascotLayer: View {
    @Environment(\.mascotIsland) private var island

    var body: some View {
        if let island {
            GeometryReader { geo in
                let size = CGSize(width: geo.size.width, height: MascotIsland.layerHeight(content: geo.size.height))
                ZStack(alignment: .topLeading) {
                    MascotIslandView(island: island)
                        .frame(width: size.width, height: size.height)
                        .allowsHitTesting(false)
                    MascotTaps(hits: island.hits) { island.tap(at: $0) }
                        .frame(width: size.width, height: size.height)
                }
                .frame(width: size.width, height: size.height, alignment: .topLeading)
                .onChange(of: size, initial: true) { _, now in island.laidOut(now) }
            }
            .accessibilityHidden(true)
        }
    }
}

/// Taps on the paper puppets (round 20, the owner: 「點擊是會有互動的」): only inside the places the island
/// says a puppet is (`hits`) — anywhere else the page under it takes the touch as before, scrolling, a card,
/// VoiceOver all. A tap there is the puppet's: the card under it doesn't open.
struct MascotTaps: View {
    let hits: MascotHits
    let tap: (CGPoint) -> Void

    var body: some View {
        Color.clear
            .contentShape(MascotHitShape(rects: hits.rects))
            .onTapGesture(coordinateSpace: .local) { tap($0) }
            .accessibilityHidden(true)
    }
}

/// Where the island says a tap reaches a puppet (its `hits`, in its own points), as one shape.
nonisolated struct MascotHitShape: Shape {
    var rects: [CGRect]

    func path(in rect: CGRect) -> Path {
        var path = Path()
        for r in rects { path.addRect(r.offsetBy(dx: rect.minX, dy: rect.minY)) }
        return path
    }

    /// Whether a tap at `point` (the island's points) reaches a puppet.
    static func reaches(_ point: CGPoint, _ rects: [CGRect]) -> Bool {
        rects.contains { $0.contains(point) }
    }
}

/// The island's latest word on where its puppets can be tapped.
@MainActor @Observable final class MascotHits {
    var rects: [CGRect] = []
}

/// The island's web view in the page (it lives with the ``MascotIsland`` that made it).
struct MascotIslandView: UIViewRepresentable {
    let island: MascotIsland

    func makeUIView(context: Context) -> WKWebView { island.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
}

/// The mascot island (native/mascots/src/island.ts): its web view, the calls into `window.mascots` and what
/// it says back (`hits`). Calls made before the page has loaded wait, the latest of each kind.
@MainActor final class MascotIsland: NSObject, WKNavigationDelegate {
    static let log = Logger(subsystem: "com.resonance.stories", category: "mascots")

    let webView: WKWebView
    /// Where a tap reaches a puppet (the island's points), as it last said.
    let hits = MascotHits()
    /// The page's scene for the island's size, built when it is sent (marks change many at a time).
    var sceneSource: ((CGSize) -> ReadingScene)?
    /// Which page this is (the log's).
    private let page: String
    private var ready = false
    /// The island's laid-out size (the content's width; its height in steps).
    private(set) var size: CGSize = .zero
    private var scene: String?
    private var sentScene: String?
    private var sceneWait: Task<Void, Never>?
    /// How many scenes the page has sent (a debug log's).
    private var sceneCount = 0
    /// What of it is in view, the content's points; nil until the page has said.
    private var shown: MascotView?
    private var isMoving = false
    private var insetWait: Task<Void, Never>?
    private var settings: [String: String] = [:]
    private var sentSettings: [String: String] = [:]
    private let messages = MascotMessages()
    #if DEBUG
    private var debug = MascotDebugVisit()
    #endif

    /// An island for `page` (the log's: "feed", "card", "settings").
    init(page: String) {
        self.page = page
        let config = WKWebViewConfiguration()
        config.suppressesIncrementalRendering = false
        config.mediaTypesRequiringUserActionForPlayback = .all
        config.userContentController.add(messages, name: "mascots")
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        messages.island = self
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.underPageBackgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        // Never the scroll view a tap on the status bar sends to the top (two would leave neither doing it).
        webView.scrollView.scrollsToTop = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // Never a touch, never VoiceOver's: the page under it is what is read and tapped (taps on a puppet
        // are caught over it, ``MascotTaps``, and handed in).
        webView.isUserInteractionEnabled = false
        webView.accessibilityElementsHidden = true
        webView.isAccessibilityElement = false
        webView.navigationDelegate = self
        #if DEBUG
        webView.isInspectable = true
        #endif
        if let html = Bundle.main.url(forResource: "mascots", withExtension: "html") {
            webView.loadFileURL(html, allowingReadAccessTo: html.deletingLastPathComponent())
        } else {
            Self.log.error("mascots.html is not in the app (npm run native:mascots)")
        }
    }

    nonisolated func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        MainActor.assumeIsolated {
            ready = true
            flush()
        }
    }

    /// The layer's height for content `height` tall: at least that, in steps of 1024.
    static func layerHeight(content height: CGFloat) -> CGFloat {
        (max(height, 1) / 1024).rounded(.up) * 1024
    }

    // MARK: What the page says

    /// The layer was laid out at `size`: the scene again, for the new size.
    func laidOut(_ size: CGSize) {
        guard size != self.size else { return }
        self.size = size
        sendInset(refresh: true)
        sceneChanged()
    }

    /// The page's marks changed: the scene is built and sent at most every 200 ms, the latest.
    func sceneChanged() {
        guard sceneWait == nil else { return }
        sceneWait = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(200))
            guard let self, !Task.isCancelled else { return }
            self.sceneWait = nil
            guard self.size.width > 0, let source = self.sceneSource else { return }
            self.scene(source(self.size))
        }
    }

    /// The scene, as it is (a settings strip's, or a page's built by ``sceneChanged()``).
    func scene(_ scene: ReadingScene) {
        guard let data = try? JSONEncoder().encode(scene), let json = String(data: data, encoding: .utf8) else { return }
        self.scene = json
        sceneCount += 1
        sendScene()
    }

    /// What of the content is in view.
    func view(_ view: MascotView) {
        guard view != shown else { return }
        shown = view
        if isMoving {
            // On the way: now and then, the latest.
            guard insetWait == nil else { return }
            insetWait = Task { [weak self] in
                try? await Task.sleep(for: .milliseconds(150))
                guard let self, !Task.isCancelled else { return }
                self.insetWait = nil
                self.sendInset(refresh: false)
            }
        } else {
            sendInset(refresh: true)
        }
    }

    /// The page started or stopped moving: at rest, the view at once.
    func moving(_ moving: Bool) {
        isMoving = moving
        if !moving {
            insetWait?.cancel()
            insetWait = nil
            sendInset(refresh: true)
        }
    }

    /// Points of the island's top and foot out of view, as given (a settings strip's headroom).
    func inset(top: CGFloat, bottom: CGFloat) {
        set("inset", "mascots.inset(\(Self.number(top)), \(Self.number(bottom)))")
    }

    func theme(_ theme: String) { set("theme", "mascots.theme('\(theme)')") }
    func reducedMotion(_ on: Bool) { set("motion", "mascots.reducedMotion(\(on))") }
    func paused(_ paused: Bool) { set("pause", paused ? "mascots.pause()" : "mascots.resume()") }

    /// A tap on a puppet, at the island's point: it reacts (a hop, then something its place allows…).
    func tap(at point: CGPoint) {
        guard ready else { return }
        let js = "String(mascots.tap(\(Self.number(point.x)), \(Self.number(point.y))))"
        webView.evaluateJavaScript(js) { value, _ in
            Self.log.info("tap \(point.debugDescription, privacy: .public) → \(String(describing: value), privacy: .public)")
        }
    }

    func stop() {
        sceneWait?.cancel()
        sceneWait = nil
        insetWait?.cancel()
        insetWait = nil
        sceneSource = nil
        run("mascots.stop()")
        hits.rects = []
    }

    /// What the island said (`webkit.messageHandlers.mascots`).
    fileprivate func heard(_ body: Any) {
        guard let message = body as? [String: Any], let type = message["type"] as? String else { return }
        switch type {
        case "hits":
            let rects = Self.rects(message["rects"])
            if rects != hits.rects { hits.rects = rects }
            #if DEBUG
            if UserDefaults.standard.bool(forKey: "mascotsLog") {
                Self.log.info("\(self.page, privacy: .public) hits \(rects.map { "\(Int($0.minX)),\(Int($0.minY)) \(Int($0.width))×\(Int($0.height))" }.joined(separator: " | "), privacy: .public)")
            }
            #endif
        default:
            break
        }
    }

    /// `[[x, y, w, h], …]` as rects.
    static func rects(_ value: Any?) -> [CGRect] {
        guard let list = value as? [[Any]] else { return [] }
        return list.compactMap { r in
            let v = r.compactMap { ($0 as? NSNumber)?.doubleValue }
            return v.count == 4 ? CGRect(x: v[0], y: v[1], width: v[2], height: v[3]) : nil
        }
    }

    // MARK: Sending

    /// The view as an inset of the island's top and foot (`refresh`: and the stage looks again at once).
    private func sendInset(refresh: Bool) {
        guard let shown, size.height > 0 else { return }
        let top = max(0, shown.top), bottom = max(0, size.height - max(shown.bottom, shown.top))
        let js = "mascots.inset(\(Self.number(top)), \(Self.number(bottom)))"
        let changed = sentSettings["inset"] != js
        set("inset", js)
        // A scroll the island hears of at its own value: the stage reads the view again now.
        if refresh, changed, ready { run("mascots.scroll(0)") }
        sendScene()
    }

    private func set(_ key: String, _ js: String) {
        settings[key] = js
        guard ready, sentSettings[key] != js else { return }
        sentSettings[key] = js
        run(js)
    }

    private func flush() {
        for key in ["theme", "motion", "inset", "pause"] {
            if let js = settings[key] {
                sentSettings[key] = js
                run(js)
            }
        }
        sendScene()
    }

    private func sendScene() {
        // Never before the page has said what is in view (a settings strip says so with its scene).
        guard ready, settings["inset"] != nil, let scene, scene != sentScene else { return }
        sentScene = scene
        run("mascots.scene(\(scene), 0)")
        #if DEBUG
        debugAfterScene()
        #endif
    }

    private func run(_ js: String) {
        guard ready else { return }
        webView.evaluateJavaScript("\(js); 0") { _, error in
            if let error { Self.log.error("\(js.prefix(40), privacy: .public): \(error.localizedDescription, privacy: .public)") }
        }
    }

    static func number(_ v: CGFloat) -> String {
        v.isFinite ? String(format: "%.1f", Double(v)) : "0"
    }

    #if DEBUG
    /// `-mascotsVisit <ledge>[:<slug>]` sends a puppet to that place once the scene is in (screen checks):
    /// `*-top` is the first place whose name ends so, `*-top#2` the second. `-mascotsAdvance <seconds>` then
    /// runs the stage's own time that far at once (a still); `-mascotsVisitDelay <seconds>` waits that long
    /// first (a scroll to the place); `-mascotsLog YES` logs the places each scene has and where a tap reaches
    /// a puppet (`log show --info --predicate 'category == "mascots"'`).
    private func debugAfterScene() {
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: "mascotsLog") {
            webView.evaluateJavaScript("JSON.stringify([mascots.ledges(), innerWidth, innerHeight])") { [page, settings, sceneCount] value, _ in
                Self.log.info("\(page, privacy: .public) scene #\(sceneCount) ledges \(String(describing: value), privacy: .public) \(settings.values.sorted().joined(separator: " "), privacy: .public)")
            }
        }
        guard let text = defaults.string(forKey: "mascotsVisit"), !text.isEmpty, debug.begin() else { return }
        let ask = MascotDebugVisit.Ask(text)
        let advance = defaults.double(forKey: "mascotsAdvance")
        let delay = defaults.double(forKey: "mascotsVisitDelay")
        Task { [weak self] in
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            var tries = 0
            while true {
                // Every ask the stage refuses clears it and sends someone else half a second on: asked again only
                // sooner than that, and only while it can still come to be (the scene not in, the cast loading).
                try? await Task.sleep(for: .milliseconds(300))
                guard let self, !Task.isCancelled else { return }
                let ledges = (try? await self.webView.evaluateJavaScript("JSON.stringify(mascots.ledges())") as? String)
                    .flatMap { try? JSONDecoder().decode([String].self, from: Data($0.utf8)) } ?? []
                guard let ledge = ask.ledge(in: ledges) else {
                    if MascotDebugVisit.givesUp(ledges: ledges, tries: tries) {
                        Self.log.info("visit \(text, privacy: .public): no such place (\(ledges.count) places) — given up")
                        self.debug.end()
                        return
                    }
                    tries += 1
                    continue
                }
                let slug = ask.slug.map { ", slug: '\($0)'" } ?? ""
                let value = try? await self.webView.evaluateJavaScript("String(mascots.visit({ ledge: '\(ledge)'\(slug) }))")
                let went = (value as? String) == "true"
                Self.log.info("visit \(ledge, privacy: .public) \(ask.slug ?? "", privacy: .public) → \(went)")
                if went {
                    if advance > 0 { self.run("mascots.advance(\(advance))") }
                } else if !MascotDebugVisit.givesUpRefused(named: ask.slug != nil, tries: tries) {
                    tries += 1
                    continue
                } else {
                    Self.log.info("visit \(ledge, privacy: .public): the place can't take anyone now — given up")
                }
                self.debug.end()
                return
            }
        }
    }
    #endif
}

#if DEBUG
/// The `-mascotsVisit` hook's state (round 20: on a page without the asked place it once asked 20 times,
/// again on every new scene, and the stage sent someone each time): it runs once per island, and gives up.
struct MascotDebugVisit {
    /// While the scene isn't in yet (no places): this many tries.
    static let maxTries = 20
    private(set) var state = State.idle
    enum State { case idle, running, done }

    /// Starts the visit unless it has run (or is running): once per island, whatever scenes come after.
    mutating func begin() -> Bool {
        guard state == .idle else { return false }
        state = .running
        return true
    }

    mutating func end() { state = .done }

    /// Whether to stop asking for a place that isn't among `ledges`: as soon as the island has places at all
    /// (the scene is in, the place is not this page's), or after `maxTries` without any.
    static func givesUp(ledges: [String], tries: Int) -> Bool {
        !ledges.isEmpty || tries + 1 >= maxTries
    }

    /// Whether to stop once the stage refused the place (each refusal clears the stage): at once for a named
    /// character, which comes ready or not — the place itself can't take anyone now (out of view, no room
    /// under the line above) — else after a few tries, while the cast may still be loading.
    static let loadingTries = 5
    static func givesUpRefused(named: Bool, tries: Int) -> Bool {
        named || tries + 1 >= loadingTries
    }

    /// One asked visit: a place (`*-suffix[#n]` the n-th whose name ends so) and maybe who.
    struct Ask {
        let text: String
        let place: String
        let slug: String?

        init(_ text: String) {
            self.text = text
            let parts = text.split(separator: ":", maxSplits: 1).map(String.init)
            place = parts.first ?? ""
            slug = parts.count > 1 ? parts[1] : nil
        }

        /// The place's name among the island's.
        func ledge(in ledges: [String]) -> String? {
            guard place.hasPrefix("*") else { return ledges.contains(place) ? place : nil }
            let pattern = place.dropFirst().split(separator: "#", maxSplits: 1)
            let suffix = String(pattern.first ?? "")
            let nth = pattern.count > 1 ? Int(pattern[1]) ?? 1 : 1
            let matches = ledges.filter { $0.hasSuffix(suffix) }
            return matches.count >= nth ? matches[nth - 1] : nil
        }
    }
}
#endif

/// The island's message handler, holding the island weakly (the web view's content controller keeps it).
private final class MascotMessages: NSObject, WKScriptMessageHandler {
    weak var island: MascotIsland?

    nonisolated func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
        MainActor.assumeIsolated { island?.heard(message.body) }
    }
}

// MARK: - The scene

/// A rect as the island takes it (CSS px = points).
struct SceneRect: Codable, Equatable {
    var x: Double, y: Double, w: Double, h: Double

    init(_ r: CGRect) {
        func f(_ v: CGFloat) -> Double { (Double(v) * 2).rounded() / 2 }
        x = f(r.minX)
        y = f(r.minY)
        w = f(r.width)
        h = f(r.height)
    }
}

/// src/lib/mascots/reading/scene.ts's ReadingScene, as far as the app gives it: in the island's points (the
/// content's), measured with the island's scroll at 0.
struct ReadingScene: Codable, Equatable {
    struct Card: Codable, Equatable {
        /// The card's id: its places are named by it.
        var key: String?
        /// Its drawn outline's extent (x and width; y and height its frame's).
        var box: SceneRect
        /// Its drawn top edge, x ascending, a point every 6.
        var top: [[Double]]?
        /// The pen its line is drawn with.
        var pen: Double?
        /// A bordered card's whole drawn outline, points along it every few points (its sides are read off it,
        /// so a puppet peeking past one is cut along the line itself). A band, with only its top rule, has none.
        var outline: [[Double]]?
        var foot: [SceneRect]?
        var words: [SceneRect]?
        var radius: Double?
    }

    struct Title: Codable, Equatable {
        var firstLine: SceneRect
    }

    /// Settings → 外觀's strip under the 小紙團 row (round 20).
    struct Settings: Codable, Equatable {
        var floor: SceneRect
        var control: SceneRect?
        var asleep: Bool
    }

    var width: Double
    var height: Double
    var cards: [Card]?
    var column: SceneRect?
    var title: Title?
    var cover: SceneRect?
    var paragraphs: [SceneRect]?
    var rail: SceneRect?
    var respond: SceneRect?
    var respondCeiling: Double?
    var more: SceneRect?
    var end: SceneRect?
    var settings: Settings?
}

/// The page's marked views (``ReadingMark``, in content points) as a ``ReadingScene``.
enum ReadingSceneBuilder {
    static func scene(_ marks: [ReadingMark], size: CGSize, rail: CGRect? = nil) -> ReadingScene {
        scene(marks, width: size.width, height: size.height, rail: rail)
    }

    static func scene(_ marks: [ReadingMark], width: CGFloat, height: CGFloat, dx: CGFloat = 0, rail: CGRect? = nil) -> ReadingScene {
        let marks = marks.filter { $0.rect.width > 0 && $0.rect.height > 0 }.map { ReadingMark($0.role, $0.rect.offsetBy(dx: dx, dy: 0)) }
        func rects(_ role: ReadingMarkRole) -> [CGRect] { marks.filter { $0.role == role }.map(\.rect) }

        // Cards, top to bottom, each with the author row and title inside it.
        let feet = rects(.cardFoot), words = rects(.cardWords)
        let cards: [ReadingScene.Card] = marks.compactMap { mark in
            guard case let .card(key, outline) = mark.role else { return nil }
            let frame = mark.rect
            let inside = { (r: CGRect) in frame.insetBy(dx: -1, dy: -1).contains(r) }
            let foot = feet.filter(inside), title = words.filter(inside)
            var card = Self.card(key: key, frame: frame, outline: outline)
            card.foot = foot.isEmpty ? nil : foot.map(SceneRect.init)
            card.words = title.isEmpty ? nil : title.map(SceneRect.init)
            return card
        }
        .sorted { ($0.box.y, $0.box.x) < ($1.box.y, $1.box.x) }

        let column = rects(.column).first
        let respond = rects(.respond).first
        let ceiling = rects(.ceiling).map(\.maxY).max() ?? column?.maxY
        return ReadingScene(
            width: Double(width), height: Double(height),
            cards: cards.isEmpty ? nil : cards,
            column: column.map(SceneRect.init),
            title: firstLine(marks).map { ReadingScene.Title(firstLine: SceneRect($0)) },
            cover: rects(.cover).first.map(SceneRect.init),
            paragraphs: column == nil ? nil : rects(.block).sorted { $0.minY < $1.minY }.map(SceneRect.init),
            rail: rail.map(SceneRect.init),
            respond: respond.map(SceneRect.init),
            respondCeiling: respond == nil ? nil : ceiling.map { Double($0) },
            more: rects(.more).first.map(SceneRect.init),
            end: rects(.end).first.map(SceneRect.init))
    }

    /// A card laid out at `frame` as its line is drawn: the drawn line's extent across (its wobble swings past
    /// the frame), its top edge sampled off the drawn line (the web's measure.ts `topContour`), its pen.
    static func card(key: String, frame: CGRect, outline: ReadingCardOutline) -> ReadingScene.Card {
        let drawn = outline.drawn(in: frame.size).map { CGPoint(x: $0.x + frame.minX, y: $0.y + frame.minY) }
        var box = frame
        if let x0 = drawn.map(\.x).min(), let x1 = drawn.map(\.x).max() {
            box = CGRect(x: x0, y: frame.minY, width: x1 - x0, height: frame.height)
        }
        let top = topContour(drawn, from: box.minX + 1, to: box.maxX - 1, near: frame.minY)
        func pair(_ p: CGPoint) -> [Double] { [(Double(p.x) * 10).rounded() / 10, (Double(p.y) * 10).rounded() / 10] }
        let sides: [[Double]]? = if case .bordered = outline, drawn.count >= 3 { drawn.map(pair) } else { nil }
        return ReadingScene.Card(key: key, box: SceneRect(box), top: top.count >= 2 ? top.map { [Double($0.x), Double($0.y)] } : nil,
                                 pen: Double(outline.pen), outline: sides, radius: Double(outline.radius))
    }

    /// The drawn top edge (measure.ts `topContour`): for x from `x0` to `x1` every 6, the topmost of the
    /// line's points within 3 of it, among those within `band` of `y` (else the nearest's).
    static func topContour(_ points: [CGPoint], from x0: CGFloat, to x1: CGFloat, near y: CGFloat, band: CGFloat = 24) -> [CGPoint] {
        let near = points.filter { abs($0.y - y) < band && $0.x >= x0 - 4 && $0.x <= x1 + 4 }
        guard !near.isEmpty else { return [] }
        var out: [CGPoint] = []
        var x = (x0 + 0.5).rounded(.down)
        while x <= x1 {
            let column = near.filter { abs($0.x - x) <= 3 }
            let at = column.map(\.y).min() ?? near.min { abs($0.x - x) < abs($1.x - x) }!.y
            out.append(CGPoint(x: x, y: (at * 10).rounded() / 10))
            x += 6
        }
        return out
    }

    /// The story title's first line: the pieces laid out on its top line, as wide as they run together
    /// and one line tall (a Latin title is one piece: its first line is its width).
    static func firstLine(_ marks: [ReadingMark]) -> CGRect? {
        let clauses: [(CGRect, CGFloat)] = marks.compactMap { mark in
            guard case let .titleClause(lineBox) = mark.role else { return nil }
            return (mark.rect, lineBox)
        }
        guard let top = clauses.map(\.0.minY).min() else { return nil }
        let line = clauses.filter { abs($0.0.minY - top) < 2 }
        let x0 = line.map(\.0.minX).min() ?? 0, x1 = line.map(\.0.maxX).max() ?? 0
        let box = line.map(\.1).max() ?? 0
        return CGRect(x: x0, y: top, width: x1 - x0, height: min(box, line.map(\.0.height).max() ?? box))
    }
}

/// ``MascotStage`` on a list that may host the puppets, nothing on one that never does (decided once per screen).
struct MascotHosting: ViewModifier {
    let hosts: Bool
    var footRoom: CGFloat = 0

    func body(content: Content) -> some View {
        if hosts { content.modifier(MascotStage(page: "feed", footRoom: footRoom)) } else { content }
    }
}
