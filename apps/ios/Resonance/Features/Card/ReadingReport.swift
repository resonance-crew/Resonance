import Foundation
import ResonanceKit
import SwiftUI
import UIKit

/// One page view's reading of someone else's card (round 26 §U7, the web's lib/data/readingReport): how long the
/// reader was actually reading — the page on show and a scroll, a touch or a key within the last 30 s — how far through
/// the story they scrolled, whether the end row came into view, and whether they shared it. The server is sent its
/// running totals each time the page hides (the screen leaving, another tab chosen, the app going to the background), never deltas:
/// it keeps the largest each session has said, so the same totals twice count once.
///
/// "Read to the end" is the end row seen **and** at least 0.4 of the story's expected time read: a short card shown
/// whole at once has its end in view from the start, which says nothing yet.
nonisolated struct ReadingSession: Equatable {
    /// With no scroll or touch for this long, the reader is no longer counted as reading.
    static let idleAfter: TimeInterval = 30
    /// The share of the expected time the end needs behind it to count as read to the end (§R3.3).
    static let endShare = 0.4

    /// The page view's own id (8–40 of A–Z a–z 0–9 -: a UUID's 36).
    let id: String
    /// How long the story takes to read at the project's rates, unrounded (``ReadTime/seconds(_:)``).
    let expectedSeconds: Double
    private(set) var activeSeconds: Double = 0
    /// The furthest share of the story scrolled through, 0…1.
    private(set) var progress: Double = 0
    /// The end row has come into view.
    private(set) var endSeen = false
    /// The share button was used.
    private(set) var shared = false
    private var foreground = true
    /// Active time is counted up to here.
    private var countedTo: Date
    /// The reader counts as reading until here (the last scroll or touch and 30 s).
    private var activeUntil: Date

    init(id: String = UUID().uuidString, expectedSeconds: Double, now: Date) {
        self.id = id
        self.expectedSeconds = max(0, expectedSeconds)
        countedTo = now
        // Opening the page is the first sign of reading.
        activeUntil = now.addingTimeInterval(Self.idleAfter)
    }

    /// Whether this view counts as read to the end (as the server will count it).
    var reachedEnd: Bool { endSeen && activeSeconds >= expectedSeconds * Self.endShare }

    /// A scroll, a touch, a key: the reader is reading for the next 30 s.
    mutating func interacted(at now: Date) {
        settle(now)
        activeUntil = max(activeUntil, now.addingTimeInterval(Self.idleAfter))
    }

    /// The page scrolled to `share` of the story (a scroll is an interaction too).
    mutating func scrolled(to share: Double, at now: Date) {
        interacted(at: now)
        progress = max(progress, min(1, max(0, share.isFinite ? share : 0)))
    }

    /// The end row came into view (the whole story is behind it).
    mutating func sawEnd(at now: Date) {
        settle(now)
        endSeen = true
        progress = 1
    }

    mutating func didShare() { shared = true }

    /// The page hid (the screen left, the app went to the background): nothing more is counted until it is back.
    mutating func hid(at now: Date) {
        settle(now)
        foreground = false
    }

    /// The page is in front again: counted from now, and coming back is a sign of reading.
    mutating func cameBack(at now: Date) {
        foreground = true
        countedTo = now
        activeUntil = now.addingTimeInterval(Self.idleAfter)
    }

    /// The totals up to `now`, as the server takes them (the same session's later report says more, never less).
    mutating func totals(at now: Date) -> ReadingReportBody {
        settle(now)
        return ReadingReportBody(session: id, activeSeconds: (activeSeconds * 10).rounded() / 10, progress: progress,
                                 reachedEnd: reachedEnd, shared: shared ? true : nil)
    }

    /// Counts the reading time up to `now`: in front, until the last sign of reading's 30 s ran out.
    private mutating func settle(_ now: Date) {
        guard now > countedTo else { return }
        if foreground {
            let end = min(now, activeUntil)
            if end > countedTo { activeSeconds += end.timeIntervalSince(countedTo) }
        }
        countedTo = now
    }

    /// Whether `detail`'s page measures reading for `viewer`: someone else's published card, not private, not in
    /// the trash (the server counts no other; the author's own reading is never sent).
    static func measures(_ detail: CardDetail, viewer: String?) -> Bool {
        let card = detail.card
        return viewer != nil && !detail.isOwner && card.publishedAt != nil && card.visibility != ._private && card.trashedAt == nil
    }
}

/// The reading reports of the signed-in account on their way (§U7): each kept on the device until the server has
/// it — a report the network or the app's end cut short is sent at the next launch (the server is idempotent per
/// session). One per page view and card (a later report of the same view replaces the earlier); none older than
/// three days; only the signed-in account's (a sign-out or a switch drops the last one's).
@MainActor final class ReadingReports {
    struct Pending: Codable, Equatable {
        let uid: String
        let cardId: String
        let session: String
        let activeSeconds: Double
        let progress: Double
        let reachedEnd: Bool
        let shared: Bool
        let at: Date

        var body: ReadingReportBody {
            ReadingReportBody(session: session, activeSeconds: activeSeconds, progress: progress, reachedEnd: reachedEnd,
                              shared: shared ? true : nil)
        }
    }

    static let key = "readingReports.pending"
    static let maxAge: TimeInterval = 3 * 24 * 60 * 60
    static let limit = 40

    typealias Send = @Sendable (String, ReadingReportBody) async throws -> Void

    private let send: Send
    private let defaults: UserDefaults
    private let now: () -> Date
    private var sending: Set<String> = []

    init(defaults: UserDefaults = .standard, now: @escaping () -> Date = { .now }, send: @escaping Send) {
        self.defaults = defaults
        self.now = now
        self.send = send
    }

    /// The reports kept on the device, not yet taken by the server.
    var pending: [Pending] {
        guard let data = defaults.data(forKey: Self.key),
              let all = try? JSONDecoder().decode([Pending].self, from: data) else { return [] }
        let at = now()
        return all.filter { at.timeIntervalSince($0.at) < Self.maxAge }
    }

    private func keep(_ list: [Pending]) {
        let list = Array(list.suffix(Self.limit))
        if list.isEmpty { defaults.removeObject(forKey: Self.key) } else { defaults.set(try? JSONEncoder().encode(list), forKey: Self.key) }
    }

    /// `uid`'s running totals for `cardId`: kept, then sent (inside a background task, so the app going away
    /// doesn't cut it short); a report that doesn't go stays for the next ``flush(uid:)``.
    @discardableResult
    func report(_ body: ReadingReportBody, cardId: String, uid: String) -> Task<Void, Never> {
        let entry = Pending(uid: uid, cardId: cardId, session: body.session, activeSeconds: body.activeSeconds, progress: body.progress,
                            reachedEnd: body.reachedEnd, shared: body.shared == true, at: now())
        keep(pending.filter { !($0.uid == uid && $0.cardId == cardId && $0.session == body.session) } + [entry])
        return deliver(entry)
    }

    /// Sends what `uid` left unsent (a launch, a sign-in, back in front).
    func flush(uid: String?) {
        guard let uid else { return }
        for entry in pending where entry.uid == uid { deliver(entry) }
    }

    /// Only `uid`'s reports are kept from now on (signed out: none).
    func retainOnly(_ uid: String?) {
        keep(pending.filter { $0.uid == uid })
    }

    @discardableResult
    private func deliver(_ entry: Pending) -> Task<Void, Never> {
        let key = "\(entry.cardId)#\(entry.session)#\(entry.activeSeconds)#\(entry.progress)"
        guard sending.insert(key).inserted else { return Task {} }
        let send = send
        let background = BackgroundWork.begin()
        return Task { [weak self] in
            defer { background.end() }
            let sent = (try? await send(entry.cardId, entry.body)) != nil
            guard let self else { return }
            sending.remove(key)
            // The server has it: gone — unless a later report of the same view replaced it meanwhile.
            if sent { keep(pending.filter { $0 != entry }) }
        }
    }
}

/// A little time the system grants an app going to the background to finish a request (`beginBackgroundTask`),
/// given back when the request ends or the time runs out.
@MainActor final class BackgroundWork {
    private var id: UIBackgroundTaskIdentifier = .invalid

    static func begin() -> BackgroundWork {
        let work = BackgroundWork()
        work.id = UIApplication.shared.beginBackgroundTask(withName: "reading-report") { [weak work] in
            MainActor.assumeIsolated { work?.end() }
        }
        return work
    }

    func end() {
        guard id != .invalid else { return }
        UIApplication.shared.endBackgroundTask(id)
        id = .invalid
    }
}

extension EnvironmentValues {
    /// The card page's share button was used (the reading report's `shared`, §U7).
    @Entry var cardShared: @MainActor () -> Void = {}
    /// The reader did something on the card page that isn't a scroll — typed in the note field (§U7.1: reading).
    @Entry var cardInteracted: @MainActor () -> Void = {}
}

extension ReadingSession {
    /// The share of the story that has been in view: the viewport's foot past the story's top, over the story's height
    /// (a story shown whole is 1 at once).
    static func share(storyTop: CGFloat, storyHeight: CGFloat, visibleTop: CGFloat, visibleHeight: CGFloat) -> Double {
        guard storyHeight > 0, visibleHeight > 0 else { return 0 }
        return Double(min(max((visibleTop + visibleHeight - storyTop) / storyHeight, 0), 1))
    }
}

/// The card page's reading, kept out of what the page draws (a scroll's frames never redraw the page for it): started
/// once the card has loaded when it is one to measure (``ReadingSession/measures(_:viewer:)``), its running totals
/// reported each time the page goes out of show.
///
/// On show is three things at once, each told by its own event: the page has appeared (between its `onAppear` and
/// `onDisappear`: a page pushed over it hides it), it is on the tab chosen (every tab's stack stays mounted, unseen
/// under the chosen one, so a page on a tab left never disappears), and the app is in front. Coming back is the
/// same three again — the app coming to the front never brings back a page under another screen or on another tab.
@MainActor final class ReadingTracker {
    /// A page view's totals as the page went out of show, for the server.
    typealias Report = (cardId: String, report: ReadingReportBody)

    private(set) var session: ReadingSession?
    private(set) var cardId: String?
    /// Between the page's `onAppear` and `onDisappear`: at the top of its stack.
    private var appeared = true
    /// On the tab chosen (`isSelectedTab`).
    private var onSelectedTab = true
    /// The app in front: not gone to the background.
    private var inFront = true
    /// Reading is counted only while the page is on show.
    var onShow: Bool { appeared && onSelectedTab && inFront }

    /// The card has loaded (again): a session for this page view, once. Loaded while out of show (another tab
    /// chosen, the app gone meanwhile), nothing is counted until it is on show.
    func start(_ detail: CardDetail, viewer: String?, now: Date = .now) {
        guard cardId != detail.card.id, ReadingSession.measures(detail, viewer: viewer) else { return }
        cardId = detail.card.id
        var session = ReadingSession(expectedSeconds: ReadTime.seconds(detail.story), now: now)
        if !onShow { session.hid(at: now) }
        self.session = session
    }

    func scrolled(story: CGRect, visibleTop: CGFloat, visibleHeight: CGFloat, now: Date = .now) {
        guard session != nil, onShow, story.height > 0 else { return }
        session?.scrolled(to: ReadingSession.share(storyTop: story.minY, storyHeight: story.height, visibleTop: visibleTop,
                                                   visibleHeight: visibleHeight), at: now)
    }

    /// A touch or a key on the page that isn't a scroll (§U7.1: a scroll, touch or key within the last 30 s): the
    /// reader is reading for the next 30 s.
    func interacted(now: Date = .now) {
        guard onShow else { return }
        session?.interacted(at: now)
    }

    func sawEnd(now: Date = .now) { session?.sawEnd(at: now) }

    func shared() { session?.didShare() }

    /// The page appeared (`true`) or disappeared, on the tab chosen or not (`onSelectedTab`, as it is then).
    @discardableResult
    func appeared(_ appeared: Bool, onSelectedTab: Bool, now: Date = .now) -> Report? {
        change(now) {
            self.appeared = appeared
            self.onSelectedTab = onSelectedTab
        }
    }

    /// The tab the page is on was chosen (`true`) or another one was.
    @discardableResult
    func tabChosen(_ chosen: Bool, now: Date = .now) -> Report? {
        change(now) { onSelectedTab = chosen }
    }

    /// The app went to the background (`false`) or is in front again.
    @discardableResult
    func sceneActive(_ active: Bool, now: Date = .now) -> Report? {
        change(now) { inFront = active }
    }

    /// Out of show: the totals so far, for the server (nil when nothing is measured, or it was out of show already).
    /// Back on show: counted from now.
    private func change(_ now: Date, _ apply: () -> Void) -> Report? {
        let was = onShow
        apply()
        guard was != onShow, var session, let cardId else { return nil }
        defer { self.session = session }
        if onShow {
            session.cameBack(at: now)
            return nil
        }
        session.hid(at: now)
        return (cardId, session.totals(at: now))
    }
}

/// Any touch on the card page, told as it goes down and never taken (§U7.1: a touch is a sign of reading, as a scroll
/// or a key is): a UIKit recognizer on the page's own scroll view — never a SwiftUI gesture over what it holds — that
/// fails at once, cancelling and delaying nothing, beside every other gesture there (``ReadingTouchesView``).
struct ReadingTouches: UIViewRepresentable {
    let touched: @MainActor () -> Void

    func makeUIView(context: Context) -> ReadingTouchesView { ReadingTouchesView(touched: touched) }
    func updateUIView(_ view: ReadingTouchesView, context: Context) { view.watcher.touched = touched }
}

/// ``ReadingTouches``'s view, drawn nowhere: puts its watcher on the scroll view it is in, and takes it off again
/// when it leaves (as the thread's ``KeyboardTapAwayView`` does).
final class ReadingTouchesView: UIView, UIGestureRecognizerDelegate {
    let watcher: TouchWatcher

    init(touched: @escaping @MainActor () -> Void) {
        watcher = TouchWatcher(touched: touched)
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isHidden = true
        watcher.delegate = self
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else {
            watcher.view?.removeGestureRecognizer(watcher)
            return
        }
        let enclosing = sequence(first: superview, next: { $0?.superview }).lazy.compactMap { $0 as? UIScrollView }.first
        if let enclosing, watcher.view !== enclosing {
            watcher.view?.removeGestureRecognizer(watcher)
            enclosing.addGestureRecognizer(watcher)
        }
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }
}

/// A recognizer that only listens: each touch going down is told, and it fails there and then — it never begins, so
/// it never cancels, delays or holds up a touch, a scroll or a tap.
final class TouchWatcher: UIGestureRecognizer {
    var touched: @MainActor () -> Void = {}

    convenience init(touched: @escaping @MainActor () -> Void) {
        self.init(target: nil, action: nil)
        self.touched = touched
        cancelsTouchesInView = false
        delaysTouchesBegan = false
        delaysTouchesEnded = false
    }

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        touched()
        state = .failed
    }

    override func canPrevent(_ preventedGestureRecognizer: UIGestureRecognizer) -> Bool { false }
}
