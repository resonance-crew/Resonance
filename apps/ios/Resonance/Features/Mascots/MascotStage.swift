import DesignSystem
import OSLog
import SwiftUI
import UIKit
import WebKit

/// The paper puppets on a reading page (round 19, the owner's: 「偶爾會出現的小精靈」 on the home feed
/// and a card's page, behind Settings → 外觀 → 小精靈, off until turned on). The app doesn't draw them:
/// the web's own engine, cast and places run in the mascot island (`native/mascots/dist/mascots.html`,
/// `npm run native:mascots`), a transparent web view laid over the scrolled content that takes no touch
/// and is not there for VoiceOver. The app tells it where its views are (``ReadingMarks`` → ``ReadingScene``),
/// in the island's own points, and how far the content is scrolled.
///
/// Applied to the page's `ScrollView`, whose content root is `.readingContent()` (the ``ReadingMarks/space``
/// coordinate space); its marked views tell the stage's ``ReadingMarkSink`` where they are. With the switch off — or `allowed` false (a card in the
/// trash) — no web view is made at all. The puppets pause while the page isn't showing (another tab, a
/// page pushed over it, the app in the background) and stop when it goes.
struct MascotStage: ViewModifier {
    /// Which page this is (the log's).
    var page: String
    /// The page may host them (not a card in the trash).
    var allowed = true
    /// Points of the overlay's foot under something drawn over it (the phone's tab bar).
    var footRoom: CGFloat = 0
    /// Something standing in the right margin beside the story (a tablet's contents rail).
    var rail: CGRect?
    @State private var island: MascotIsland?
    /// Where the page's marked views are (they say so themselves).
    @State private var sink = ReadingMarkSink()
    @State private var overlay: CGRect = .zero
    /// The overlay's own safe area (what of it lies under a bar).
    @State private var safe = EdgeInsets()
    /// Where the content's top left is (it moves every frame of a scroll): kept out of the view's state,
    /// since nothing here redraws for it.
    @State private var origin = OriginBox()
    @State private var appeared = false
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isSelectedTab) private var selectedTab
    private let store = AppearanceStore.shared

    final class OriginBox {
        var point = CGPoint.zero
    }

    private var on: Bool { store.mascots && allowed }
    private var showing: Bool { appeared && selectedTab && scenePhase == .active }

    func body(content: Content) -> some View {
        content
            .environment(\.readingMarkSink, on ? sink : nil)
            // The content moved (every frame of a scroll): the puppets move with it.
            .onPreferenceChange(ReadingContentOrigin.self) { point in
                guard let point else { return }
                origin.point = point
                island?.scroll(scrollY)
            }
            // A scroll come to rest: the places again as they are (debounced in the island).
            .onScrollPhaseChange { _, phase in
                if phase == .idle { sendScene() }
            }
            .overlay {
                if on, let island {
                    MascotIslandView(island: island)
                        .ignoresSafeArea()
                        .allowsHitTesting(false)
                        .accessibilityHidden(true)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(ReadingMarks.frameSpace)) } action: { overlay = $0 }
                        .background {
                            GeometryReader { geo in
                                Color.clear.onChange(of: geo.safeAreaInsets, initial: true) { _, insets in safe = insets }
                            }
                        }
                }
            }
            .coordinateSpace(.named(ReadingMarks.frameSpace))
            .onAppear { appeared = true }
            .onDisappear { appeared = false }
            .task(id: on) {
                if on, island == nil {
                    island = MascotIsland()
                    MascotIsland.log.info("island made: \(page, privacy: .public)")
                } else if !on, let made = island {
                    made.stop()
                    island = nil
                    MascotIsland.log.info("island gone: \(page, privacy: .public)")
                }
                sink.onChange = on ? { sendScene() } : nil
                applySettings()
                sendScene()
            }
            .onChange(of: overlay) { sendScene() }
            .onChange(of: safe) { sendScene() }
            .onChange(of: colorScheme) { applySettings() }
            .onChange(of: reduceMotion) { applySettings() }
            .onChange(of: showing) { applySettings() }
    }

    /// The island's own box: the overlay runs under the bars (it ignores the safe area it is laid out in).
    private var web: CGRect {
        CGRect(x: overlay.minX - safe.leading, y: overlay.minY - safe.top, width: overlay.width + safe.leading + safe.trailing,
               height: overlay.height + safe.top + safe.bottom)
    }

    /// The content's offset in the island's points: the island's top, in the content's own points.
    private var scrollY: CGFloat { web.minY - origin.point.y }

    private func applySettings() {
        guard let island else { return }
        island.theme(colorScheme == .dark ? "dark" : "light")
        island.reducedMotion(reduceMotion)
        island.paused(!showing)
    }

    private func sendScene() {
        guard let island, overlay.width > 0, overlay.height > 0 else { return }
        #if DEBUG
        if UserDefaults.standard.bool(forKey: "mascotsLog") {
            MascotIsland.log.info("overlay \(overlay.debugDescription, privacy: .public) safe \(safe.top) \(safe.bottom) origin \(origin.point.debugDescription, privacy: .public) marks \(sink.all.map { "\($0.role)" }.joined(separator: ","), privacy: .public)")
        }
        #endif
        // The overlay runs under the bars (it ignores the safe area): what of it they cover is out of view.
        island.inset(top: safe.top, bottom: safe.bottom + footRoom)
        island.scene(ReadingSceneBuilder.scene(sink.all, width: web.width, height: web.height,
                                               dx: origin.point.x - web.minX, rail: rail))
        island.scroll(scrollY)
    }
}

/// The island's web view in the page (it lives with the ``MascotIsland`` that made it).
struct MascotIslandView: UIViewRepresentable {
    let island: MascotIsland

    func makeUIView(context: Context) -> WKWebView { island.webView }
    func updateUIView(_ view: WKWebView, context: Context) {}
    static func dismantleUIView(_ view: WKWebView, coordinator: ()) {
        view.evaluateJavaScript("window.mascots && mascots.stop(); 0", completionHandler: nil)
    }
}

/// The mascot island (native/mascots/src/island.ts): its web view and the calls into `window.mascots`.
/// Calls made before the page has loaded wait, the latest of each kind; a scroll is sent once a frame
/// at most — the latest offset after the one before it has run.
@MainActor final class MascotIsland: NSObject, WKNavigationDelegate {
    static let log = Logger(subsystem: "com.resonance.stories", category: "mascots")

    let webView: WKWebView
    private var ready = false
    private var scene: String?
    private var sentScene: String?
    private var sceneWait: Task<Void, Never>?
    /// How many scenes the page has made (a debug log's).
    private var sceneAsks = 0
    private var scrollY: CGFloat = 0
    private var sentScroll: CGFloat?
    private var scrolling = false
    private var settings: [String: String] = [:]
    private var sentSettings: [String: String] = [:]
    #if DEBUG
    private var visited = false
    private var visiting: Task<Void, Never>?
    #endif

    override init() {
        let config = WKWebViewConfiguration()
        config.suppressesIncrementalRendering = false
        config.mediaTypesRequiringUserActionForPlayback = .all
        webView = WKWebView(frame: .zero, configuration: config)
        super.init()
        webView.isOpaque = false
        webView.backgroundColor = .clear
        webView.underPageBackgroundColor = .clear
        webView.scrollView.backgroundColor = .clear
        webView.scrollView.isScrollEnabled = false
        webView.scrollView.contentInsetAdjustmentBehavior = .never
        // Never a touch, never VoiceOver's: the page under it is what is read and tapped.
        webView.isUserInteractionEnabled = false
        webView.accessibilityElementsHidden = true
        webView.isAccessibilityElement = false
        webView.navigationDelegate = self
        #if DEBUG
        webView.isInspectable = true
        #endif
        if let page = Bundle.main.url(forResource: "mascots", withExtension: "html") {
            webView.loadFileURL(page, allowingReadAccessTo: page.deletingLastPathComponent())
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

    // MARK: What the page says

    func scene(_ scene: ReadingScene) {
        guard let data = try? JSONEncoder().encode(scene), let json = String(data: data, encoding: .utf8) else { return }
        self.scene = json
        sceneAsks += 1
        // At most one every 200 ms, the latest: a layout settling sends one scene, not each step of it.
        guard sceneWait == nil else { return }
        sceneWait = Task { [weak self] in
            try? await Task.sleep(for: .milliseconds(200))
            guard let self, !Task.isCancelled else { return }
            self.sceneWait = nil
            self.sendScene()
        }
    }

    func scroll(_ y: CGFloat) {
        scrollY = (y * 2).rounded() / 2
        sendScroll()
    }

    func inset(top: CGFloat, bottom: CGFloat) {
        set("inset", "mascots.inset(\(Self.number(top)), \(Self.number(bottom)))")
    }

    func theme(_ theme: String) { set("theme", "mascots.theme('\(theme)')") }
    func reducedMotion(_ on: Bool) { set("motion", "mascots.reducedMotion(\(on))") }
    func paused(_ paused: Bool) { set("pause", paused ? "mascots.pause()" : "mascots.resume()") }

    func stop() {
        sceneWait?.cancel()
        sceneWait = nil
        run("mascots.stop()")
    }

    // MARK: Sending

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
        sendScroll()
    }

    private func sendScene() {
        guard ready, let scene, scene != sentScene else { return }
        sentScene = scene
        run("mascots.scene(\(scene), 0)")
        #if DEBUG
        debugVisit()
        #endif
    }

    private func sendScroll() {
        guard ready, !scrolling, sentScroll != scrollY else { return }
        let y = scrollY
        sentScroll = y
        scrolling = true
        webView.evaluateJavaScript("mascots.scroll(\(Self.number(y))); 0") { [weak self] _, _ in
            MainActor.assumeIsolated {
                guard let self else { return }
                self.scrolling = false
                if self.sentScroll != self.scrollY { self.sendScroll() }
            }
        }
    }

    private func run(_ js: String) {
        guard ready else { return }
        webView.evaluateJavaScript("\(js); 0") { _, error in
            if let error { Self.log.error("\(js.prefix(40), privacy: .public): \(error.localizedDescription, privacy: .public)") }
        }
    }

    private static func number(_ v: CGFloat) -> String {
        v.isFinite ? String(format: "%.1f", Double(v)) : "0"
    }

    #if DEBUG
    /// `-mascotsVisit <ledge>[:<slug>]` sends a puppet to that place once the first scene is in (screen
    /// checks), and `-mascotsAdvance <seconds>` then runs the stage's own time that far at once (a still);
    /// `-mascotsVisitDelay <seconds>` waits that long first (a scroll to the place); `-mascotsLog YES` logs the places each scene has (`log show --predicate 'category == "mascots"'`).
    private func debugVisit() {
        let defaults = UserDefaults.standard
        if defaults.bool(forKey: "mascotsLog") {
            webView.evaluateJavaScript("JSON.stringify([mascots.ledges(), innerWidth, innerHeight])") { [settings, scene, scrollY, sceneAsks] value, _ in
                Self.log.info("ledges \(String(describing: value), privacy: .public) scroll \(scrollY) \(settings.values.joined(separator: " "), privacy: .public)")
                Self.log.info("scene #\(sceneAsks) \(scene ?? "", privacy: .public)")
            }
        }
        guard !visited, let ask = defaults.string(forKey: "mascotsVisit"), !ask.isEmpty else { return }
        let parts = ask.split(separator: ":", maxSplits: 1).map(String.init)
        let advance = defaults.double(forKey: "mascotsAdvance")
        visiting?.cancel()
        visiting = Task { [weak self] in
            let request = parts.count > 1 ? "{ ledge: '\(parts[0])', slug: '\(parts[1])' }" : "{ ledge: '\(parts[0])' }"
            // `-mascotsVisitDelay <seconds>`: time to scroll to the place first.
            let delay = UserDefaults.standard.double(forKey: "mascotsVisitDelay")
            if delay > 0 { try? await Task.sleep(for: .seconds(delay)) }
            // The cast loads and decodes first: asked again until a puppet goes (or 20 tries).
            for _ in 0..<20 {
                try? await Task.sleep(for: .milliseconds(700))
                guard let self, !self.visited, !Task.isCancelled else { return }
                let value = try? await self.webView.evaluateJavaScript("String(mascots.visit(\(request)))")
                let went = (value as? String) == "true"
                Self.log.info("visit \(ask, privacy: .public) → \(went)")
                if went {
                    self.visited = true
                    if advance > 0 { self.run("mascots.advance(\(advance))") }
                    return
                }
            }
        }
    }
    #endif
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

/// src/lib/mascots/reading/scene.ts's ReadingScene, as far as the app gives it: in the overlay's points,
/// measured with the content at its top (the island is told the scroll apart).
struct ReadingScene: Codable, Equatable {
    struct Card: Codable, Equatable {
        var box: SceneRect
        var foot: [SceneRect]?
        var words: [SceneRect]?
        var radius: Double?
    }

    struct Title: Codable, Equatable {
        var firstLine: SceneRect
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
}

/// The page's marked views (``ReadingMark``, in content points) as a ``ReadingScene``.
enum ReadingSceneBuilder {
    static func scene(_ marks: [ReadingMark], width: CGFloat, height: CGFloat, dx: CGFloat = 0, rail: CGRect? = nil) -> ReadingScene {
        let marks = marks.filter { $0.rect.width > 0 && $0.rect.height > 0 }.map { ReadingMark($0.role, $0.rect.offsetBy(dx: dx, dy: 0)) }
        func rects(_ role: ReadingMarkRole) -> [CGRect] { marks.filter { $0.role == role }.map(\.rect) }

        // Cards, top to bottom, each with the author row and title inside it.
        let feet = rects(.cardFoot), words = rects(.cardWords)
        let cards: [ReadingScene.Card] = marks.compactMap { mark in
            guard case let .card(radius) = mark.role else { return nil }
            let box = mark.rect
            let inside = { (r: CGRect) in box.insetBy(dx: -1, dy: -1).contains(r) }
            let foot = feet.filter(inside), title = words.filter(inside)
            return ReadingScene.Card(box: SceneRect(box), foot: foot.isEmpty ? nil : foot.map(SceneRect.init),
                                     words: title.isEmpty ? nil : title.map(SceneRect.init), radius: Double(radius))
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
