import DesignSystem
import FirebaseFirestore
import Foundation
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// Round 23 §4/§5: the notifications' rows — and a phone's conversations — are bands parted by hand-drawn curves
/// seen only as the edge of a row's wash. Neighbours share one curve, seeded by the lower row's key (so a row coming
/// in on top moves no other curve); a part's title sits on bare paper clear of them; the press waits 80 ms and a
/// scroll takes it back; only a phone's conversations change.
@MainActor @Suite struct ListBandsTests {
    // MARK: The curves

    /// The y of each point of a closed region's top curve (from its move to its first line) and its bottom one
    /// (after the line, reversed back to left-to-right), each less its edge's height.
    private func edges(_ region: [PathCommand], h: Double) -> (top: [Double], bottom: [Double]) {
        var top: [Double] = [], bottom: [Double] = [], onBottom = false
        for command in region {
            switch command {
            case let .move(_, y): top.append(y)
            case let .cubic(_, _, _, _, _, y): onBottom ? bottom.append(y - h) : top.append(y)
            case let .line(_, y):
                onBottom = true
                bottom.append(y - h)
            default: break
            }
        }
        return (top, bottom.reversed())
    }

    @Test func neighboursShareOneCurveSeededByTheLowerRow() {
        let w = 402.0
        // Row a (64 tall) over row b (90 tall): a's bottom curve is b's top curve, wherever each is drawn.
        let a = edges(ListBands.region(w: w, h: 64, top: "a", bottom: "b"), h: 64)
        let b = edges(ListBands.region(w: w, h: 90, top: "b", bottom: "c"), h: 90)
        #expect(a.bottom.count == b.top.count)
        #expect(zip(a.bottom, b.top).allSatisfy { abs($0 - $1) <= 0.0101 })
        // A row come in on top (z over a) leaves a's curves as they were: a's top is its own key's.
        let afterInsert = edges(ListBands.region(w: w, h: 64, top: "a", bottom: "b"), h: 64)
        #expect(afterInsert.top == a.top && afterInsert.bottom == a.bottom)
        // Each band swings about its edges by the menus' 2 at most, flat where it meets the screen's sides.
        #expect((a.top + a.bottom).allSatisfy { abs($0) <= ListBands.amp })
        #expect(a.top.first == 0 && a.top.last == 0)
        // Two different keys draw two different curves.
        #expect(a.top != a.bottom)
    }

    @Test func aWideWindowsBandTurnsOnceEveryHundred() {
        // A phone's 402 keeps a menu's 4; an iPad's 1180 and the Mac's 1440 turn about every 100.
        #expect(ListBands.steps(402) == 4)
        #expect(ListBands.steps(1180) == 12)
        #expect(ListBands.steps(1440) == 14)
        #expect(ListBands.curve(y: 0, w: 1180, key: "row").count == 12 + 3)
    }

    @Test func theCurveUnderEachRowIsTheNextRowsThenWhatFollows() {
        #expect(ListBands.below(["a", "b", "c"], after: "part:thisWeek") == ["b", "c", "part:thisWeek"])
        #expect(ListBands.below(["a"], after: ListBands.endKey) == [ListBands.endKey])
        #expect(ListBands.below([], after: ListBands.endKey).isEmpty)
    }

    @Test func theBellsPartsEndOnTheNextTitleAndTheListsEnd() {
        func item(_ id: String) -> NotificationsStore.Item {
            NotificationsStore.item(id: id, data: ["type": "message", "payload": ["fromHandle": "mei"]])
        }
        let parts = [BellTime.Part(group: .today, items: [item("a"), item("b")]),
                     BellTime.Part(group: .thisWeek, items: [item("c")]),
                     BellTime.Part(group: .earlier, items: [item("d"), item("e")])]
        let bands = NotificationsScreen.bands(parts)
        #expect(bands.map { $0.rows.map(\.below) } == [["b", "part:thisWeek"], ["part:earlier"], ["e", ListBands.endKey]])
        #expect(bands.map { $0.rows.map(\.id) } == [["a", "b"], ["c"], ["d", "e"]])
        // Each title's own key: the band above it ends on it.
        #expect([BellTime.Group.today, .thisWeek, .earlier].map(\.key) == ["part:today", "part:thisWeek", "part:earlier"])
    }

    @Test func theRowsTouchAndTheTitlesSitOnBarePaper() {
        // 12 above and below each row's content, nothing between rows.
        #expect(ListBands.rowPad == 12)
        // A title's side toward a band: the curve's 2 of swing and 4 clear of it.
        #expect(ListBands.titleToBand == 6)
        #expect(ListBands.titleToBand - CGFloat(ListBands.amp) >= ListBands.titleClear)
        // Round 21's 24 from a part's last row's content to the next title, kept.
        #expect(ListBands.rowPad + NotificationsScreen.partGap == 24)
        // The content 20 from a phone's edges.
        #expect(ListBands.contentInset == 20)
    }

    // MARK: The press

    @Test func thePressWaits80msAndAScrollTakesItBack() {
        var press = BandPress()
        // Held: nothing for the first 80 ms, then the band.
        let down1 = press.down(scrolling: false)
        #expect(down1)
        #expect(!press.showsWash)
        press.delayElapsed()
        #expect(press.showsWash)
        // The list takes the finger for a scroll: the band goes at once, and a late lift brings nothing back.
        press.scrolled()
        #expect(!press.showsWash)
        let up2 = press.up()
        #expect(!up2)
        #expect(!press.showsWash)

        // A finger that stops a glide presses nothing, even once the delay is over.
        var stopping = BandPress()
        let down3 = stopping.down(scrolling: true)
        #expect(!down3)
        stopping.delayElapsed()
        #expect(!stopping.showsWash)

        // Held past the delay, then lifted: the band goes with the finger.
        var held = BandPress()
        _ = held.down(scrolling: false)
        held.delayElapsed()
        let up4 = held.up()
        #expect(!up4)
        #expect(!held.showsWash)
    }

    @Test func aQuickTapStillShowsItsBandOnceNoScrollCameOfIt() {
        var tap = BandPress()
        _ = tap.down(scrolling: false)
        // Lifted before 80 ms: once the list has had its word (no scroll), the band shows for as long.
        let up5 = tap.up()
        #expect(up5)
        #expect(!tap.showsWash)
        let confirm6 = tap.confirm()
        #expect(confirm6)
        #expect(tap.showsWash)
        tap.flashEnded()
        #expect(!tap.showsWash)

        // The list began to scroll as the press let go (SwiftUI's way of handing it the finger): no flash.
        var cancelled = BandPress()
        _ = cancelled.down(scrolling: false)
        let up7 = cancelled.up()
        #expect(up7)
        cancelled.scrolled()
        let confirm8 = cancelled.confirm()
        #expect(!confirm8)
        #expect(!cancelled.showsWash)
    }

    @Test func aFingerRestingOnTheListIsNoScroll() {
        // iOS enters .tracking the moment a finger touches the list: counted as scrolling, every row's press would
        // be taken back before it showed (and a quick tap's flash too). Only movement counts.
        let phases: [(ScrollPhase, Bool)] = [(.idle, false), (.tracking, false), (.interacting, true), (.decelerating, true),
                                             (.animating, true)]
        for (phase, moves) in phases { #expect(phase.moves == moves, "\(phase)") }
        // A finger down on a row while the list is only tracking it waits for its band, as on a list at rest.
        var press = BandPress()
        let down = press.down(scrolling: ScrollPhase.tracking.moves)
        #expect(down)
        press.delayElapsed()
        #expect(press.showsWash)
        // The same goes for the sticker grid: a finger resting on it holds no start back.
        var breathing = StickerBreathing(capacity: 1)
        let t = Date(timeIntervalSince1970: 1_800_000_000)
        breathing.shown("a", order: 0, now: t)
        breathing.scrolling = ScrollPhase.tracking.moves
        #expect(breathing.next(now: t) == "a")
        breathing.scrolling = ScrollPhase.interacting.moves
        #expect(breathing.next(now: t) == nil)
    }

    @Test func thePressIsStrongerThanAPointerAndRestIsNothing() {
        var press = BandPress()
        #expect(ListBands.alpha(press: press, hovered: false) == 0)
        #expect(ListBands.alpha(press: press, hovered: true) == 0.06)
        _ = press.down(scrolling: false)
        press.delayElapsed()
        #expect(ListBands.alpha(press: press, hovered: true) == 0.12)
        #expect(ListBands.alpha(press: press, hovered: false) == 0.12)
    }

    // MARK: The conversations list (phones only)

    @Test func onlyAPhonesConversationsAreBands() {
        let phone = ConversationsFrame.of(.compact)
        #expect(phone.bands)
        // Edge to edge, the content 20 in; the first row 4 under the bar's foot, its face (40, the row's 12 in) at 16.
        #expect(phone.leading == 0 && phone.trailing == 0 && phone.rowInset == 20)
        #expect(phone.top == 4 && phone.top + ListBands.rowPad == 16)
        // The invite atop: 20 from the edges, its pen line where the first face would stand.
        #expect(phone.inviteInset == 20 && phone.top + phone.inviteTop == 16)

        // An iPad (a medium window, two panes) and the Mac: as they were — the page's 16 / 18, the row's 14, 16
        // under the bar, the blob.
        for layout in [LayoutClass.medium, .expanded] {
            let wide = ConversationsFrame.of(layout)
            #expect(!wide.bands)
            #expect(wide.leading == 16 && wide.trailing == 18 && wide.rowInset == 14 && wide.top == 16)
            #expect(wide.inviteInset == 0 && wide.inviteTop == 4)
        }
        // An iPad in Slide Over is a compact window: a phone's.
        #expect(ConversationsFrame.of(LayoutClass.of(375)).bands)
        #expect(!ConversationsFrame.of(LayoutClass.of(744)).bands)
    }

    @Test func theConversationsCurvesAreTheirRowsKeys() {
        #expect(ConversationsFrame.key(conversation: "alice_bob") == "c:alice_bob")
        #expect(ConversationsFrame.key(starter: "carol") == "s:carol")
        // The last conversation's band ends on the starters' label when there are starters.
        #expect(ListBands.below(["c:1", "c:2"], after: ConversationsFrame.startersKey) == ["c:2", "starters"])
    }
}
