import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// Measuring reading (round 26 §U7): active time (in front, and a scroll or a touch within the last 30 s), how far
/// through the story, the end row seen — read to the end only with 0.4 of the expected time behind it — sent as the
/// page view's running totals each time it hides (never deltas), kept on the device until the server has them, and
/// never for the author.
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
        let first = try #require(tracker.hid(now: start.addingTimeInterval(20)))
        // Hidden already: nothing more to say until it is back.
        #expect(tracker.hid(now: start.addingTimeInterval(25)) == nil)
        tracker.cameBack(now: start.addingTimeInterval(100))
        let second = try #require(tracker.hid(now: start.addingTimeInterval(110)))
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
        #expect(tracker.hid(now: start.addingTimeInterval(60)) == nil)
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
        #expect(try #require(tracker.hid(now: start.addingTimeInterval(5))).report.shared == true)
    }

    @Test func theExpectedTimeIsTheStorysUnrounded() {
        #expect(abs(ReadTime.seconds(String(repeating: "字", count: 320)) - 60) < 0.001)
        #expect(abs(ReadTime.seconds(String(repeating: "字", count: 80)) - 15) < 0.001)
        #expect(ReadTime.minutes(String(repeating: "字", count: 80)) == 1)
        #expect(ReadTime.seconds("") == 0)
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
