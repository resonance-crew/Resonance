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

/// Row 2 as the web draws it (round 26, the screens' review: iOS's faces stood 3 in, 收藏 in the story's text ink with
/// its glyph on the capsule's edge): a face 12 in from the row's start (the faces' line 6, their button 6), 收藏 a bare
/// glyph of 20 in the muted text ink with the one pen (INK), filled in that ink once saved, centred in a 44 flush with
/// the row's end, so its glyph ends 12 in — Android's EndRowTwoTest measures the same.
@MainActor @Suite(.serialized) struct RowTwoTests {
    @Test func theBookmarkIsTheWebsBareGlyphInTheMutedInk() throws {
        for saved in [false, true] {
            // A finger's 44, flush with the row's end: it no longer hangs 12 past it.
            let size = UIHostingController(rootView: RowTwoBookmark(saved: saved) {}).sizeThatFits(in: CGSize(width: 400, height: 400))
            #expect(abs(size.width - RowTwo.touch) < 0.5 && abs(size.height - RowTwo.touch) < 0.5, "\(size)")
            let drawn = try DrawnPixels(RowTwoBookmark(saved: saved) {}.background(Tokens.cream))
            let web = try DrawnPixels(OrganicIcon(.bookmark, size: 20, color: Tokens.textMuted, strokeWidth: Tokens.ink,
                                                  fill: saved ? Tokens.textMuted : nil)
                .frame(width: 44, height: 44).background(Tokens.cream))
            let difference = try #require(drawn.difference(web), "drawn \(drawn.width) × \(drawn.height)")
            #expect(difference <= 8, "saved \(saved): \(difference)")
            // What it drew before — the story's text ink, the strong pen once saved — is told apart.
            let before = try DrawnPixels(OrganicIcon(.bookmark, size: 20, color: Tokens.text,
                                                     strokeWidth: saved ? Tokens.inkStrong : Tokens.ink, fill: saved ? Tokens.text : nil)
                .frame(width: 44, height: 44).background(Tokens.cream))
            #expect((drawn.difference(before) ?? .max) > 24, "saved \(saved)")
        }
    }

    @Test func aFaceStandsTwelveInAndTheBookmarksGlyphEndsTwelveIn() throws {
        #expect(RowTwo.faceInset == 12 && RowTwo.glyphEnd == 12)
        let width: CGFloat = 300
        let row = EndRowTwo {
            TapFaces(faces: [Fixture.author("dora")], more: false, spoken: "", isButton: true) {}
        } end: {
            RowTwoBookmark(saved: false) {}
        }
        let drawn = try DrawnPixels(row.frame(width: width).background(Tokens.cream))
        #expect(drawn.width == Int(width * 2) && drawn.height == Int(TapFaces.rowHeight * 2), "\(drawn.width) × \(drawn.height)")
        let paper = try DrawnPixels(Color.clear.frame(width: 4, height: 4).background(Tokens.cream)).rgb(2, 2)
        // Anything off the paper: the face (its pad is the paper itself) on the left half, 收藏's ink on the right.
        var first: Int?, last: Int?
        for y in 0 ..< drawn.height {
            for x in 0 ..< drawn.width {
                let off = zip(drawn.rgb(x, y), paper).reduce(0) { $0 + abs($1.0 - $1.1) }
                guard off > 30 else { continue }
                if x < drawn.width / 2 { first = min(first ?? x, x) } else { last = max(last ?? x, x) }
            }
        }
        let faceStart = CGFloat(try #require(first)) / 2
        let inkEnd = width - CGFloat(try #require(last) + 1) / 2
        // The face's rim (its pen half outside the shape) at 12; it stood at 3.
        #expect(faceStart >= RowTwo.faceInset - 1.5 && faceStart <= RowTwo.faceInset + 1, "\(faceStart)")
        // The glyph's 20 box ends 12 in, its ink a little inside it (the web's about 16 in); it stood on the edge.
        #expect(inkEnd >= RowTwo.glyphEnd && inkEnd <= RowTwo.glyphEnd + 8, "\(inkEnd)")
    }
}

/// A view drawn at 2×, as RGBA bytes, rows top down — for the drawings the twins must match.
struct DrawnPixels {
    let bytes: [UInt8]
    let width: Int
    let height: Int

    @MainActor init(_ view: some View, scale: CGFloat = 2) throws {
        let renderer = ImageRenderer(content: view.environment(\.colorScheme, .light))
        renderer.scale = scale
        let image = try #require(renderer.cgImage)
        width = image.width
        height = image.height
        var bytes = [UInt8](repeating: 0, count: width * height * 4)
        let context = try #require(CGContext(data: &bytes, width: width, height: height, bitsPerComponent: 8, bytesPerRow: width * 4,
                                             space: CGColorSpaceCreateDeviceRGB(),
                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: 0, y: 0, width: width, height: height))
        self.bytes = bytes
    }

    func rgb(_ x: Int, _ y: Int) -> [Int] {
        let i = (y * width + x) * 4
        return [Int(bytes[i]), Int(bytes[i + 1]), Int(bytes[i + 2])]
    }

    /// The largest difference of any channel at any pixel from `other`; nil when they are not the same size.
    func difference(_ other: DrawnPixels) -> Int? {
        guard width == other.width, height == other.height else { return nil }
        var most = 0
        for i in stride(from: 0, to: bytes.count, by: 4) {
            for c in 0 ..< 3 { most = max(most, abs(Int(bytes[i + c]) - Int(other.bytes[i + c]))) }
        }
        return most
    }
}
