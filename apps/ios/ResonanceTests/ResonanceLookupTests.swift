import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// 共振 under a story waits to know whether the reader has answered the card already — and never
/// stays dimmed for good when that can't be read for a moment: the lookup is tried again by
/// itself, then on the reader's tap.
@MainActor @Suite struct ResonanceLookupTests {
    struct Refused: Error {}

    @Test func aLookupThatFailsForAMomentIsTriedAgainByItself() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5), .milliseconds(5)])
        var asked = 0
        await lookup.look {
            asked += 1
            // Refused just after signing in; answered the next time.
            if asked == 1 { throw Refused() }
            return nil
        }
        #expect(asked == 2)
        #expect(lookup.state == .found(nil))
    }

    @Test func oneThatKeepsFailingIsATapAwayNeverDimmedForGood() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5)])
        await lookup.look { throw Refused() }
        // Not "looking" (dimmed, untappable) any more: there to tap.
        #expect(lookup.state == .failed)

        // Tapped while it still can't be read: a quiet line, and the button stays to try again.
        #expect(await lookup.askOnTap { throw Refused() } == .unknown)
        #expect(lookup.tapFailed)
        #expect(lookup.state == .failed)

        // Tapped again, and answered: none yet, so the picker opens.
        #expect(await lookup.askOnTap { nil } == .unanswered)
        #expect(lookup.state == .found(nil))
        #expect(!lookup.tapFailed)
    }

    @Test func aTapThatFindsTheReadersResonanceOpensNoPicker() async {
        let lookup = ResonanceLookup(retries: [])
        await lookup.look { throw Refused() }
        let mine = DraftService.Resonance(id: "r1", published: true)
        #expect(await lookup.askOnTap { mine } == .answered(mine))
        // The button becomes 已共振 instead (the press opens that card): no second resonance begun.
        #expect(lookup.state == .found(mine))
    }

    @Test func lookingAgainKeepsTheAnswerMeanwhileButNotOneItCouldntAskAgain() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5)])
        let mine = DraftService.Resonance(id: "r1", published: false)
        await lookup.look { mine }
        // Asked again (after a change): what was known stays on screen while it is asked.
        let gate = Gate<Bool>()
        let again = Task { await lookup.look { _ = await gate.wait(); throw Refused() } }
        try? await Task.sleep(for: .milliseconds(30))
        #expect(lookup.state == .found(mine))
        // It can't be asked: the draft may have been deleted by the change — never 修改 on a card that
        // isn't there. 共振 instead, which asks again on a tap.
        await gate.open(true)
        await again.value
        #expect(lookup.state == .failed)
    }

    /// A read that never answers — and doesn't hear that it is no longer wanted, as Firestore's
    /// doesn't — the way a hung connection leaves it.
    @MainActor final class Hung {
        private(set) var asked = 0
        private var waiting: [CheckedContinuation<DraftService.Resonance?, Never>] = []
        func read() async -> DraftService.Resonance? {
            asked += 1
            return await withCheckedContinuation { waiting.append($0) }
        }
        func release() {
            waiting.forEach { $0.resume(returning: nil) }
            waiting = []
        }
    }

    @Test(.timeLimit(.minutes(1))) func aLookupThatHangsIsAFailureTooNeverADimmedButtonForGood() async {
        let lookup = ResonanceLookup(retries: [.milliseconds(5)], patience: .milliseconds(60),
                                     askPatience: .milliseconds(60))
        let hung = Hung()
        defer { hung.release() }
        await lookup.look { await hung.read() }
        // Each try gave up after its patience, and was tried again: then there to tap.
        #expect(hung.asked == 2)
        #expect(lookup.state == .failed)

        // A tap whose read hangs as well: the button stops inking, a quiet line says so.
        #expect(await lookup.askOnTap { await hung.read() } == .unknown)
        #expect(!lookup.asking)
        #expect(lookup.tapFailed)
        #expect(lookup.state == .failed)

        // The hung reads answering late change nothing; the next tap is answered.
        hung.release()
        try? await Task.sleep(for: .milliseconds(20))
        #expect(lookup.state == .failed)
        #expect(await lookup.askOnTap { nil } == .unanswered)
        #expect(lookup.state == .found(nil))
    }

    @Test(.timeLimit(.minutes(1))) func aLookupLeftBehindEndsAtOnceThoughItsReadHangs() async {
        let lookup = ResonanceLookup(retries: [.seconds(60)], patience: .seconds(60))
        let hung = Hung()
        defer { hung.release() }
        let ended = Flag()
        // The page moved on (another card, a change): the lookup for the old one is cancelled, and
        // ends then — not when its read finally answers.
        let left = Task { await lookup.look { await hung.read() }; ended.on = true }
        #expect(await eventually { hung.asked == 1 })
        left.cancel()
        #expect(await eventually(within: .seconds(2)) { ended.on })
        #expect(lookup.state == .looking)
    }

    // MARK: Round 35 §4 — live from the first frame, a press before the answer asks and opens

    @Test(.timeLimit(.minutes(1))) func theSegmentNeverInksForTheBackgroundLookup() async {
        let lookup = ResonanceLookup(retries: [], patience: .seconds(60))
        let hung = Hung()
        defer { hung.release() }
        // Entering the page: the lookup is on its way (on a simulator Firestore can stall without failing)…
        let looking = Task { await lookup.look { await hung.read() } }
        #expect(await eventually { hung.asked == 1 })
        #expect(lookup.state == .looking)
        // …and the segment is there to press, no spinner, and the press asks rather than opening the picker unknowing.
        #expect(!lookup.inks)
        #expect(!lookup.pressOpensPicker)
        looking.cancel()
    }

    @Test(.timeLimit(.minutes(1))) func aPressBeforeTheAnswerAsksThenAndOpensWhatItSays() async {
        let lookup = ResonanceLookup(retries: [], patience: .seconds(60))
        let hung = Hung()
        defer { hung.release() }
        let looking = Task { await lookup.look { await hung.read() } }
        #expect(await eventually { hung.asked == 1 })

        // Pressed while the background read hangs: its own read answers — none, so the picker opens.
        let gate = Gate<Bool>()
        let press = Task { await lookup.askOnTap { _ = await gate.wait(); return nil } }
        #expect(await eventually { lookup.inks })
        await gate.open(true)
        #expect(await press.value == .unanswered)
        #expect(!lookup.inks)
        #expect(lookup.state == .found(nil))
        // From now on a press opens the picker at once.
        #expect(lookup.pressOpensPicker)
        looking.cancel()

        // A reader who has a reply card: the press opens it (published) or its draft — never a second one.
        let other = ResonanceLookup(retries: [])
        let draft = DraftService.Resonance(id: "d1", published: false)
        #expect(await other.askOnTap { draft } == .answered(draft))
        #expect(other.state == .found(draft))
    }

    @Test(.timeLimit(.minutes(1))) func aPressWhoseReadHangsEndsAtItsOwnPatience() async {
        // The background lookup's patience is long; a press's is its own (6 s in the app).
        #expect(ResonanceLookup().askPatience == .seconds(6))
        let lookup = ResonanceLookup(retries: [], patience: .seconds(60), askPatience: .milliseconds(80))
        let hung = Hung()
        defer { hung.release() }
        let started = ContinuousClock.now
        #expect(await lookup.askOnTap { await hung.read() } == .unknown)
        #expect(ContinuousClock.now - started < .seconds(5))
        // The quiet line, and the segment pressable again (not inking).
        #expect(lookup.tapFailed)
        #expect(!lookup.inks)
    }

    @Test(.timeLimit(.minutes(1))) func aBackgroundFailureAfterAPressWasAnsweredKeepsThatAnswer() async {
        let lookup = ResonanceLookup(retries: [], patience: .milliseconds(150))
        let hung = Hung()
        defer { hung.release() }
        let looking = Task { await lookup.look { await hung.read() } }
        #expect(await eventually { hung.asked == 1 })
        let mine = DraftService.Resonance(id: "r1", published: true)
        #expect(await lookup.askOnTap { mine } == .answered(mine))
        // The background read then runs out of patience: 已回應 stays.
        await looking.value
        #expect(lookup.state == .found(mine))
    }
}
