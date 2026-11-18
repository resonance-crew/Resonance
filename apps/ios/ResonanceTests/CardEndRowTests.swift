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
        let zh = EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .answer)
        #expect(zh.map(\.tap) == [L10n.Card.Tap.label, L10n.Card.Tap.label])
        #expect(zh.first?.note == L10n.Card.Note.entryShort)
        #expect(zh.first?.reply == L10n.Card.Reply.label)
        // Narrow: 寫卡片 for the last; never the link glyph's 連結.
        #expect(zh.last?.reply == L10n.Card.Reply.short)
        #expect(zh.last?.note == L10n.Card.Note.short)
        // English is always the short set (Resonate · Note · Card).
        let en = EndRowLabels.candidates(language: .en, tapOn: false, reply: .answer)
        #expect(en.count == 1)
        #expect(en.first?.reply == L10n.Card.Reply.short)
    }

    @Test func theReplySegmentSaysWhatAnswersTheCardAlready() {
        let draft = EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .draft)
        #expect(draft.allSatisfy { $0.reply == L10n.Card.modify })
        let published = EndRowLabels.candidates(language: .zhTW, tapOn: true, reply: .published)
        #expect(published.allSatisfy { $0.reply == L10n.Card.Reply.done && $0.tap == L10n.Card.Tap.on })
    }

    /// The zh words fit a 390 phone's column on one line (§U1.3: about 315 of 350).
    @Test func theChineseWordsFitAPhonesColumn() {
        let words = EndRowLabels.candidates(language: .zhTW, tapOn: false, reply: .answer)[0]
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
}
