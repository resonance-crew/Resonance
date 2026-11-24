import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import SwiftUI
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
        // Wave 2 #3a: ~100-character passages, so min(560, 70 % of the window).
        #expect(TapPassageRules.listHeight(window: 2000) == 560)
        #expect(TapPassageRules.listHeight(window: 600) == 420)
        #expect(TapPassageRules.textSize == 16 && TapPassageRules.checkSize == 16)
    }

    /// The owner's look (2026-11-21): 「这个选中的区块是延伸到这个 pop up 这个卡片的最左边和最右边的」 — a row's band runs
    /// from the paper's left edge to its right, clipped to the wobble, as the web's; the words keep their inset.
    @Test func aRowsBandRunsToThePapersEdgesAndItsWordsKeepTheirInset() {
        let reach = TapPassageRules.reach(clipped: true)
        // The band is not cut: the paper's clip shapes its ends.
        #expect(!TapPassageRules.bandCut(clipped: true))
        // The words: the list stands `reach` out of the dialog's content and each row pads `reach` back in, so they stay
        // on the dialog's own inset from the paper's frame — the family's 24 since round 33 §Q2 (every other dialog's 28).
        #expect(ModalPaper.inset == 28 && ModalPaper.listInset == 24)
        // Past the paper's frame by the bleed, and only that much is kept from a press.
        #expect(reach - ModalPaper.listInset == ModalPaper.bleed)
        #expect(TapPassageRules.overhang(reach: reach) == ModalPaper.bleed)
        // Out of a clipping dialog the rows stay inside the paper, cut and rounded, as the first captures.
        #expect(TapPassageRules.bandCut(clipped: false))
        #expect(TapPassageRules.overhang(reach: TapPassageRules.reach(clipped: false)) == 0)
        // At the dialog's widths (a phone's 400, a tablet's and the Mac's 480) and heights from a short list to the
        // tallest, the paper of seed 37 never swings past the band's reach: the band meets the pen line everywhere.
        for width in [TapListMetrics.readerWidth(compact: true), TapListMetrics.readerWidth(compact: false)] {
            for height in [CGFloat(260), 420, 640] {
                let frame = CGRect(x: 0, y: 0, width: width, height: height)
                let paper = ModalPaper.outline(in: frame, seed: 37).boundingRect
                #expect(paper.minX >= frame.minX - ModalPaper.bleed && paper.maxX <= frame.maxX + ModalPaper.bleed)
            }
        }
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

    // MARK: Round 32 (the owner, after 2.6.0 on the iPad)

    private static let long = [
        TapPassage(id: "a", text: String(repeating: "箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。", count: 4)),
        TapPassage(id: "b", text: String(repeating: "你不是失去了一個家，你是多了一個可以回去的地方。", count: 4)),
        TapPassage(id: "c", text: String(repeating: "The quiet after moving out felt like mine — finally. ", count: 5)),
    ]

    private func dialog(_ passages: [TapPassage], room: CGFloat?) -> some View {
        TapPassages(passages: passages, picked: nil, script: .cjk, onChoose: { _ in }, onSkip: {})
            .environment(\.modalRoom, room)
    }

    /// §P1 — 「略过固定不动」, 「标题与段落文字合一滚动」: one scroll region (the title its first child, then the rows); since
    /// round 33 §Q3 略過 floats over the region's bottom fade as the family's tonal small pill (it was round 32's words
    /// alone in a foot under the region — this test pinned that, then the float; since round 34 the family's region draws the
    /// pill: the footer while the title and rows fit, floating once they scroll).
    @Test func theTitleScrollsWithTheRowsAndSkipFloatsOverTheFade() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/TapPassages.swift").standardized
        let source = try String(contentsOf: url, encoding: .utf8)
        let body = try #require(source.range(of: "var body: some View {")).upperBound
        let view = String(source[body...])
        let scroll = try #require(view.range(of: "TapDialogRegion(cap: TapPassageRules.regionCap("))
        let title = try #require(view.range(of: "ModalTitle(L10n.Card.Tap.passageTitle"))
        let skip = try #require(view.range(of: ".dialogExit(L10n.Card.Tap.passageSkip, id: \"tap-passage-skip\""))
        #expect(scroll.lowerBound < title.lowerBound && title.lowerBound < skip.lowerBound)
        // One region: no scroll of its own here (the region's).
        #expect(!view.contains("ScrollView {"))
        #expect(!view.contains("ModalCloseButton(") && !view.contains("QuietTextButton("))
        #expect(TapPassageRules.titleGap == 10)
    }

    /// §P1 — the whole dialog always fits the stage: the region's cap is min(560, 70 % of the window) and the floating
    /// 略過's room under the rows (round 33 §Q3), and never more than what the stage leaves it with the paper's bottom
    /// inset it reaches into; so the backdrop never scrolls it and 略過 never moves.
    @Test func theDialogAlwaysFitsWhatTheStageLeavesIt() {
        // Round 34: the region's cap, to the paper's bottom edge (the foot of 18 + 44 + 24 inside it).
        #expect(TapDialog.budget(cap: 560, exit: true) == 560 - ModalPaper.insetV)
        #expect(TapPassageRules.regionCap(window: 2000, room: nil) == 560)
        #expect(TapPassageRules.regionCap(window: 2000, room: 3000) == 560)
        #expect(TapPassageRules.regionCap(window: 600, room: 500) == 420)
        // A short stage (380, less the margins and the paper's air) in a taller window: the stage, not the 70 %, holds it.
        let room = ModalPaper.room(stage: 380)
        #expect(abs(room - CGFloat(380 - 2 * 12 - 2 * 32)) < 0.001)
        #expect(TapPassageRules.regionCap(window: 600, room: room) == room + ModalPaper.insetV)
        // Laid out: long passages in a short room take exactly the room (they scroll in a region down to the paper's edge, its
        // bottom inset given back) — never more.
        for room in [220.0, 300, 480] {
            let size = dialogSize(dialog(Self.long, room: room), width: 344)
            #expect(size.height <= room + 0.5, "room \(room): \(size.height)")
            #expect(size.height >= room - 1, "room \(room): \(size.height)")
        }
        // Short passages: as short as they are, with no empty room.
        let short = [TapPassage(id: "a", text: "第一段"), TapPassage(id: "b", text: "第二段")]
        #expect(dialogSize(dialog(short, room: 480), width: 344).height < 300)
    }

    /// §P2 — 「区段与区段之间加上分隔线」: a rule between two rows, never above the first or under the last.
    @Test func aRuleStandsBetweenTwoRowsOnly() throws {
        #expect((0..<3).map(TapPassageRules.ruled(index:)) == [false, true, true])
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/TapPassages.swift").standardized
        let source = try String(contentsOf: url, encoding: .utf8)
        // Round 34 §6: the rule is the row's band edge (its own key's curve across the row), masked to the words' span.
        let rule = try #require(source.range(of: "private func rule(key: String, reach: CGFloat)")).upperBound
        let body = String(source[rule...].prefix(400))
        #expect(body.contains("BandEdge(key: key)"))
        #expect(body.contains(".padding(.horizontal, reach)"))
        #expect(!source.contains("WavyDivider("))
        #expect(source.contains("rule(key: ids[i], reach: reach)"))
    }

    /// §6 — one source: a rule's curve is exactly where the band of the row under it begins and the band of the row
    /// over it ends (the same key, the same width, the same y).
    @Test func aRuleIsTheBandsOwnEdge() {
        let ids = ["passage:a", "passage:b", "passage:c"]
        let below = ListBands.below(ids, after: ListBands.endKey)
        let w = 432.0, h = 88.0
        for i in 1..<ids.count {
            let rule = dividerPath(ListBands.curve(y: 0, w: w, key: ids[i]))
            // The row under it: its band's top edge.
            let under = ListBands.region(w: w, h: h, top: ids[i], bottom: below[i])
            #expect(Array(under.prefix(rule.count)) == rule, "row \(i)'s top")
            // The row over it: its band's bottom edge, at its foot (the same curve, h lower in its own frame).
            #expect(below[i - 1] == ids[i])
            let over = ListBands.curve(y: h, w: w, key: below[i - 1]).flatMap { [$0.x, $0.y - h] }
            let edge = ListBands.curve(y: 0, w: w, key: ids[i]).flatMap { [$0.x, $0.y] }
            #expect(zip(over, edge).allSatisfy { abs($0 - $1) < 1e-9 } && over.count == edge.count, "row \(i - 1)'s bottom")
        }
        let rect = CGRect(x: 0, y: 0, width: w, height: h)
        #expect(BandEdge(key: ids[1]).path(in: rect).boundingRect.width > 0)
    }

    /// §7 — the check's slot is kept on every row: picking a row never rewraps its words, so the dialog keeps its height.
    @Test func pickingARowNeverRewrapsItsWords() throws {
        let passages = [
            TapPassage(id: "a", text: String(repeating: "箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。", count: 3)),
            TapPassage(id: "b", text: "你不是失去了一個家，你是多了一個可以回去的地方。"),
        ]
        for width in [300.0, 344, 400] {
            let free = dialogSize(TapPassages(passages: passages, picked: nil, script: .cjk, onChoose: { _ in }, onSkip: {}), width: width)
            let picked = dialogSize(TapPassages(passages: passages, picked: "a", script: .cjk, onChoose: { _ in }, onSkip: {}), width: width)
            #expect(free.height == picked.height, "\(width): \(free.height) vs \(picked.height)")
        }
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../Resonance/Features/Card/TapPassages.swift").standardized
        let source = try String(contentsOf: url, encoding: .utf8)
        #expect(source.contains(".opacity(chosen ? 1 : 0)"))
        #expect(!source.contains("if chosen {"))
    }

    /// §P3 — the passages' dialog has no flash: its rows are known when it opens, so its first layout is its last —
    /// measured twice at the same width it answers the same height (nothing measured later grows or shrinks it).
    @Test func thePassagesDialogsFirstLayoutIsItsLast() {
        let first = dialogSize(dialog(Self.long, room: 900), width: 344)
        let again = dialogSize(dialog(Self.long, room: 900), width: 344)
        #expect(first == again)
        #expect(first.height > 200)
    }
}
