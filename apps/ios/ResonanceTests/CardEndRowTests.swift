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
/// — every one tonal at rest; the tap a switch that fills once on and flips back when the server says no; the faces'
/// line over it (round 30), always 44 tall, so the reader's face comes in without moving the capsule.
@MainActor @Suite(.serialized) struct CardEndRowTests {
    @Test func theCapsuleSaysTheThreeKindsOfFeedbackShorterWhenItMust() {
        let zh = EndRowLabels.candidates(language: .zhTW, reply: .answer, column: 350)
        #expect(zh.map(\.tap) == [L10n.Card.Tap.label, L10n.Card.Tap.label])
        #expect(zh.first?.note == L10n.Card.Note.entryShort)
        #expect(zh.first?.reply == L10n.Card.Reply.label)
        // Narrow: 寫卡片 for the last; never the link glyph's 連結.
        #expect(zh.last?.reply == L10n.Card.Reply.short)
        #expect(zh.last?.note == L10n.Card.Note.short)
        // English is always the short set (Resonate · Note · Card).
        let en = EndRowLabels.candidates(language: .en, reply: .answer, column: 600)
        #expect(en.count == 1)
        #expect(en.first?.reply == L10n.Card.Reply.short)
    }

    /// A column of 340 or less (an iPhone SE's or mini's 335) starts from the short words, whether the full ones fit or
    /// not — 共振 · 寄小紙條 · 寫卡片, as the web's NARROW_ROW and Android's EndRowLayout.NARROW; wider, the full words first.
    @Test func aNarrowColumnTakesTheShortWords() {
        let short = EndRowLabels.Words(tap: L10n.Card.Tap.label, note: L10n.Card.Note.short, reply: L10n.Card.Reply.short)
        let full = EndRowLabels.Words(tap: L10n.Card.Tap.label, note: L10n.Card.Note.entryShort, reply: L10n.Card.Reply.label)
        #expect(EndRowLabels.candidates(language: .zhTW, reply: .answer, column: 335) == [short])
        #expect(EndRowLabels.candidates(language: .zhTW, reply: .answer, column: 340) == [short])
        #expect(EndRowLabels.candidates(language: .zhTW, reply: .answer, column: 341) == [full, short])
        // Not measured yet: the full words first, as the web's room 0.
        #expect(EndRowLabels.candidates(language: .zhTW, reply: .answer, column: 0) == [full, short])
        // A draft's 修改 stays whatever the width.
        #expect(EndRowLabels.candidates(language: .zhTW, reply: .draft, column: 335).map(\.reply) == [L10n.Card.modify])
    }

    @Test func theReplySegmentSaysWhatAnswersTheCardAlready() {
        let draft = EndRowLabels.candidates(language: .zhTW, reply: .draft, column: 350)
        #expect(draft.allSatisfy { $0.reply == L10n.Card.modify })
        let published = EndRowLabels.candidates(language: .zhTW, reply: .published, column: 350)
        // The tap's words never change with it (the owner, 2026-11-20: 已共振 moved the wave beside it).
        #expect(published.allSatisfy { $0.reply == L10n.Card.Reply.done && $0.tap == L10n.Card.Tap.label })
    }

    /// The zh words fit a 390 phone's column on one line (§U1.3: about 315 of 350).
    @Test func theChineseWordsFitAPhonesColumn() {
        let words = EndRowLabels.candidates(language: .zhTW, reply: .answer, column: 350)[0]
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
        let empty = UIHostingController(rootView: TapFaces(faces: [], spoken: "", isButton: false) {}.fixedSize())
            .sizeThatFits(in: CGSize(width: 400, height: 400))
        let three = UIHostingController(rootView: TapFaces(faces: ["a", "b", "c"].map { Fixture.author($0) },
                                                           spoken: "", isButton: true) {}.fixedSize())
            .sizeThatFits(in: CGSize(width: 400, height: 400))
        #expect(abs(empty.height - 44) < 0.5)
        #expect(abs(three.height - 44) < 0.5)
    }

    /// Round 30 §S1: the faces' line stands with no face on it — the screen hands it an empty builder then — so the
    /// capsule under it never moves when the reader's own face arrives. Measured in the end row's own stack: there an
    /// empty view under a frame is nothing at all, and the line folded away on a card nobody had resonated with (the
    /// capsule 16 under the tags instead of 60 — the release screenshots' ios/card-note-wait showed it).
    @Test func theFacesLineStandsWithNoFaceOnItSoTheCapsuleNeverMoves() {
        func height(faces: Bool) -> CGFloat {
            UIHostingController(rootView: EndRowStack(facesLine: true) {
                EndRowTwo(facesCentre: nil, faceCount: faces ? 1 : 0) {
                    if faces { TapFaces(faces: [Fixture.author("dora")], spoken: "", isButton: true) {} }
                }
            } capsuleRow: {
                Color.blue.frame(width: 300, height: 44)
            } below: {
                EmptyView()
            }.frame(width: 300)).sizeThatFits(in: CGSize(width: 300, height: 400)).height
        }
        #expect(abs(height(faces: false) - (TapFaces.rowHeight + 44)) < 0.5, "\(height(faces: false))")
        #expect(abs(height(faces: true) - (TapFaces.rowHeight + 44)) < 0.5, "\(height(faces: true))")
    }

    /// Round 30 §S1 (the owner: 「把共振这个地方已经共振的这些使用者头像，把它移到共振按钮的上方」, 「照 C 做」): the faces' line
    /// stands directly on the capsule's row — 0 between them — and the note opens 12 under the capsule; signed out there
    /// is no faces' line and the capsule is the row's top.
    @Test func theFacesLineStandsDirectlyOverTheCapsuleAndTheNoteTwelveUnderIt() throws {
        func stack(facesLine: Bool) -> some View {
            EndRowStack(facesLine: facesLine) {
                EndRowTwo(facesCentre: nil, faceCount: 1) { Color(red: 1, green: 0, blue: 0).frame(width: 60, height: FaceStack.size) }
            } capsuleRow: {
                Color(red: 0, green: 0, blue: 1).frame(width: 300, height: 44)
            } below: {
                Color(red: 0, green: 1, blue: 0).frame(width: 300, height: 48).padding(.top, NoteInPlace.gapAbove)
            }
            .frame(width: 360)
            .background(Tokens.cream)
        }
        func rows(_ drawn: DrawnPixels, _ matches: ([Int]) -> Bool) -> ClosedRange<CGFloat>? {
            let ys = (0 ..< drawn.height).filter { y in (0 ..< drawn.width).contains { matches(drawn.rgb($0, y)) } }
            guard let first = ys.first, let last = ys.last else { return nil }
            return CGFloat(first) / 2 ... CGFloat(last + 1) / 2
        }
        let red = { (c: [Int]) in c[0] > 200 && c[1] < 60 && c[2] < 60 }
        let blue = { (c: [Int]) in c[2] > 200 && c[0] < 60 && c[1] < 60 }
        let green = { (c: [Int]) in c[1] > 200 && c[0] < 60 && c[2] < 60 }
        let signedIn = try DrawnPixels(stack(facesLine: true))
        let faces = try #require(rows(signedIn, red)), capsule = try #require(rows(signedIn, blue)),
            note = try #require(rows(signedIn, green))
        // The faces centred in their 44 line, the line's foot the capsule's top: tags → 16 → faces 28 centred → capsule.
        #expect(abs(faces.lowerBound - (TapFaces.rowHeight - FaceStack.size) / 2) < 0.5, "\(faces)")
        #expect(abs(capsule.lowerBound - TapFaces.rowHeight) < 0.5, "\(capsule)")
        #expect(abs(capsule.lowerBound - faces.upperBound - 8) < 0.5, "8 from the faces to the capsule: \(faces) \(capsule)")
        #expect(abs(note.lowerBound - capsule.upperBound - 12) < 0.5, "\(capsule) \(note)")
        // Signed out: no faces' line, the capsule at the top.
        let signedOut = try DrawnPixels(stack(facesLine: false))
        #expect(rows(signedOut, red) == nil)
        #expect(rows(signedOut, blue)?.lowerBound == 0)
        // The air: the faces' line 16 under the tags (or the story), the capsule 40 when signed out, 40 to what follows.
        #expect(EndRowAir.above(facesLine: true) == 16 && EndRowAir.above(facesLine: false) == 40 && EndRowAir.below == 40)
        // So with no face yet the capsule stands 16 + 44 = 60 under the tags; the end row starts 24 higher than it did.
        #expect(EndRowAir.above(facesLine: true) + TapFaces.rowHeight == 60)
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

    /// Row 2 is the faces' alone since round 28 (§S4): a face 12 in from its start, nothing at its end — 收藏 ends the
    /// capsule's row, or a phone's tags row (CardEndRowTests).
    @Test func aFaceStandsTwelveInAndNothingEndsTheRow() throws {
        #expect(RowTwo.faceInset == 12 && RowTwo.glyphEnd == 12)
        let width: CGFloat = 300
        // Before the capsule's 共振 is measured (its first frame): the line's 6 and the button's 6.
        let row = EndRowTwo(facesCentre: nil, faceCount: 1) {
            TapFaces(faces: [Fixture.author("dora")], spoken: "", isButton: true) {}
        }
        let drawn = try DrawnPixels(row.frame(width: width).background(Tokens.cream))
        #expect(drawn.width == Int(width * 2) && drawn.height == Int(TapFaces.rowHeight * 2), "\(drawn.width) × \(drawn.height)")
        let ink = try #require(drawn.inkBounds(paper: try DrawnPixels.paper()))
        let faceStart = CGFloat(ink.minX) / 2
        // The face's rim (its pen half outside the shape) at 12; it stood at 3.
        #expect(faceStart >= RowTwo.faceInset - 1.5 && faceStart <= RowTwo.faceInset + 1, "\(faceStart)")
        // Nothing on the row's right half: 收藏 no longer hangs under the capsule's corner.
        #expect(CGFloat(ink.maxX) / 2 < width / 2, "ink to \(CGFloat(ink.maxX) / 2)")
    }
}

/// Where 收藏 stands at a story's end (round 28; the owner: 「這收藏按鈕不應該放在這裡」): wide, at the end of the
/// capsule's row, its glyph on the column's edge as the byline's ⋯; on a phone, at the end of the tags' row.
extension CardEndRowTests {
    /// The width class decides the row: a phone (compact) stands it in the tags' row, every wider window (an iPad, the
    /// Mac at 77 %, a phone turned) beside the capsule — as the capsule spans the column or keeps its own width.
    @Test func aPhoneStandsTheBookmarkInTheTagsRowAndAWideWindowBesideTheCapsule() {
        #expect(EndRowPlacement.place(compact: true) == .tagsRow)
        #expect(EndRowPlacement.place(compact: false) == .capsuleRow)
        #expect(LayoutClass.of(402) == .compact && LayoutClass.of(744) != .compact)
        // Its box hangs its pad past the column, as the byline's glyphs do: 32 of the 44 in the column.
        #expect(EndRowPlacement.hang == 12 && EndRowPlacement.boxInColumn == 32 && EndRowPlacement.gap == 12)
    }

    /// The capsule's words are weighed in the room 收藏 leaves (the column less 12 and the box), while the ≤ 340 rule
    /// keeps reading the column itself.
    @Test func theCapsulesWordsAreWeighedInTheRoomTheBookmarkLeaves() throws {
        #expect(EndRowPlacement.capsuleRoom(column: 600) == 556)
        #expect(EndRowPlacement.capsuleRoom(column: 0) == nil, "not measured yet: the full words first")
        // A 380 column leaves 336 of room, but still says the full words first (the column is over 340).
        #expect(EndRowLabels.candidates(language: .zhTW, reply: .answer, column: 380).count == 2)
        // Drawn: words of 300 fit a 320 column but not its 276 of room, so the next set (200) stands beside 收藏.
        let column: CGFloat = 320
        let row = EndRowCapsuleRow(room: EndRowPlacement.capsuleRoom(column: column)) {
            ViewThatFits(in: .horizontal) {
                Color(red: 1, green: 0, blue: 0).frame(width: 300, height: 44)
                Color(red: 0, green: 0, blue: 1).frame(width: 200, height: 44)
            }
        } end: {
            RowTwoBookmark(saved: false) {}
        }
        let drawn = try DrawnPixels(row.frame(width: column).padding(.horizontal, 12).background(Tokens.cream))
        let red = drawn.count { $0[0] > 200 && $0[1] < 60 && $0[2] < 60 }
        let blue = drawn.count { $0[2] > 200 && $0[0] < 60 && $0[1] < 60 }
        #expect(red == 0 && blue > 0, "red \(red), blue \(blue)")
    }

    /// Wide: 收藏's glyph ends on the column's edge (its box's pad in the margin, as the byline's ⋯), vertically centred
    /// on the capsule, at least 12 from it.
    @Test func wideTheBookmarkEndsTheCapsulesRowOnTheBylinesEdge() throws {
        let column: CGFloat = 500, margin: CGFloat = 20
        let row = EndRowCapsuleRow(room: EndRowPlacement.capsuleRoom(column: column)) {
            Color.blue.frame(width: 360, height: 44)
        } end: {
            RowTwoBookmark(saved: false) {}
        }
        let drawn = try DrawnPixels(row.frame(width: column).padding(.horizontal, margin).background(Tokens.cream))
        let glyph = try #require(drawn.inkBounds(paper: try DrawnPixels.paper(), fromX: Int((margin + 360) * 2)))
        let inkEnd = margin + column - CGFloat(glyph.maxX + 1) / 2
        // The glyph's box ends on the column's edge, its ink a little inside it (as the ⋯'s dots).
        #expect(inkEnd >= 0 && inkEnd <= 6, "ink ends \(inkEnd) in from the column")
        let middle = CGFloat(glyph.minY + glyph.maxY + 1) / 4
        #expect(abs(middle - 22) <= 2, "glyph centred at \(middle)")
    }

    /// … and when the capsule takes two lines, 收藏 stands beside the first.
    @Test func aCapsuleInTwoLinesHasTheBookmarkBesideItsFirst() throws {
        let column: CGFloat = 400
        let row = EndRowCapsuleRow(room: EndRowPlacement.capsuleRoom(column: column)) {
            VStack(alignment: .leading, spacing: 8) {
                Color.blue.frame(width: 120, height: 44).alignmentGuide(.capsuleFirstLine) { $0[VerticalAlignment.center] }
                Color.blue.frame(width: 240, height: 44)
            }
        } end: {
            RowTwoBookmark(saved: false) {}
        }
        let drawn = try DrawnPixels(row.frame(width: column).background(Tokens.cream))
        #expect(drawn.height == 96 * 2, "\(drawn.height)")
        let glyph = try #require(drawn.inkBounds(paper: try DrawnPixels.paper(), fromX: 260 * 2))
        let middle = CGFloat(glyph.minY + glyph.maxY + 1) / 4
        #expect(abs(middle - 22) <= 2, "glyph centred at \(middle), not on the second line's 74")
    }

    /// A phone: the tags wrap in their own column (the content less 收藏 and 12), 收藏 centred on their first line and
    /// making the row no taller; with no tags, 收藏 alone ends the row, its box's height.
    @Test func aPhonesTagsWrapBesideTheBookmarkAndTheRowIsNoTaller() throws {
        let content: CGFloat = 335
        #expect(EndRowPlacement.tagsColumn(content: content) == 291)
        #expect(EndRowPlacement.tagsLineBleed(line: 22) == -11)
        func row(tags: Int) -> some View {
            EndRowTagsRow(hasTags: tags > 0) {
                FlowRow(spacing: 8) {
                    ForEach(0 ..< tags, id: \.self) { _ in Color.blue.frame(width: 100, height: 22).endRowTagLine() }
                }
            } end: {
                RowTwoBookmark(saved: false) {}
            }
            .frame(width: content)
        }
        func height(_ view: some View) -> CGFloat {
            UIHostingController(rootView: view).sizeThatFits(in: CGSize(width: content, height: 1000)).height
        }
        // Two tags: one line, as tall as a pill.
        #expect(abs(height(row(tags: 2)) - 22) < 0.5, "\(height(row(tags: 2)))")
        // Three fit 335 (316) but not the tags' 291: they wrap to a second line, 8 under the first.
        #expect(abs(height(row(tags: 3)) - 52) < 0.5, "\(height(row(tags: 3)))")
        // None: 收藏 alone, its 44.
        #expect(abs(height(row(tags: 0)) - RowTwo.touch) < 0.5, "\(height(row(tags: 0)))")
        // Drawn: 收藏's glyph centred on the first line, ending on the content's edge.
        let margin: CGFloat = 20
        let drawn = try DrawnPixels(row(tags: 2).padding(.horizontal, margin).padding(.vertical, 12).background(Tokens.cream))
        let glyph = try #require(drawn.inkBounds(paper: try DrawnPixels.paper(), fromX: Int((margin + 210) * 2)))
        let inkEnd = margin + content - CGFloat(glyph.maxX + 1) / 2
        #expect(inkEnd >= 0 && inkEnd <= 6, "ink ends \(inkEnd) in from the content")
        let middle = CGFloat(glyph.minY + glyph.maxY + 1) / 4 - 12
        #expect(abs(middle - 11) <= 2, "glyph centred at \(middle) of the 22 line")
    }
}

/// Round 29 §S11 (the owner, 2026-11-22: 「這三個圈圈可不可以中點幫我對齊這個共振按鈕的中間呢」): the faces under the capsule
/// stand centred on the 共振 segment — the segment's, not the capsule's — one, two or three alike, stopping at the row's
/// start; they used to start 12 in whatever the segment.
@MainActor @Suite(.serialized) struct RowTwoCentreTests {
    /// The drawn faces' extent across (points), on the row's left half.
    private func facesSpan(_ count: Int, centre: CGFloat?, width: CGFloat = 360) throws -> ClosedRange<CGFloat> {
        let row = EndRowTwo(facesCentre: centre, faceCount: count) {
            TapFaces(faces: (0 ..< count).map { Fixture.author("p\($0)") }, spoken: "", isButton: true) {}
        }
        let drawn = try DrawnPixels(row.frame(width: width).background(Tokens.cream))
        let paper = try DrawnPixels(Color.clear.frame(width: 4, height: 4).background(Tokens.cream)).rgb(2, 2)
        var first: Int?, last: Int?
        for y in 0 ..< drawn.height {
            for x in 0 ..< drawn.width * 2 / 3 {
                guard zip(drawn.rgb(x, y), paper).reduce(0, { $0 + abs($1.0 - $1.1) }) > 30 else { continue }
                first = min(first ?? x, x)
                last = max(last ?? x, x)
            }
        }
        return CGFloat(try #require(first)) / 2 ... CGFloat(try #require(last) + 1) / 2
    }

    @Test func oneTwoOrThreeFacesStandCentredOnTheTapSegment() throws {
        // A 360 capsule of three even segments: 共振's centre at 60.
        for count in 1 ... 3 {
            let span = try facesSpan(count, centre: 60)
            let mid = (span.lowerBound + span.upperBound) / 2
            #expect(abs(mid - 60) <= 1.5, "\(count): \(span)")
            // Not where they stood: the first face 12 in.
            #expect(span.lowerBound > RowTwo.faceInset + 4, "\(count): \(span)")
        }
        // A segment as wide as the capsule (two lines, 共振 alone on the first): its centre.
        let wide = try facesSpan(2, centre: 180)
        #expect(abs((wide.lowerBound + wide.upperBound) / 2 - 180) <= 1.5, "\(wide)")
    }

    @Test func aGroupThatWouldPassTheRowsStartStopsThere() throws {
        #expect(RowTwo.facesLead(centre: 10, count: 3) == 0)
        #expect(RowTwo.facesLead(centre: nil, count: 3) == RowTwo.facesLine)
        #expect(abs(RowTwo.facesLead(centre: 60, count: 1) - (60 - 14 - TapFaces.buttonPad)) < 0.01)
        let span = try facesSpan(3, centre: 10)
        #expect(span.lowerBound >= TapFaces.buttonPad - 1.5 && span.lowerBound <= TapFaces.buttonPad + 1, "\(span)")
    }

    /// The capsule says where its segments are: 共振's bounds, read through ``SegmentBounds``, are the first third of an
    /// even bar.
    @Test func theCapsuleSaysWhereItsTapSegmentIs() async throws {
        final class Box { var centre: CGFloat? }
        let box = Box()
        let bar = SegmentedActionBar([
            SegmentSpec(id: "tap", label: "共振") {}, SegmentSpec(id: "note", label: "寄小紙條") {}, SegmentSpec(id: "reply", label: "寫卡片") {},
        ])
        .frame(width: 360)
        .backgroundPreferenceValue(SegmentBounds.self) { bounds in
            GeometryReader { proxy in
                Color.clear.onAppear { box.centre = bounds["tap"].map { proxy[$0].midX } }
            }
        }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 400)
        window.rootViewController = UIHostingController(rootView: bar)
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        _ = await eventually { box.centre != nil }
        let centre = try #require(box.centre)
        #expect(abs(centre - 60) < 2, "\(centre)")
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

    /// The page's paper as drawn, for telling ink from it.
    @MainActor static func paper() throws -> [Int] {
        try DrawnPixels(Color.clear.frame(width: 4, height: 4).background(Tokens.cream)).rgb(2, 2)
    }

    /// The box (in pixels) of everything off `paper` from column `fromX` on; nil when nothing is.
    func inkBounds(paper: [Int], fromX: Int = 0) -> (minX: Int, maxX: Int, minY: Int, maxY: Int)? {
        var box: (minX: Int, maxX: Int, minY: Int, maxY: Int)?
        for y in 0 ..< height {
            for x in max(0, fromX) ..< width {
                let off = zip(rgb(x, y), paper).reduce(0) { $0 + abs($1.0 - $1.1) }
                guard off > 30 else { continue }
                box = (min(box?.minX ?? x, x), max(box?.maxX ?? x, x), min(box?.minY ?? y, y), max(box?.maxY ?? y, y))
            }
        }
        return box
    }

    /// How many pixels are of a colour `matches` says.
    func count(_ matches: ([Int]) -> Bool) -> Int {
        var n = 0
        for y in 0 ..< height { for x in 0 ..< width where matches(rgb(x, y)) { n += 1 } }
        return n
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
