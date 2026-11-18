import Foundation
import ResonanceKit
import SwiftUI
import UIKit

/// One page view's reading of someone else's card (round 26 §U7, the web's lib/data/readingReport): how long the
/// reader was actually reading — the app in front and a scroll or a touch within the last 30 s — how far through the
/// story they scrolled, whether the end row came into view, and whether they shared it. The server is sent its
/// running totals each time the page hides (the screen leaving, the app going to the background), never deltas:
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
/// reported each time the page hides.
@MainActor final class ReadingTracker {
    private(set) var session: ReadingSession?
    private(set) var cardId: String?
    private var hidden = false

    /// The card has loaded (again): a session for this page view, once.
    func start(_ detail: CardDetail, viewer: String?, now: Date = .now) {
        guard cardId != detail.card.id, ReadingSession.measures(detail, viewer: viewer) else { return }
        cardId = detail.card.id
        session = ReadingSession(expectedSeconds: ReadTime.seconds(detail.story), now: now)
        hidden = false
    }

    func scrolled(story: CGRect, visibleTop: CGFloat, visibleHeight: CGFloat, now: Date = .now) {
        guard session != nil, !hidden, story.height > 0 else { return }
        session?.scrolled(to: ReadingSession.share(storyTop: story.minY, storyHeight: story.height, visibleTop: visibleTop,
                                                   visibleHeight: visibleHeight), at: now)
    }

    func sawEnd(now: Date = .now) { session?.sawEnd(at: now) }

    func shared() { session?.didShare() }

    /// The page hid: its totals so far, for the server (nil when nothing is measured, or it was hidden already).
    func hid(now: Date = .now) -> (cardId: String, report: ReadingReportBody)? {
        guard var session, let cardId, !hidden else { return nil }
        hidden = true
        session.hid(at: now)
        let report = session.totals(at: now)
        self.session = session
        return (cardId, report)
    }

    func cameBack(now: Date = .now) {
        guard hidden else { return }
        hidden = false
        session?.cameBack(at: now)
    }
}
