import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// Round 23 (iOS, iPad, the Mac): what rides with a message rides inside the composer's capsule — its numbers, Send's
/// block, ⤢'s place, the grown text counting the rows, the capsule's foot holding still — a held message read again as
/// it is delivered, and the sticker picker's one tap (the guard against the old second tap, 🕘 holding still, the cells
/// breathing a few at a time).
@MainActor @Suite struct RoundTwentyThreeTests {
    // MARK: §2 — the rows inside the capsule

    @Test func oneReplyMakesTheCapsule98AndEveryRideHasItsOwnNumber() {
        // Nothing riding: nothing over the text line, the capsule its 48.
        #expect(ComposerMetrics.ridingHeight(rows: 0, pictures: false) == 0)
        // A reply: 6 under the pen line, a row of 44, then the text line's 48 — 98 (the foot was 124 with the rows over it).
        #expect(ComposerMetrics.ridingHeight(rows: 1, pictures: false) + ComposerMetrics.height == 98)
        // Rows touch (nothing between them, nor between the last and the text line).
        #expect(ComposerMetrics.ridingHeight(rows: 2, pictures: false) == 94)
        // The picture strip: 8 + 56 + 8.
        #expect(ComposerMetrics.stripHeight() == 72)
        #expect(ComposerMetrics.ridingHeight(rows: 1, pictures: true) == 122)
        // The error line: as tall as its words, at least 32.
        #expect(ComposerMetrics.ridingHeight(rows: 0, pictures: false, error: 18) == 38)
        #expect(ComposerMetrics.ridingHeight(rows: 0, pictures: false, error: 40) == 46)
        // A short viewport (a phone on its side, the keyboard up): rows of one line of 36, thumbnails 44, three lines.
        #expect(ComposerMetrics.ridingHeight(rows: 1, pictures: true, short: true) == 102)
        #expect(ComposerMetrics.maxLines(short: true) == 3 && ComposerMetrics.maxLines(short: false) == 5)
    }

    @Test func theRowsRunInTheCapsulesThreeColumns() {
        // The lead column is ＋'s own, its mark at most 32 with 6 clear each side.
        #expect(ComposerMetrics.leadColumn == ComposerMetrics.attachWidth)
        #expect((ComposerMetrics.leadColumn - ComposerMetrics.leadMark) / 2 >= 6)
        // The reply's rule leaves 8 over and under it in its row.
        #expect(ComposerMetrics.rowHeight - 2 * ComposerMetrics.replyRuleInset == 28)
        // The ✕ (44) sits in Send's 52 column; a reply's media (36) fits its row with room.
        #expect(44 <= ComposerMetrics.sendWidth)
        #expect(ComposerMetrics.replyMedia < ComposerMetrics.rowHeight)
        // The strip keeps 8 from the pen line on each side, and a thumbnail's ✕ swings no further out than 6.
        #expect(ComposerMetrics.stripInset >= 8)
        #expect(PictureThumb.removeOut == 6 && PictureThumb.removeOut < ComposerMetrics.stripPad)
        // The Mac's 77 % would make 12 / 12.5 about 9 pt: 13 / 14 there.
        #expect(ComposerMetrics.rowLabelSize(mac: false) == 12 && ComposerMetrics.rowDetailSize(mac: false) == 12.5)
        #expect(ComposerMetrics.rowLabelSize(mac: true) == 13 && ComposerMetrics.rowDetailSize(mac: true) == 14)
    }

    @Test func anythingRidingSendsFromTheCornerBlock() {
        // One line, nothing riding: the full-height segment.
        #expect(!ThreadComposer.sendsFromBlock(lines: 1, expanded: false, riding: false))
        // A reply, a note, a card or pictures riding with one line: the 52 × 48 block at the foot corner — a capsule made
        // taller by its rows never paints a tall send strip.
        #expect(ThreadComposer.sendsFromBlock(lines: 1, expanded: false, riding: true))
        #expect(ThreadComposer.sendsFromBlock(lines: 2, expanded: false, riding: false))
        #expect(ThreadComposer.sendsFromBlock(lines: 1, expanded: true, riding: false))
    }

    @Test func expandStandsAtTheTopOfTheTextAreaUnderWhatRides() {
        // Nothing riding: the capsule's top-right, 4 under its pen line, as before.
        #expect(ComposerMetrics.cornerTop(riding: 0) == ComposerMetrics.cornerInset)
        // A reply riding: under its row — never on the row's ✕ in the same column.
        let riding = ComposerMetrics.ridingHeight(rows: 1, pictures: false)
        let removeFoot = riding - (ComposerMetrics.rowHeight - 44) / 2
        #expect(ComposerMetrics.cornerTop(riding: riding) >= removeFoot)
        // At three lines (when ⤢ comes) it and the block share the column without meeting.
        let three = ComposerTextView.height(lines: 3, metrics: ComposerText.at(scale: 1)) + 2 * ComposerText.at(scale: 1).padding
        #expect(ComposerMetrics.cornerInset + ComposerMetrics.cornerSide <= three - ComposerMetrics.height + 0.5)
    }

    @Test func theGrownTextLeavesRoomForWhatRidesAndTheCapCountsIt() {
        let least: CGFloat = 148
        // Grown to 200 under its top on a phone: the text is the capsule less the rows and its padding.
        #expect(ComposerGrowth.textHeight(bottom: 700, top: 300, riding: 0, threadTop: 100, wide: false, padding: 12, least: least) == 376)
        #expect(ComposerGrowth.textHeight(bottom: 700, top: 300, riding: 50, threadTop: 100, wide: false, padding: 12, least: least) == 326)
        // A wide pane: the whole capsule — rows included — at most 60 % of the thread under its header.
        let wide = ComposerGrowth.textHeight(bottom: 700, top: 120, riding: 50, threadTop: 100, wide: true, padding: 12, least: least)
        #expect(wide + 50 + 24 == (700 - 100) * ComposerMetrics.expandedPaneShare)
        // Never shorter than five lines.
        #expect(ComposerGrowth.textHeight(bottom: 700, top: 650, riding: 50, threadTop: 100, wide: false, padding: 12, least: least) == least)
    }

    @Test func theCapsulesFootHoldsStillAsRowsComeAndGo() {
        let w: Double = 362, r = Double(ComposerMetrics.radius)
        func outline(_ h: Double, steady: Bool) -> [PathCommand] {
            steady
                ? wobRect(w, h, min(r, h / 2), seed: 17, mag: ComposerMetrics.steadyMag, options: ComposerCapsuleShape.steadyOptions(width: CGFloat(w)))
                : wobRect(w, h, min(r, h / 2), seed: 17, mag: autoMag(w, h),
                          options: WobRectOptions(curve: autoCurve(w, h), segmentsH: .count(Double(autoSegments(w))),
                                                  segmentsV: .count(Double(autoSegments(h)))))
        }
        func points(_ c: PathCommand) -> [(Double, Double)] {
            switch c {
            case let .move(x, y), let .line(x, y): [(x, y)]
            case let .cubic(x1, y1, x2, y2, x, y): [(x1, y1), (x2, y2), (x, y)]
            case let .quad(x1, y1, x, y): [(x1, y1), (x, y)]
            case .close: []
            }
        }
        // One line: exactly today's capsule (the same wobRect, the same draws).
        for (a, b) in zip(outline(48, steady: true), outline(48, steady: false)) {
            for (p, q) in zip(points(a), points(b)) { #expect(abs(p.0 - q.0) < 1e-9 && abs(p.1 - q.1) < 1e-9) }
        }
        // A reply comes (48 → 98) or more: the foot corners and edge are where they were (moved down by the growth only,
        // as the capsule grows up from its foot), and the top edge keeps its shape.
        let segH = autoSegments(w)
        let rest = outline(48, steady: true)
        for h in [98.0, 170, 260] {
            let tall = outline(h, steady: true)
            #expect(tall.count == rest.count)
            let footFrom = 5 + segH, footTo = 6 + 2 * segH
            for i in footFrom...footTo {
                for (p, q) in zip(points(tall[i]), points(rest[i])) {
                    #expect(abs(p.0 - q.0) < 1e-9 && abs(p.1 - (q.1 + h - 48)) < 1e-9, "foot command \(i) at \(h)")
                }
            }
            for i in 1...(1 + segH) {
                for (p, q) in zip(points(tall[i]), points(rest[i])) { #expect(abs(p.0 - q.0) < 1e-9 && abs(p.1 - q.1) < 1e-9) }
            }
        }
    }

    @Test func aReplyRowDrawsThePictureOfTheQuoteItShowsNow() {
        // The row read p1 for the first picture reply; the same row now answers p2 (its view kept): p1 is not drawn.
        let first = UIImage(), second = UIImage()
        let loaded = ReplyPicture(id: "p1", image: first)
        #expect(ReplyPicture.shown(loaded, for: "p2", cached: nil) == nil)
        #expect(ReplyPicture.shown(loaded, for: "p2", cached: second) === second)
        // Its own picture, read or kept by the thread.
        #expect(ReplyPicture.shown(loaded, for: "p1", cached: nil) === first)
        #expect(ReplyPicture.shown(nil, for: "p2", cached: second) === second)
    }

    @Test func aReplyRowShowsACardsCoverOnlyAsItsBubbleWould() throws {
        let card = { (id: String, visibility: String) -> FeedCard in
            let json = """
            {"id":"\(id)","slug":null,"title":"Card \(id)","excerpt":"…","tags":[],"publishedAt":"2026-09-01T08:00:00.000Z",
             "author":{"id":"alice","handle":"alice","initials":"AL","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,
             "avatarSeed":"42","verified":false,"region":"TW"},
             "anonymous":false,"visibility":"\(visibility)","imageUrl":"https://img.resonance.channel/covers/\(id).webp",
             "imageLabel":null,"accentHue":null,"readMinutes":3,"referenceCardId":null,"reason":null}
            """
            return try! JSONDecoder().decode(FeedCard.self, from: Data(json.utf8))
        }
        let kept = card("kept", "private"), open = card("open", "public")
        let at = Date(timeIntervalSince1970: 1_000_000)
        let quote = ReplyQuote(id: "m1", senderId: "alice", text: "", cardRef: "kept")
        func original(privateShare: Bool) -> ChatMessage {
            ChatMessage(id: "m1", senderId: "alice", text: "", sentAt: at, cardRef: "kept", privateShare: privateShare)
        }
        // Alice's 私人卡, still shared with bob by the message he answers: its cover.
        #expect(ThreadModel.quotedCard(.found(kept), quote: quote, original: original(privateShare: true), viewer: "bob") == kept)
        // She stopped sharing it (or the message is from before passes): no cover, whatever was read of it before.
        #expect(ThreadModel.quotedCard(.found(kept), quote: quote, original: original(privateShare: false), viewer: "bob") == nil)
        // The answered message isn't held (a draft's reply to an older one): nothing vouches for the pass.
        #expect(ThreadModel.quotedCard(.found(kept), quote: quote, original: nil, viewer: "bob") == nil)
        // Her own card to alice, and any card readers have, as looked up; nothing while it is read or hidden.
        #expect(ThreadModel.quotedCard(.found(kept), quote: quote, original: nil, viewer: "alice") == kept)
        let openQuote = ReplyQuote(id: "m2", senderId: "alice", text: "", cardRef: "open")
        #expect(ThreadModel.quotedCard(.found(open), quote: openQuote, original: nil, viewer: "bob") == open)
        #expect(ThreadModel.quotedCard(.loading, quote: quote, original: original(privateShare: true), viewer: "bob") == nil)
        #expect(ThreadModel.quotedCard(.hidden, quote: quote, original: original(privateShare: true), viewer: "bob") == nil)
    }

    // MARK: §1 — a held message read again as it is delivered

    @Test func aStickerHeldWhileOnItsWayFillsItsMenuInOnceDelivered() {
        let t = Date()
        let sending = ChatMessage(id: "c1", senderId: "me", text: "〔貼圖：謝謝〕", sentAt: t, sticker: StickerRef(pack: "twine", id: "thanks"),
                                  delivery: .sending, key: "c1")
        let delivered = ChatMessage(id: "server-1", senderId: "me", text: "〔貼圖：謝謝〕", sentAt: t,
                                    sticker: StickerRef(pack: "twine", id: "thanks"), delivery: .delivered, key: "c1")
        let held = MessageMenu(row: ThreadRow(message: sending, position: .single, dayLabel: false, timeLabel: false),
                               frame: CGRect(x: 0, y: 0, width: 128, height: 128), link: nil)
        // Held in its first second (傳送中): nothing to offer yet.
        #expect(!held.row.message.canUnsend(viewer: "me") && !held.row.message.canReply && !held.row.message.canReact)
        // The thread now holds it delivered under the same key: the menu reads it again — 回覆, 收回 and the tray.
        let now = held.live { $0 == "c1" ? delivered : nil }
        #expect(now.row.message == delivered && now.frame == held.frame)
        #expect(now.row.message.canUnsend(viewer: "me") && now.row.message.canReply && now.row.message.canReact)
        let rows = MessageMenu.rows(link: false, onLink: false, reply: now.row.message.canReply, copy: MessageMenu.copies(now.row.message),
                                    unsend: now.row.message.canUnsend(viewer: "me"), report: false, failed: false)
        #expect(rows == [.reply, .unsend])
        // A message the thread no longer knows keeps the row it was held as.
        #expect(held.live { _ in nil }.row.message == sending)
    }

    @Test func aStickerNeverOffersCopyButWordsDo() {
        let t = Date()
        #expect(!MessageMenu.copies(ChatMessage(id: "s", senderId: "bob", text: "〔貼圖：謝謝〕", sentAt: t, sticker: StickerRef(pack: "twine", id: "thanks"))))
        #expect(MessageMenu.copies(ChatMessage(id: "w", senderId: "bob", text: "嗨", sentAt: t)))
        #expect(!MessageMenu.copies(ChatMessage(id: "p", senderId: "bob", text: "", sentAt: t, image: ChatImage(id: "p", width: 1, height: 1))))
    }

    // MARK: §3 — the sticker picker

    @Test func aSecondTapOnTheSameStickerWithin600msGoesNowhere() {
        var guardian = StickerSendGuard()
        let thanks = StickerRef(pack: "twine", id: "thanks"), hi = StickerRef(pack: "pip", id: "hi")
        let t = Date(timeIntervalSince1970: 1_800_000_000)
        func tap(_ sticker: StickerRef, at seconds: TimeInterval) -> Bool { guardian.allows(sticker, now: t.addingTimeInterval(seconds)) }
        #expect(tap(thanks, at: 0))
        // The old habit's second tap.
        #expect(!tap(thanks, at: 0.3))
        // Another sticker goes at once, back to back.
        #expect(tap(hi, at: 0.35))
        // The same one again later is a new send.
        #expect(tap(hi, at: 0.35 + StickerSendGuard.window))
        #expect(tap(thanks, at: 2))
    }

    @Test func recentsHoldStillWhileAPickerIsOpen() throws {
        let library = StickerLibrary(defaults: try #require(UserDefaults(suiteName: "RoundTwentyThreeTests-\(UUID().uuidString)")))
        library.use(account: "alice")
        library.sent(StickerRef(pack: "pip", id: "hi"))
        library.holdRecents()
        // Sent from the open picker: stored at once, but 🕘 doesn't reorder under the finger.
        library.sent(StickerRef(pack: "nod", id: "hug"))
        #expect(library.recents.map(\.id) == ["hug", "hi"])
        #expect(library.shownRecents.map(\.id) == ["hi"])
        // A second picker (the Mac's popover while the panel's view goes) keeps it held until both are closed.
        library.holdRecents()
        library.releaseRecents()
        #expect(library.shownRecents.map(\.id) == ["hi"])
        library.releaseRecents()
        // The next opening shows it.
        #expect(library.shownRecents.map(\.id) == ["hug", "hi"])
        library.releaseRecents()
        #expect(library.heldRecents == nil)
    }

    @Test func theCellsInViewBreatheAFewAtATimeInTheGridsOrder() {
        #expect(StickerBreathing.capacity(columns: 4) == 8 && StickerBreathing.capacity(columns: 6) == 12)
        var breathing = StickerBreathing(capacity: 2)
        let t = Date(timeIntervalSince1970: 1_800_000_000)
        #expect(breathing.next(now: t) == nil)
        for (i, key) in ["c", "a", "d", "b"].enumerated().reversed() { breathing.shown(key, order: [2, 0, 3, 1][i], now: t) }
        // Come into view together: row by row, a (0), then b (1).
        #expect(breathing.next(now: t) == "a")
        breathing.start("a")
        #expect(breathing.next(now: t) == "b")
        breathing.start("b")
        // Every slot taken.
        #expect(breathing.next(now: t) == nil)
        // a ends: it rests on its thumb, and c takes the slot; a comes round again once its rest is over.
        breathing.ended("a", now: t, rest: 2)
        #expect(breathing.next(now: t) == "c")
        breathing.start("c")
        breathing.ended("b", now: t, rest: 1.5)
        #expect(breathing.next(now: t.addingTimeInterval(1)) == "d")
        breathing.start("d")
        breathing.ended("d", now: t.addingTimeInterval(1), rest: 3)
        #expect(breathing.next(now: t.addingTimeInterval(1.6)) == "b")
        #expect(breathing.next(now: t.addingTimeInterval(1.4)) == nil)
        // Nothing new starts while the grid scrolls.
        breathing.scrolling = true
        #expect(breathing.next(now: t.addingTimeInterval(5)) == nil)
        breathing.scrolling = false
        // First come, first served: b has waited since 1.5, a since 2, d since 4 — b goes first, though a is above it.
        #expect(breathing.next(now: t.addingTimeInterval(5)) == "b")
        breathing.start("b")
        #expect(breathing.next(now: t.addingTimeInterval(5)) == nil)
        breathing.ended("c", now: t.addingTimeInterval(5), rest: 0)
        #expect(breathing.next(now: t.addingTimeInterval(5)) == "a")
        breathing.start("a")
        // Said again for a cell already in view, it keeps its place in the queue.
        breathing.ended("b", now: t.addingTimeInterval(5), rest: 0)
        breathing.shown("d", order: 3, now: t.addingTimeInterval(5))
        #expect(breathing.next(now: t.addingTimeInterval(5)) == "d")
        // A cell scrolled away stops and frees its slot; it waits afresh (at the back) when it comes back.
        breathing.hidden("c")
        #expect(!breathing.playing.contains("c") && breathing.waitingSince["c"] == nil)
        breathing.shown("c", order: 2, now: t.addingTimeInterval(6))
        #expect(breathing.waitingSince["c"] == t.addingTimeInterval(6))
        // An end said for a cell no longer playing changes nothing.
        let before = breathing
        breathing.ended("c", now: t, rest: 2)
        #expect(breathing == before)
    }

    @Test func aGrownPanelsCellsAllBreatheInTurn() throws {
        // A play (the file's two loops, the catalog's lengths: ~4.2–5.2 s) outlasts the longest rest (3 s): served in
        // the grid's order, a grown panel's first 2 × capacity cells would take every slot and the rest never play.
        let library = StickerLibrary(defaults: try #require(UserDefaults(suiteName: "RoundTwentyThreeTests-\(UUID().uuidString)")))
        let loops = library.catalog.packs.flatMap(\.stickers).compactMap(\.durationMs).map { 2 * Double($0) / 1000 }
        try #require(!loops.isEmpty)
        #expect(loops.allSatisfy { $0 > StickerBreathing.rest.upperBound })
        // A grown phone panel at the phone's cap, a grown tablet panel at the wide one.
        for (cells, capacity) in [(24, StickerBreathing.phoneCapacity), (36, StickerBreathing.wideCapacity)] {
            let plays = Self.breathe(cells: cells, capacity: capacity, loops: loops, for: 120)
            let counts = (0..<cells).map { plays[$0, default: 0] }
            #expect(counts.min()! >= 2, "\(cells) cells at \(capacity): \(counts)")
            #expect(Double(counts.max()!) <= 2 * Double(counts.min()!), "\(cells) cells at \(capacity): \(counts)")
        }
        // The first batch, in view together, still starts in the grid's order, a stagger apart.
        var first = StickerBreathing(capacity: StickerBreathing.phoneCapacity)
        let t = Date(timeIntervalSince1970: 1_800_000_000)
        for order in (0..<24).shuffled() { first.shown("s\(order)", order: order, now: t) }
        var started: [String] = []
        for step in 0..<StickerBreathing.phoneCapacity {
            let key = try #require(first.next(now: t.addingTimeInterval(Double(step) * StickerBreathing.stagger)))
            first.start(key)
            started.append(key)
        }
        #expect(started == (0..<StickerBreathing.phoneCapacity).map { "s\($0)" })
    }

    /// Plays per cell (by its place in the grid) over `seconds` of a fake clock ticking at the clock's stagger: every
    /// cell in view from the start, each play as long as its sticker's two loops, each rest 1.5–3 s (seeded).
    private static func breathe(cells: Int, capacity: Int, loops: [Double], for seconds: Double) -> [Int: Int] {
        var breathing = StickerBreathing(capacity: capacity)
        let t0 = Date(timeIntervalSince1970: 1_800_000_000)
        for order in 0..<cells { breathing.shown("\(order)", order: order, now: t0) }
        var seed: UInt64 = 0x2023_1109
        func rest() -> TimeInterval {
            seed = seed &* 6_364_136_223_846_793_005 &+ 1_442_695_040_888_963_407
            let unit = Double(seed >> 11) / Double(1 << 53)
            return StickerBreathing.rest.lowerBound + unit * (StickerBreathing.rest.upperBound - StickerBreathing.rest.lowerBound)
        }
        var ends: [Int: Date] = [:]
        var plays: [Int: Int] = [:]
        var now = t0
        while now < t0.addingTimeInterval(seconds) {
            for (order, end) in ends.sorted(by: { $0.key < $1.key }) where end <= now {
                breathing.ended("\(order)", now: end, rest: rest())
                ends[order] = nil
            }
            if let key = breathing.next(now: now), let order = Int(key) {
                breathing.start(key)
                plays[order, default: 0] += 1
                ends[order] = now.addingTimeInterval(loops[order % loops.count])
            }
            now = now.addingTimeInterval(StickerBreathing.stagger)
        }
        return plays
    }

    @Test func thePickersMeasuresAreOneRuleEverywhere() {
        // 8 from the edges, 4 between, the art 2 inside its cell: an iPhone 17 Pro's (402) four columns ≈ 93.5 each.
        let cell = (402 - 2 * StickerPanel.gridInset - 3 * StickerPanel.gap) / 4
        #expect(abs(cell - 93.5) < 0.01)
        #expect(cell - 2 * StickerPanel.cellInset == 89.5)
        #expect(StickerPanel.columns(width: 402) == 4 && StickerPanel.columns(width: 700) == 6)
        // The Mac's popover: 4 columns across 400 × 460.
        #expect(StickerPanel.popoverColumns == 4)
        #expect(MacComposerPopover<EmptyView>.size(.stickers) == CGSize(width: 400, height: 460))
    }
}
