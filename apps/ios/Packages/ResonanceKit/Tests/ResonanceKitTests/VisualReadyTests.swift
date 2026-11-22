#if DEBUG
import Foundation
import Testing
@testable import ResonanceKit

/// The release screenshots' ready signal: said once the screen is quiet, never before, never in a launch that didn't
/// ask (the twin of Android's VisualReadyTest).
@Suite(.serialized) struct VisualReadyTests {
    /// What was put off and what was said, run by hand as the main queue would.
    final class Harness: @unchecked Sendable {
        private let lock = NSLock()
        private var pending: [(TimeInterval, @Sendable () -> Void)] = []
        private var spoken: [String] = []
        let ready = VisualReady()

        func start(_ token: String = "t1") {
            ready.start(
                token: token,
                schedule: { [self] delay, run in lock.withLock { pending.append((delay, run)) } },
                say: { [self] token in lock.withLock { spoken.append(token) } }
            )
        }

        func runLater() {
            let due = lock.withLock { () -> [(TimeInterval, @Sendable () -> Void)] in defer { pending.removeAll() }; return pending }
            due.forEach { $0.1() }
        }

        var words: [String] { lock.withLock { spoken } }
        var delays: [TimeInterval] { lock.withLock { pending.map(\.0) } }
    }

    @Test func saysReadyOnceTheCallsHaveAnsweredAndNoPlaceholderIsLeft() {
        let h = Harness()
        h.start()
        h.ready.placeholder(1)
        #expect(h.ready.requestStarted())
        h.ready.requestEnded()
        h.runLater()
        #expect(h.words.isEmpty)
        h.ready.placeholder(-1)
        #expect(h.delays == [VisualReady.quiet])
        h.runLater()
        #expect(h.words == ["ready t1"])
        // Said once a launch.
        #expect(h.ready.requestStarted())
        h.ready.requestEnded()
        h.runLater()
        #expect(h.words == ["ready t1"])
    }

    @Test func aCallOrAPlaceholderWithinTheQuietTimeStartsItAgain() {
        let h = Harness()
        h.start()
        #expect(h.ready.requestStarted())
        h.ready.requestEnded()
        #expect(h.ready.requestStarted())
        h.runLater()
        #expect(h.words.isEmpty)
        h.ready.requestEnded()
        h.ready.placeholder(1)
        h.ready.placeholder(-1)
        h.runLater()
        #expect(h.words == ["ready t1"])
    }

    @Test func neverSaysReadyBeforeAnythingAnswered() {
        let h = Harness()
        h.start()
        h.ready.placeholder(1)
        h.ready.placeholder(-1)
        h.runLater()
        #expect(h.words.isEmpty)
    }

    @Test func isSilentUnlessALaunchAskedForIt() {
        let ready = VisualReady()
        #expect(!ready.requestStarted())
        ready.requestEnded()
        ready.placeholder(1)
        #expect(!ready.isEnabled)
    }

    @Test func saysItUnderTheSubsystemTheHarnessReads() {
        #expect(VisualReady.subsystem == "com.resonance.visual")
    }
}
#endif
