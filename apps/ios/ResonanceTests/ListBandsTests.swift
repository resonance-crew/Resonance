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

    /// Round 24, part 4 (the owner on an iPad's notifications: 「左邊、右邊，它就要這個區塊就要切斷了」): a wide window's
    /// band is cut at its frame's sides — the reading column — its corners rounded; its curves keep every swing. A
    /// phone's runs on as it was.
    @Test func aWideWindowsBandIsCutAtTheColumnWithRoundedCorners() {
        let rect = CGRect(x: 0, y: 0, width: 720, height: 76)
        let open = BandShape(top: "a", bottom: "b").path(in: rect)
        let cut = BandShape(top: "a", bottom: "b", cut: true).path(in: rect)
        // Open: the band's corners are its own (the curves meet the ends flat), so a point just inside one is in it.
        #expect(open.contains(CGPoint(x: 1, y: 1.5)))
        // Cut: the corner is rounded away, the side and the middle stay.
        #expect(!cut.contains(CGPoint(x: 1, y: 1.5)))
        #expect(!cut.contains(CGPoint(x: 719, y: 74.5)))
        #expect(cut.contains(CGPoint(x: 1, y: 38)))
        #expect(cut.contains(CGPoint(x: 360, y: 38)))
        // Never past the column's sides, and every swing of the curves kept between the corners.
        let box = cut.boundingRect
        #expect(box.minX >= -0.01 && box.maxX <= 720.01)
        // A point on a curve itself (the intersection redraws it) may fall either way: the rows sampled stand off the frame's
        // own lines (0 and 76, where the open band's ends run flat), and a point within 0.3 of an edge is left out.
        var differ: [String] = []
        for i in 0...200 {
            let x = 40 + Double(i) * 3.2
            for y in stride(from: -2.9, through: 78.9, by: 0.5) where open.contains(CGPoint(x: x, y: y)) != cut.contains(CGPoint(x: x, y: y)) {
                let onEdge = open.contains(CGPoint(x: x, y: y - 0.3)) != open.contains(CGPoint(x: x, y: y + 0.3))
                if !onEdge { differ.append("(\(x), \(y))") }
            }
        }
        #expect(differ.isEmpty, "\(differ.count): \(differ.prefix(8))")
    }

    /// Round 24, part 4 (the owner on an iPad in a window: 「header 會被遮擋住」): only a phone's brand bar slides up under
    /// the status bar as its list is read down; an iPad's (or the Mac's) stays in a window narrow enough for a phone's
    /// layout, and a tablet's header never slides.
    @Test func onlyAPhonesBrandBarSlidesAway() {
        #expect(BrandBarTravel.of(topTabs: false, phone: true) == 48)
        #expect(BrandBarTravel.of(topTabs: false, phone: false) == 0)
        #expect(BrandBarTravel.of(topTabs: true, phone: false) == 0)
        #expect(BrandBarTravel.of(topTabs: true, phone: true) == 0)
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
        // The invite atop (round 24): a grey band under the bar's pen line, its words where the rows' content is and 20
        // under the bar's foot, the first row as far under its foot as under the bar's — on a phone, whoever runs it.
        #expect(phone.invite(onMac: false) == .band && phone.invite(onMac: true) == .band)
        #expect(phone.leading + phone.rowInset == 20 && phone.inviteGap(.band) == phone.top)
        #expect(phone.top + phone.inviteWordsTop == 20)

        // An iPad (a medium window, two panes) and the Mac: as they were — the page's 16 / 18, the row's 14, 16
        // under the bar, the blob.
        for layout in [LayoutClass.medium, .expanded] {
            let wide = ConversationsFrame.of(layout)
            #expect(!wide.bands)
            #expect(wide.leading == 16 && wide.trailing == 18 && wide.rowInset == 14 && wide.top == 16)
            // The invite (round 24, by the kind of device): an iPad's a borderless card in the rows' column, the first
            // row 12 under it; the Mac's a band, its words 20 under the header's foot and in the rows' column, the first
            // row as far under its foot as under the header's.
            #expect(wide.invite(onMac: false) == .card && wide.inviteGap(.card) == 12)
            #expect(wide.invite(onMac: true) == .band && wide.inviteGap(.band) == wide.top)
            #expect(wide.top + wide.inviteWordsTop == 20 && wide.leading + wide.rowInset == 30)
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

    /// Round 24 (the owner: 「這個線都應該要接在一起，底色要填滿」): the Mac list's invite band joined to the header's
    /// line — its grey laid from under the header's wave down over the band's top, whatever the list does.
    @MainActor @Test func theMacsBandReachesUpUnderTheHeader() {
        // The band's paper and its muted words on it: the thread's grey, the ink that clears 4.5:1 there.
        #expect(AsideBand.paper == Tokens.bubbleTheirs && AsideBand.muted == Tokens.linkCardMuted)
        // In a box laid as the rule's (its top 8 over the header's foot), the band 16 under the foot and 130 tall.
        let band = CGRect(x: 0, y: PaneLines.tuck + 16, width: Tokens.msgListW, height: 130)
        // At rest: from the box's top (under the wave) to a point over the band's top.
        #expect(PaneBand.listPaper(band: band) == 0..<(PaneLines.tuck + 17))
        // Pulled 40 down: the gap over it is grey too.
        #expect(PaneBand.listPaper(band: band.offsetBy(dx: 0, dy: 40)) == 0..<(PaneLines.tuck + 57))
        // Scrolled up under the header: down to the header's foot, while the band reaches it…
        #expect(PaneBand.listPaper(band: band.offsetBy(dx: 0, dy: -60)) == 0..<PaneLines.tuck)
        #expect(PaneBand.listPaper(band: band.offsetBy(dx: 0, dy: -150)) == 0..<(PaneLines.tuck - 4))
        // …and nothing once it has gone up past the box.
        #expect(PaneBand.listPaper(band: band.offsetBy(dx: 0, dy: -160)) == nil)
    }

    /// Round 24 review: the band's papers (the header's join, the gutter) are there exactly while the list draws the
    /// band — not while the band is on screen: a page pushed over the panes, or another tab, hides the band and brings
    /// it back with its geometry unchanged, so nothing places it again, and its place must still be there. They come
    /// and go with the band's own 0.2 s fade when the invite comes or goes, at once when the list shows or reads its rows.
    @MainActor @Test func theMacsBandKeepsItsPapersUntilTheListLetsItGo() {
        typealias Lists = PaneBand.ListState
        let reading = Lists(loaded: false, banded: false), bare = Lists(loaded: true, banded: false)
        let banded = Lists(loaded: true, banded: true)
        let at = CGRect(x: 0, y: PaneLines.tuck + 16, width: Tokens.msgListW, height: 130)

        // The list appears with its band: told first, then laid out…
        let band = PaneBand()
        band.listChanged(from: banded, to: banded)
        #expect(band.frame == nil)
        band.place(at, reach: PaneLines.gutter)
        #expect(band.frame == at && band.reach == PaneLines.gutter)
        // …or laid out first, then told.
        let early = PaneBand()
        early.place(at, reach: PaneLines.gutter)
        #expect(early.frame == nil)
        early.listChanged(from: banded, to: banded)
        #expect(early.frame == at && early.reach == PaneLines.gutter)

        // It scrolls; then a page is pushed over the panes and popped — the band says nothing, the list nothing new
        // (told again as it appears, it is as it was): the papers stay where the band last was.
        let scrolled = at.offsetBy(dx: 0, dy: -30)
        band.place(scrolled, reach: PaneLines.gutter)
        band.listChanged(from: banded, to: banded)
        #expect(band.frame == scrolled && band.reach == PaneLines.gutter)

        // The invite answered (不用了, 好，通知我): the papers go, and a word from the band fading out lays nothing.
        band.listChanged(from: banded, to: bare)
        #expect(band.frame == nil && band.reach == 0)
        band.place(scrolled, reach: PaneLines.gutter)
        #expect(band.frame == nil)
        // Offered again: the new band lays them where it is.
        band.listChanged(from: bare, to: banded)
        band.place(at, reach: PaneLines.gutter)
        #expect(band.frame == at)
        // The rows read again: gone with the band, and back with it once they are in.
        band.listChanged(from: banded, to: reading)
        #expect(band.frame == nil)
        band.listChanged(from: reading, to: banded)
        band.place(at, reach: PaneLines.gutter)
        #expect(band.frame == at)

        // The band's fade when the invite comes or goes; none as the list first shows, or as its rows come and go.
        #expect(PaneBand.arrival(from: bare, to: banded) == PaneBand.fade)
        #expect(PaneBand.arrival(from: banded, to: bare) == PaneBand.fade)
        #expect(PaneBand.arrival(from: banded, to: banded) == nil)
        #expect(PaneBand.arrival(from: reading, to: banded) == nil)
        #expect(PaneBand.arrival(from: banded, to: reading) == nil)
    }
}
