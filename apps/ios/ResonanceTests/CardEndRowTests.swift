import DesignSystem
import Foundation
import ResonanceAPI
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

extension Fixture {
    /// A person as the contract draws them.
    static func author(_ id: String, handle: String? = nil) -> Author {
        Author(id: id, handle: handle ?? id, initials: String(id.prefix(2)).uppercased(), accentColor: "oklch(90% 0.05 60)",
               avatarUrl: nil, avatarSeed: "7", verified: false, region: nil)
    }

    /// `CardDetail.tap` as the server answers it.
    static func tap(mine: Bool = false, faces: [String] = [], more: Bool = false, mayNote: Bool = true) -> CardTap {
        CardTap(mine: mine, faces: faces.map { author($0) }, more: more, mayNote: mayNote)
    }

    /// A card page with its tap.
    static func detail(_ card: FeedCard, tap: CardTap?, isOwner: Bool = false) -> CardDetail {
        var detail = Fixture.detail(card, isOwner: isOwner)
        detail.tap = tap.map { .init(value1: $0) }
        return detail
    }
}

/// The end of someone else's story (round 26 §U1): the three kinds of feedback in one capsule — 共振 · 寄小紙條 · 用卡片回應
/// — every one tonal at rest; the tap a switch that fills once on and flips back when the server says no; row 2
/// under it, always 44 tall, so the reader's face comes in without moving the page.
@MainActor @Suite(.serialized) struct CardEndRowTests {
    @Test func theCapsuleSaysTheThreeKindsOfFeedbackShorterWhenItMust() {
        let zh = EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .answer, column: 350)
        #expect(zh.map(\.tap) == [L10n.Card.Tap.label, L10n.Card.Tap.label])
        #expect(zh.first?.note == L10n.Card.Note.entryShort)
        #expect(zh.first?.reply == L10n.Card.Reply.label)
        // Narrow: 寫卡片 for the last; never the link glyph's 連結.
        #expect(zh.last?.reply == L10n.Card.Reply.short)
        #expect(zh.last?.note == L10n.Card.Note.short)
        // English is always the short set (Resonate · Note · Card).
        let en = EndRowLabels.candidates(language: .en, tapOn: false, reply: .answer, column: 600)
        #expect(en.count == 1)
        #expect(en.first?.reply == L10n.Card.Reply.short)
    }

    /// A column of 340 or less (an iPhone SE's or mini's 335) starts from the short words, whether the full ones fit or
    /// not — 共振 · 寄小紙條 · 寫卡片, as the web's NARROW_ROW and Android's EndRowLayout.NARROW; wider, the full words first.
    @Test func aNarrowColumnTakesTheShortWords() {
        let short = EndRowLabels.Words(tap: L10n.Card.Tap.label, note: L10n.Card.Note.short, reply: L10n.Card.Reply.short)
        let full = EndRowLabels.Words(tap: L10n.Card.Tap.label, note: L10n.Card.Note.entryShort, reply: L10n.Card.Reply.label)
        #expect(EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .answer, column: 335) == [short])
        #expect(EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .answer, column: 340) == [short])
        #expect(EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .answer, column: 341) == [full, short])
        // Not measured yet: the full words first, as the web's room 0.
        #expect(EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .answer, column: 0) == [full, short])
        // A draft's 修改 stays whatever the width.
        #expect(EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .draft, column: 335).map(\.reply) == [L10n.Card.modify])
    }

    @Test func theReplySegmentSaysWhatAnswersTheCardAlready() {
        let draft = EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .draft, column: 350)
        #expect(draft.allSatisfy { $0.reply == L10n.Card.modify })
        let published = EndRowLabels.candidates(language: .zhTW, tapOn: true, reply: .published, column: 350)
        #expect(published.allSatisfy { $0.reply == L10n.Card.Reply.done && $0.tap == L10n.Card.Tap.on })
    }

    /// The zh words fit a 390 phone's column on one line (§U1.3: about 315 of 350).
    @Test func theChineseWordsFitAPhonesColumn() {
        let words = EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .answer, column: 350)[0]
        let bar = SegmentedActionBar([
            SegmentSpec(id: "tap", icon: .wave, label: words.tap) {},
            SegmentSpec(id: "note", icon: .note, label: words.note) {},
            SegmentSpec(id: "reply", icon: .cards, label: words.reply) {},
        ])
        let ideal = UIHostingController(rootView: bar.fixedSize()).sizeThatFits(in: CGSize(width: 2000, height: 200))
        #expect(ideal.width <= 350, "\(ideal.width)")
        #expect(ideal.height >= 44)
    }

    @Test func theTapFlipsAtOnceAndTheReadersFaceComesInFirst() {
        let me = Fixture.author("alice")
        var tap = TapState(Fixture.tap(faces: ["dora", "eli"]))
        #expect(!tap.on && tap.mayNote)
        let turningOn = tap.flip(viewer: me)
        #expect(turningOn && tap.on && tap.working)
        #expect(tap.faces.map(\.id) == ["alice", "dora", "eli"])
        tap.settled(turningOn: true, result: true, viewer: me)
        #expect(tap.on && !tap.working)
        // Taken back: the face goes, no one is told.
        _ = tap.flip(viewer: me)
        tap.settled(turningOn: false, result: false, viewer: me)
        #expect(!tap.on && tap.faces.map(\.id) == ["dora", "eli"])
    }

    @Test func aFailedTapGoesBackAsItWas() {
        let me = Fixture.author("alice")
        var tap = TapState(Fixture.tap(faces: ["dora"]))
        _ = tap.flip(viewer: me)
        tap.settled(turningOn: true, result: nil, viewer: me)
        #expect(!tap.on && !tap.working)
        #expect(tap.faces.map(\.id) == ["dora"])
    }

    @Test func aCardWithoutTheTapStillDrawsTheRow() {
        // An older answer (no `tap`): nothing tapped, a note may be written.
        let tap = TapState(nil)
        #expect(!tap.on && tap.faces.isEmpty && !tap.showsMore && tap.mayNote)
    }

    /// Row 2 is always there (faces or none), so tapping never moves the page; the capsule alone carries the puppets'
    /// mark — the faces' row and the field never move their ground.
    @Test func rowTwoKeepsItsHeightFacesOrNone() {
        #expect(TapFaces.rowHeight == 44)
        let empty = UIHostingController(rootView: TapFaces(faces: [], more: false, spoken: "", isButton: false) {}.fixedSize())
            .sizeThatFits(in: CGSize(width: 400, height: 400))
        let three = UIHostingController(rootView: TapFaces(faces: ["a", "b", "c"].map { Fixture.author($0) }, more: true,
                                                           spoken: "", isButton: true) {}.fixedSize())
            .sizeThatFits(in: CGSize(width: 400, height: 400))
        #expect(abs(empty.height - 44) < 0.5)
        #expect(abs(three.height - 44) < 0.5)
    }

    /// A window too narrow for one line splits the capsule: its second line (寄小紙條 · 寫卡片) wears the web's and
    /// Android's seed, so the same state has the same wobble on every platform.
    @Test func theCapsulesSecondLineWearsTheWebsSeed() {
        #expect(CardEndRow.secondLineSeed == 73)
    }

    /// SETTLED "the note, in place" 2: the open field (or the wait line in its place) adds nothing under itself, so the
    /// next section sits the page's 40 below it, as on the web and Android — 12 more made it 52.
    @Test func theNoteBlockAddsNothingUnderItself() {
        let page = VStack(alignment: .leading, spacing: 0) {
            Color.black.frame(width: 200, height: 100).noteScrollTarget(CardEndRow.noteBlock)
            Color.black.frame(width: 200, height: 1).padding(.top, NoteInPlace.gapBelow)
        }
        let size = UIHostingController(rootView: page.fixedSize()).sizeThatFits(in: CGSize(width: 400, height: 1000))
        #expect(abs(size.height - (100 + NoteInPlace.gapBelow + 1)) < 0.5, "\(size)")
    }

    /// … and its focus still brings it to rest 12 over the keyboard: what the page scrolls to reaches 12 under the block.
    @Test func theFocusStillBringsTheBlockTwelveOverTheKeyboard() async throws {
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 400)
        let probe = NoteScrollProbe()
        let host = UIHostingController(rootView: NoteScrollProbe.Page(probe: probe))
        host.safeAreaRegions = []
        window.rootViewController = host
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        #expect(await eventually { probe.proxy != nil && probe.viewport.height > 0 && probe.block.height > 0 })
        probe.proxy?.scrollTo(CardEndRow.noteBlock, anchor: .bottom)
        let rests = await eventually { abs(probe.block.maxY - (probe.viewport.maxY - NoteInPlace.keyboardGap)) < 1 }
        #expect(rests, "block \(probe.block) in \(probe.viewport)")
    }
}

/// A page with the note's block far down it, and where the block and the page's visible area are once scrolled.
@MainActor private final class NoteScrollProbe {
    var proxy: ScrollViewProxy?
    var block: CGRect = .zero
    var viewport: CGRect = .zero

    struct Page: View {
        let probe: NoteScrollProbe

        var body: some View {
            ScrollViewReader { proxy in
                ScrollView {
                    VStack(spacing: 0) {
                        Color.clear.frame(height: 1000)
                        Color.black.frame(height: 100)
                            .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { probe.block = $0 }
                            .noteScrollTarget(CardEndRow.noteBlock)
                        Color.clear.frame(height: 1000)
                    }
                }
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { probe.viewport = $0 }
                .onAppear { probe.proxy = proxy }
            }
        }
    }
}
