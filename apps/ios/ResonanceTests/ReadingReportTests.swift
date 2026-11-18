import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
import UIKit
@testable import Resonance

/// Measuring reading (round 26 §U7): active time (on show, and a scroll, a touch or a key within the last 30 s), how
/// far through the story, the end row seen — read to the end only with 0.4 of the expected time behind it — sent as
/// the page view's running totals each time it goes out of show (never deltas), kept on the device until the server
/// has them, and never for the author.
@MainActor @Suite(.serialized) struct ReadingReportTests {
    let start = Date(timeIntervalSince1970: 1_800_000_000)

    @Test func aShortCardShownWholeIsNotReadToTheEndAtOnce() {
        // Twenty seconds of story, its end row in view as the page opens.
        var session = ReadingSession(id: "view-0001", expectedSeconds: 20, now: start)
        session.sawEnd(at: start)
        #expect(session.progress == 1)
        #expect(!session.reachedEnd)
        session.interacted(at: start.addingTimeInterval(7))
        #expect(!session.totals(at: start.addingTimeInterval(7)).reachedEnd, "7 s < 0.4 × 20")
        #expect(session.totals(at: start.addingTimeInterval(8.5)).reachedEnd)
    }

    @Test func readingStopsCountingThirtySecondsAfterTheLastSign() {
        var session = ReadingSession(id: "view-0002", expectedSeconds: 600, now: start)
        // Opened, then nothing for two minutes: 30 s counted.
        #expect(session.totals(at: start.addingTimeInterval(120)).activeSeconds == 30)
        // A scroll: 30 more from it.
        session.scrolled(to: 0.4, at: start.addingTimeInterval(200))
        #expect(session.totals(at: start.addingTimeInterval(300)).activeSeconds == 60)
        #expect(session.progress == 0.4)
        // Scrolling back up never lowers how far it went.
        session.scrolled(to: 0.1, at: start.addingTimeInterval(301))
        #expect(session.progress == 0.4)
    }

    @Test func hidingTwiceSendsRunningTotalsNotDeltas() throws {
        let tracker = ReadingTracker()
        let detail = Fixture.detail(Fixture.card("c1"), story: String(repeating: "雨", count: 640))
        tracker.start(detail, viewer: "alice", now: start)
        tracker.scrolled(story: CGRect(x: 0, y: 400, width: 360, height: 2000), visibleTop: 0, visibleHeight: 800,
                         now: start.addingTimeInterval(10))
        let first = try #require(tracker.appeared(false, onSelectedTab: true, now: start.addingTimeInterval(20)))
        // Hidden already: nothing more to say until it is back.
        #expect(tracker.sceneActive(false, now: start.addingTimeInterval(25)) == nil)
        #expect(tracker.sceneActive(true, now: start.addingTimeInterval(26)) == nil)
        tracker.appeared(true, onSelectedTab: true, now: start.addingTimeInterval(100))
        let second = try #require(tracker.appeared(false, onSelectedTab: true, now: start.addingTimeInterval(110)))
        #expect(first.cardId == "c1" && second.cardId == "c1")
        #expect(first.report.session == second.report.session)
        #expect(first.report.activeSeconds == 20)
        // The second is the whole so far (20 + 10), never the 10 since.
        #expect(second.report.activeSeconds == 30)
        #expect(second.report.progress >= first.report.progress)
        // 0.2 of the story in view (its foot at 800 of 400…2400).
        #expect(abs(first.report.progress - 0.2) < 0.001)
    }

    @Test func noReportIsSentForTheAuthor() {
        let tracker = ReadingTracker()
        let own = Fixture.detail(Fixture.card("c1", by: "alice"), isOwner: true)
        tracker.start(own, viewer: "alice", now: start)
        #expect(tracker.appeared(false, onSelectedTab: true, now: start.addingTimeInterval(60)) == nil)
        #expect(!ReadingSession.measures(own, viewer: "alice"))
        // Signed out, a private card, a card in the trash: none either.
        #expect(!ReadingSession.measures(Fixture.detail(Fixture.card("c2")), viewer: nil))
        #expect(!ReadingSession.measures(Fixture.detail(Fixture.card("c3", visibility: "private")), viewer: "alice"))
        #expect(ReadingSession.measures(Fixture.detail(Fixture.card("c4")), viewer: "alice"))
    }

    @Test func theSharedStorySaysSo() throws {
        let tracker = ReadingTracker()
        tracker.start(Fixture.detail(Fixture.card("c1")), viewer: "alice", now: start)
        tracker.shared()
        #expect(try #require(tracker.sceneActive(false, now: start.addingTimeInterval(5))).report.shared == true)
    }

    /// A page on a tab the reader left never disappears (every tab's stack stays mounted): choosing another tab hides
    /// it, and the app going and coming back never brings it back — 30 s a time nobody spent reading.
    @Test func aPageOnATabLeftCountsNothingWhileTheAppComesAndGoes() throws {
        let tracker = ReadingTracker()
        tracker.appeared(true, onSelectedTab: true, now: start)
        tracker.start(Fixture.detail(Fixture.card("c1"), story: String(repeating: "雨", count: 3200)), viewer: "alice", now: start)
        let left = try #require(tracker.tabChosen(false, now: start.addingTimeInterval(10)))
        #expect(left.report.activeSeconds == 10)
        // The app goes to the background and comes back, twice, while Messages is the tab in front.
        #expect(tracker.sceneActive(false, now: start.addingTimeInterval(20)) == nil)
        #expect(tracker.sceneActive(true, now: start.addingTimeInterval(30)) == nil)
        #expect(tracker.sceneActive(false, now: start.addingTimeInterval(100)) == nil)
        #expect(tracker.sceneActive(true, now: start.addingTimeInterval(200)) == nil)
        #expect(!tracker.onShow)
        // Back on its tab a minute later: counted from then, never the time it was out of sight.
        #expect(tracker.tabChosen(true, now: start.addingTimeInterval(260)) == nil)
        let back = try #require(tracker.appeared(false, onSelectedTab: true, now: start.addingTimeInterval(270)))
        #expect(back.report.activeSeconds == 20)
        #expect(back.report.session == left.report.session)
    }

    /// A page with another pushed over it (a related card opened from it) disappeared; the app coming to the front
    /// again doesn't bring it back — only being shown again does.
    @Test func aPageUnderAnotherScreenComesBackOnlyByBeingShown() throws {
        let tracker = ReadingTracker()
        tracker.appeared(true, onSelectedTab: true, now: start)
        // A short card whose end row is in view at once: a covered minute counted would make it read to the end.
        tracker.start(Fixture.detail(Fixture.card("c1"), story: String(repeating: "雨", count: 320)), viewer: "alice", now: start)
        tracker.sawEnd(now: start)
        let covered = try #require(tracker.appeared(false, onSelectedTab: true, now: start.addingTimeInterval(10)))
        #expect(covered.report.activeSeconds == 10)
        #expect(tracker.sceneActive(false, now: start.addingTimeInterval(20)) == nil)
        #expect(tracker.sceneActive(true, now: start.addingTimeInterval(30)) == nil)
        // Back on it 60 s later, and gone again 5 s after: 15 in all, not 45.
        tracker.appeared(true, onSelectedTab: true, now: start.addingTimeInterval(90))
        let again = try #require(tracker.appeared(false, onSelectedTab: true, now: start.addingTimeInterval(95)))
        #expect(again.report.activeSeconds == 15)
        #expect(!again.report.reachedEnd, "15 s < 0.4 × 60")
    }

    /// The card finished loading while another tab was chosen: nothing is counted until its tab is.
    @Test func aCardLoadedOutOfSightStartsCountingWhenShown() throws {
        let tracker = ReadingTracker()
        tracker.appeared(true, onSelectedTab: false, now: start)
        tracker.start(Fixture.detail(Fixture.card("c1"), story: String(repeating: "雨", count: 3200)), viewer: "alice", now: start)
        tracker.interacted(now: start.addingTimeInterval(5))
        tracker.tabChosen(true, now: start.addingTimeInterval(50))
        let report = try #require(tracker.appeared(false, onSelectedTab: true, now: start.addingTimeInterval(60)))
        #expect(report.report.activeSeconds == 10)
    }

    /// A touch or a key that doesn't scroll is reading too (§U7.1), as on Android: a story shown whole, touched and
    /// typed under without a scroll, keeps counting.
    @Test func touchesAndKeysKeepTheReadingGoing() throws {
        let tracker = ReadingTracker()
        tracker.start(Fixture.detail(Fixture.card("c1"), story: String(repeating: "雨", count: 3200)), viewer: "alice", now: start)
        tracker.interacted(now: start.addingTimeInterval(25))
        tracker.interacted(now: start.addingTimeInterval(50))
        let report = try #require(tracker.sceneActive(false, now: start.addingTimeInterval(120)))
        #expect(report.report.activeSeconds == 80)
        // Every 20 s for a minute: the whole minute.
        let steady = ReadingTracker()
        steady.start(Fixture.detail(Fixture.card("c2"), story: String(repeating: "雨", count: 3200)), viewer: "alice", now: start)
        for t in stride(from: 20.0, through: 60, by: 20) { steady.interacted(now: start.addingTimeInterval(t)) }
        #expect(try #require(steady.tabChosen(false, now: start.addingTimeInterval(60))).report.activeSeconds == 60)
        // Out of show, a touch says nothing.
        steady.interacted(now: start.addingTimeInterval(70))
        steady.tabChosen(true, now: start.addingTimeInterval(200))
        #expect(try #require(steady.tabChosen(false, now: start.addingTimeInterval(200))).report.activeSeconds == 60)
    }

    /// The page's touches are told by a UIKit recognizer on its own scroll view that fails as the touch goes down: it
    /// never cancels, delays or holds up the touch, the scroll or a tap.
    @Test func theTouchWatcherListensOnTheScrollViewAndTakesNothing() throws {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 390, height: 844))
        let scroll = UIScrollView(frame: window.bounds)
        let content = UIView(frame: CGRect(x: 0, y: 0, width: 390, height: 2000))
        scroll.addSubview(content)
        let touched = Flag()
        let view = ReadingTouchesView { touched.on = true }
        content.addSubview(view)
        window.addSubview(scroll)
        let watcher = view.watcher
        #expect(watcher.view === scroll)
        #expect(!watcher.cancelsTouchesInView && !watcher.delaysTouchesBegan && !watcher.delaysTouchesEnded)
        #expect(view.isHidden && !view.isUserInteractionEnabled)
        #expect(view.gestureRecognizer(watcher, shouldRecognizeSimultaneouslyWith: UIPanGestureRecognizer()))
        #expect(!watcher.canPrevent(UITapGestureRecognizer()))
        watcher.touchesBegan([], with: UIEvent())
        #expect(touched.on)
        // Outside a real touch's delivery UIKit may keep the state it set for later; it never begins either way.
        #expect([.possible, .failed].contains(watcher.state))
        // Off the window: off the scroll view.
        scroll.removeFromSuperview()
        #expect(watcher.view == nil)
    }

    @Test func theExpectedTimeIsTheStorysUnrounded() {
        #expect(abs(ReadTime.seconds(String(repeating: "字", count: 320)) - 60) < 0.001)
        #expect(abs(ReadTime.seconds(String(repeating: "字", count: 80)) - 15) < 0.001)
        #expect(ReadTime.minutes(String(repeating: "字", count: 80)) == 1)
        #expect(ReadTime.seconds("") == 0)
    }

    /// The app's privacy manifest says what the reading reports are (§O, as App Privacy will): product interaction,
    /// linked to the account, never tracking, used to run the app and to choose its picks.
    @Test func thePrivacyManifestDeclaresHowCardsAreRead() throws {
        let url = try #require(Bundle.main.url(forResource: "PrivacyInfo", withExtension: "xcprivacy"))
        let manifest = try #require(try PropertyListSerialization.propertyList(from: Data(contentsOf: url), format: nil) as? [String: Any])
        #expect(manifest["NSPrivacyTracking"] as? Bool == false)
        let collected = try #require(manifest["NSPrivacyCollectedDataTypes"] as? [[String: Any]])
        let reading = try #require(collected.first {
            $0["NSPrivacyCollectedDataType"] as? String == "NSPrivacyCollectedDataTypeProductInteraction"
        })
        #expect(reading["NSPrivacyCollectedDataTypeLinked"] as? Bool == true)
        #expect(reading["NSPrivacyCollectedDataTypeTracking"] as? Bool == false)
        #expect(Set(reading["NSPrivacyCollectedDataTypePurposes"] as? [String] ?? []) == [
            "NSPrivacyCollectedDataTypePurposeAppFunctionality", "NSPrivacyCollectedDataTypePurposeProductPersonalization",
        ])
    }

    @Test func anUnsentReportIsKeptAndSentAtTheNextLaunch() async {
        let defaults = UserDefaults(suiteName: "reading-reports-\(UUID().uuidString)")!
        let failing = Flag()
        failing.on = true
        let sent = Calls<String>()
        let reports = ReadingReports(defaults: defaults, now: { self.start }) { id, report in
            if failing.on { throw URLError(.notConnectedToInternet) }
            await sent.record("\(id):\(report.session):\(report.activeSeconds)")
        }
        await reports.report(.init(session: "view-0003", activeSeconds: 12, progress: 0.5, reachedEnd: false), cardId: "c1",
                             uid: "alice").value
        #expect(reports.pending.count == 1)
        // A later report of the same view replaces it (the server keeps the largest anyway).
        await reports.report(.init(session: "view-0003", activeSeconds: 30, progress: 0.8, reachedEnd: false), cardId: "c1",
                             uid: "alice").value
        #expect(reports.pending.count == 1 && reports.pending.first?.activeSeconds == 30)
        // The next launch (the network back): sent, and gone from the device.
        failing.on = false
        let later = ReadingReports(defaults: defaults, now: { self.start }) { id, report in
            await sent.record("\(id):\(report.session):\(report.activeSeconds)")
        }
        later.flush(uid: "alice")
        #expect(await eventually { later.pending.isEmpty })
        #expect(await sent.all == ["c1:view-0003:30.0"])
    }

    @Test func anotherAccountsReportsGo() async {
        let defaults = UserDefaults(suiteName: "reading-reports-\(UUID().uuidString)")!
        let reports = ReadingReports(defaults: defaults, now: { self.start }) { _, _ in throw URLError(.timedOut) }
        await reports.report(.init(session: "view-0004", activeSeconds: 5, progress: 0.1, reachedEnd: false), cardId: "c1",
                             uid: "alice").value
        reports.retainOnly("bob")
        #expect(reports.pending.isEmpty)
    }
}
