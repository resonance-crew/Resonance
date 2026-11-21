import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import Testing
@testable import Resonance

/// After 共振, which part stayed with the reader (round 27 §U1, §P7; the owner: 「在点击共振之后呢，还可以出现一个可能一个
/// pop ups」): a centred dialog of the card's passages, opened only by a press that turns the tap on, 240 ms after it,
/// on a card offering two or more, never over a translation; the tap never waits on it. The app's own copy of the tap
/// keeps the passages and the pick through every flip (M1), and a refusal of the pick is told apart from a failure.
@MainActor @Suite struct TapPassagesTests {
    private let three = [TapPassage(id: "14fecaaf", text: "第一段"), TapPassage(id: "8b3a1c4d", text: "第二段"),
                         TapPassage(id: "85007cbf", text: "第三段")]

    private func tap(mine: Bool = false, passages: [TapPassage]? = nil, passage: String? = nil) -> CardTap {
        CardTap(mine: mine, faces: [], more: false, mayNote: true, passages: passages, passage: passage)
    }

    @Test func itOpensOnlyOnAPressThatTurnsTheTapOn() {
        #expect(TapPassageRules.opens(turningOn: true, passages: three, translated: false))
        // Taking the tap back opens nothing.
        #expect(!TapPassageRules.opens(turningOn: false, passages: three, translated: false))
        // One passage, or none (a short card answers as in round 26): nothing to choose between.
        #expect(!TapPassageRules.opens(turningOn: true, passages: Array(three.prefix(1)), translated: false))
        #expect(!TapPassageRules.opens(turningOn: true, passages: [], translated: false))
        // The story on screen in translation: its passages are the author's own words, not these.
        #expect(!TapPassageRules.opens(turningOn: true, passages: three, translated: true))
    }

    @Test func itOpensAfterTheFaceHasSlidInAndAtOnceUnderReduceMotion() {
        #expect(TapPassageRules.openDelay == .milliseconds(240))
        #expect(TapPassageRules.delay(TapPassageRules.openDelay, reduceMotion: true) == .zero)
        #expect(TapPassageRules.closeDelay == .milliseconds(300))
        #expect(TapPassageRules.delay(TapPassageRules.closeDelay, reduceMotion: false) == .milliseconds(300))
    }

    @Test func theDialogIsTheReaderListsWidthAndScrollsInsideItsCap() {
        #expect(TapListMetrics.readerWidth(compact: true) == 400)
        #expect(TapListMetrics.readerWidth(compact: false) == 480)
        #expect(TapPassageRules.listHeight(window: 2000) == 420)
        #expect(TapPassageRules.listHeight(window: 600) == 330)
        #expect(TapPassageRules.textSize == 16 && TapPassageRules.checkSize == 16)
    }

    @Test func aPressPicksPressingThePickedOneClearsAnotherReplaces() {
        #expect(TapPassageRules.choice(pressing: "8b3a1c4d", current: nil) == "8b3a1c4d")
        #expect(TapPassageRules.choice(pressing: "8b3a1c4d", current: "8b3a1c4d") == nil)
        #expect(TapPassageRules.choice(pressing: "85007cbf", current: "8b3a1c4d") == "85007cbf")
    }

    /// §P7 (M1): the passages ride through the app's copy of the tap — the first press, taking it back, the second
    /// press — so the dialog opens again; the pick goes with the tap and comes back only if the flip failed.
    @Test func theTapKeepsItsPassagesThroughEveryFlip() {
        let viewer = Fixture.author("dora")
        var state = TapState(tap(passages: three))
        #expect(state.passages == three && state.passage == nil)
        let first = state.flip(viewer: viewer)
        #expect(first)
        state.settled(turningOn: true, result: true, viewer: viewer)
        state.pick("8b3a1c4d")
        #expect(state.passage == "8b3a1c4d")
        // Taken back: the pick goes at once (the server clears it in the same write); the passages stay.
        let back = state.flip(viewer: viewer)
        #expect(!back)
        #expect(state.passage == nil && state.passages == three)
        state.settled(turningOn: false, result: false, viewer: viewer)
        // On again: the dialog has its passages to open with, and no pick.
        let again = state.flip(viewer: viewer)
        #expect(again)
        state.settled(turningOn: true, result: true, viewer: viewer)
        #expect(TapPassageRules.opens(turningOn: true, passages: state.passages, translated: false))
        #expect(state.passage == nil)
    }

    @Test func aFailedTakeBackPutsThePickBack() {
        let viewer = Fixture.author("dora")
        var state = TapState(tap(mine: true, passages: three, passage: "14fecaaf"))
        #expect(state.passage == "14fecaaf")
        _ = state.flip(viewer: viewer)
        #expect(state.passage == nil)
        state.settled(turningOn: false, result: nil, viewer: viewer)
        #expect(state.on && state.passage == "14fecaaf")
    }

    @Test func onlyOneOfThePassagesIsTakenAndOnlyWhileTheTapIsOn() {
        var off = TapState(tap(passages: three))
        off.pick("14fecaaf")
        #expect(off.passage == nil)
        var on = TapState(tap(mine: true, passages: three))
        on.pick("ffffffff")
        #expect(on.passage == nil)
        on.pick("85007cbf")
        #expect(on.passage == "85007cbf")
        on.pick(nil)
        #expect(on.passage == nil)
    }

    /// The tap as the server sends it, read back: a short card's (no fields) has none; the author's own has none.
    @Test func aShortCardOffersNothing() {
        let state = TapState(tap(mine: true))
        #expect(state.passages.isEmpty && state.passage == nil)
        #expect(!TapPassageRules.offers(state.passages))
        #expect(TapState(nil).passages.isEmpty)
    }

    /// §U1.6: 400 or 409 (the options changed, the tap went) → read the card again, quietly; anything else → the toast.
    @Test func aRefusedPickReadsTheCardAgainAFailureSaysSo() {
        #expect(TapPassageRules.refusal(status: 400) == .readAgain)
        #expect(TapPassageRules.refusal(status: 409) == .readAgain)
        #expect(TapPassageRules.refusal(status: 404) == .failed)
        #expect(TapPassageRules.refusal(status: 429) == .failed)
        #expect(TapPassageRules.refusal(status: nil) == .failed)
    }

    @Test func theDialogsWordsAreTheRoundsStrings() {
        #expect(!L10n.Card.Tap.passageTitle.isEmpty && L10n.Card.Tap.passageTitle != "card.tap.passageTitle")
        #expect(!L10n.Card.Tap.passageSkip.isEmpty && L10n.Card.Tap.passageSkip != "card.tap.passageSkip")
    }
    /// Post-merge review (round 27): the dialog takes one press, as the web's does. A double tap, or a second row
    /// pressed inside the 300 ms before it closes, changes nothing and sends nothing more; opened again, it takes a
    /// press again (and a press on the picked row then clears it). Each step is `CardEndRow.choosePassage`'s.
    @Test func theDialogTakesOnePressUntilItOpensAgain() {
        let viewer = Fixture.author("dora")
        var state = TapState(tap(passages: three))
        _ = state.flip(viewer: viewer)
        state.settled(turningOn: true, result: true, viewer: viewer)
        var gate = TapPassageRules.OnePress()
        var sent: [String?] = []
        func press(_ id: String) {
            let choice = TapPassageRules.choice(pressing: id, current: state.passage)
            guard gate.take() else { return }
            state.pick(choice)
            sent.append(choice)
        }
        // A double tap on the first row.
        press(three[0].id)
        press(three[0].id)
        #expect(state.passage == three[0].id)
        #expect(sent == [three[0].id])
        // A second row straight after: still the first, still one request.
        press(three[1].id)
        #expect(state.passage == three[0].id)
        #expect(sent == [three[0].id])
        // The dialog opens again (the reader's own row in the list): one press counts, and on the pick it clears it.
        gate.reopen()
        press(three[0].id)
        #expect(state.passage == nil)
        #expect(sent == [three[0].id, nil])
    }
}
