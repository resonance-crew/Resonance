import DesignSystem
import Foundation
import ResonanceKit
import StoryFormat
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// Round 29 (§P3, §U2, §S1, §S2, §S9): on the author's own page a picked sentence wears a faint wash and the people
/// who picked it stand beside it — in the right margin where the white right of the column is ≥ 70, else in the line
/// right after the sentence's last character. Where a sentence lies is the web's one rule (passageRange.ts), run here
/// on the same cases file.
@MainActor @Suite(.serialized) struct PassageMarksTests {
    struct Cases: Decodable {
        struct Expect: Decodable { let leaf: Int?; let start: Int; let end: Int }
        struct Case: Decodable {
            let name: String
            let leaf: String?
            let leaves: [String]?
            let sentence: String
            let expect: Expect?
        }
        let cjkRanges: [[UInt32]]
        let cases: [Case]
    }

    static func cases() throws -> Cases {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../test/vectors/passageMarks.json").standardized
        return try JSONDecoder().decode(Cases.self, from: Data(contentsOf: url))
    }

    // MARK: The finder

    @Test func theCasesFileFindsWhatTheWebFinds() throws {
        let file = try Self.cases()
        #expect(file.cases.count >= 10)
        for c in file.cases {
            if let leaf = c.leaf {
                let got = PassageRange.find(leaf, c.sentence)
                #expect(got?.start == c.expect?.start && got?.end == c.expect?.end, "\(c.name): \(String(describing: got))")
                #expect((got == nil) == (c.expect == nil), "\(c.name)")
            } else if let leaves = c.leaves {
                let got = PassageRange.find(in: leaves, c.sentence)
                #expect(got?.leaf == c.expect?.leaf && got?.start == c.expect?.start && got?.end == c.expect?.end, "\(c.name)")
                #expect((got == nil) == (c.expect == nil), "\(c.name)")
            }
        }
    }

    @Test func theCJKCodePointsAreTheFilesOwn() throws {
        let file = try Self.cases()
        #expect(PassageRange.cjkRanges.map { [$0.lowerBound, $0.upperBound] } == file.cjkRanges)
    }

    /// The ranges are NSString's (UTF-16), so a found range washes exactly the sentence's characters.
    @Test func aRangeIsTheLeafsOwnCharacters() throws {
        let leaf = "箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。窗外有人在慢慢地收衣服。"
        let r = try #require(PassageRange.find(leaf, "我坐在地上，第一次覺得安靜是屬於自己的。"))
        #expect((leaf as NSString).substring(with: NSRange(location: r.start, length: r.end - r.start)) == "我坐在地上，第一次覺得安靜是屬於自己的。")
    }

    // MARK: The story's leaves

    static let story: [StoryBlock] = [
        .heading(level: 2, [InlineRun("搬家")]),
        .paragraph([InlineRun("箱子堆滿了客廳，"), InlineRun("我坐在地上，", bold: true), InlineRun("第一次覺得安靜是屬於自己的。")]),
        .quote([.paragraph([InlineRun("你不是失去了一個家，\n你是多了一個可以回去的地方。")])]),
        .list(ordered: false, start: 1, items: [[.paragraph([InlineRun("把書按照顏色排好")])], [.paragraph([InlineRun("在窗台放一盆薄荷")])]]),
        .paragraph([InlineRun("我坐在地上，第一次覺得安靜是屬於自己的。")]),
    ]

    @Test func theLeavesAreWalkedInTheStorysOrderByTheirPaths() {
        let leaves = PassageLeaves.leaves(Self.story)
        #expect(leaves.map(\.path) == [[0], [1], [2, 0], [3, 0, 0], [3, 1, 0], [4]])
        #expect(leaves[1].text == "箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。")
    }

    @Test func eachSentenceIsWashedOnceInTheFirstLeafThatHoldsItNumberedInTheStorysOrder() throws {
        let marks = PassageLeaves.marks(Self.story, sentences: [
            ("q", "你不是失去了一個家，你是多了一個可以回去的地方。"),
            ("a", "我坐在地上，第一次覺得安靜是屬於自己的。"),
            ("gone", "這一句已經不在故事裡了。"),
            ("across", "把書按照顏色排好 在窗台放一盆薄荷"),
        ])
        // Across a bold run, in the first paragraph (not the later one that says it again).
        #expect(marks[[1]] == [PassageLeaves.Mark(id: "a", order: 0, start: 8, end: 28)])
        #expect(marks[[2, 0]] == [PassageLeaves.Mark(id: "q", order: 1, start: 0, end: 25)])
        #expect(marks[[4]] == nil)
        // A sentence no longer in the story, or across two list items: nothing.
        #expect(marks.values.flatMap { $0 }.count == 2)
        #expect(PassageLeaves.marks(Self.story, sentences: []).isEmpty)
    }

    // MARK: Where the faces stand

    @Test func theMarginNeedsSeventyOfWhiteRightOfTheColumn() {
        #expect(PassageFaces.place(room: 69.9) == .inline)
        #expect(PassageFaces.place(room: 70) == .margin)
        // A phone: 20 of white, in the line.
        let phone = CardPageLayout.of(width: 402, window: 402)
        #expect(PassageFaces.room(phone, width: 402) == 20)
        #expect(PassageFaces.place(room: PassageFaces.room(phone, width: 402)) == .inline)
        // Beside a contents rail: always its 80.
        let turned = CardPageLayout.of(width: 1180, window: 1180, contents: true)
        #expect(turned.rail && PassageFaces.room(turned, width: 1180) == 80)
        // An upright iPad with no rail: the white to the window's edge.
        let upright = CardPageLayout.of(width: 820, window: 820, contents: false)
        let room = PassageFaces.room(upright, width: 820)
        #expect(abs(room - (820 - upright.text) / 2) < 0.01)
        #expect(PassageFaces.place(room: PassageFaces.room(CardPageLayout.of(width: 744, window: 744, contents: false), width: 744)) == .inline)
    }

    @Test func aFaceIsTwentyFourTimesTheReadingScale() {
        // In the line: 24 × the scale (36 at 1.5), 22 for a Latin story on a phone, never taller than the line box.
        #expect(PassageFaces.faceSize(.inline, room: 20, reading: 1, latinCompact: false, lineBox: 30.6) == 24)
        #expect(PassageFaces.faceSize(.inline, room: 20, reading: 1.5, latinCompact: false, lineBox: 45.9) == 36)
        #expect(PassageFaces.faceSize(.inline, room: 20, reading: 1, latinCompact: true, lineBox: 28.8) == 22)
        #expect(PassageFaces.faceSize(.inline, room: 20, reading: 2, latinCompact: false, lineBox: 40) == 40)
        // In the margin: capped so three overlapped faces keep 6 clear of the rail (28.4 beside it on the Mac's boost).
        #expect(PassageFaces.faceSize(.margin, room: 80, reading: 1, latinCompact: false, lineBox: 30) == 24)
        let mac = PassageFaces.faceSize(.margin, room: 80, reading: 1 / 0.77, latinCompact: false, lineBox: 40)
        #expect(abs(mac - 66 / 2.32) < 0.01)
        #expect(80 - PassageFaces.marginGap - FaceStack.width(count: 3, size: mac) >= 6 - 0.01)
    }

    @Test func theGroupIsTheHouseStackOverlappedAtMostThree() {
        // 24 / 39.8 / 55.7, nothing after them.
        #expect(abs(FaceStack.width(count: 1, size: 24) - 24) < 0.05)
        #expect(abs(FaceStack.width(count: 2, size: 24) - 39.84) < 0.05)
        #expect(abs(FaceStack.width(count: 3, size: 24) - 55.68) < 0.05)
        #expect(FaceStack.width(count: 4, size: 24) == FaceStack.width(count: 3, size: 24))
        // In the line it takes its width and 4 a side.
        #expect(abs(PassageFaces.lineRoom(count: 2, size: 24) - (39.84 + 8)) < 0.05)
        let faces = (0..<5).map { FaceStack.Face(id: "\($0)", initials: "", imageURL: nil, color: .red, seed: 1) }
        #expect(StoryPassageMarks.Passage(id: "p", text: "t", faces: faces, spoken: "").faces.count == 3)
    }

    @Test func twoGroupsOnOneLineInTheMarginStepDownALine() {
        #expect(PassageFaces.marginCentres([15, 15, 75], lineBox: 30) == [15, 45, 75])
        #expect(PassageFaces.marginCentres([15, 45], lineBox: 30) == [15, 45])
        let g = PassageGeometry(pieces: [], endLine: CGRect(x: 0, y: 30, width: 300, height: 30), slot: nil)
        let box = PassageFaces.groupBox(g, place: .margin, count: 2, size: 24, textWidth: 300, centreY: 45)
        #expect(box.minX == 308 && box.midY == 45 && abs(box.width - 39.84) < 0.05)
    }

    // MARK: The wash and the line

    /// A text laid out as the story view lays it (TextKit 1, CSS line boxes) at `width`.
    private func laidOut(_ text: NSAttributedString, width: CGFloat, font: UIFont, lineHeight: CGFloat)
        -> (NSLayoutManager, NSTextContainer, (CSSLineBoxes, NSTextStorage)) {
        let storage = NSTextStorage(attributedString: text)
        let lm = NSLayoutManager()
        let boxes = CSSLineBoxes(font: font, lineHeight: lineHeight)
        lm.delegate = boxes
        let container = NSTextContainer(size: CGSize(width: width, height: .greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        lm.addTextContainer(container)
        storage.addLayoutManager(lm)
        lm.ensureLayout(for: container)
        // The layout manager holds its storage and its delegate weakly: the caller keeps both.
        return (lm, container, (boxes, storage))
    }

    @Test func inTheLineTheFacesAreGluedAfterTheSentencesLastCharacter() throws {
        let style = ProseStyle.body(StoryTypography(script: .cjk, layout: .compact))
        let text = style.attributed([InlineRun("箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。窗外有人在慢慢地收衣服。")])
        let gap = PassageFaces.lineRoom(count: 2, size: 24)
        let wash = PassageWash(id: "a", range: NSRange(location: 8, length: 20), gap: gap)
        let kerned = PassageWash.kerned(text, [wash])
        // Nothing to make room for: the very text given.
        #expect(PassageWash.kerned(text, [PassageWash(id: "a", range: wash.range, gap: 0)]) === text)
        let (lm, container, boxes) = laidOut(kerned, width: 362, font: style.font, lineHeight: style.lineHeight)
        _ = boxes
        let g = try #require(PassageWash.geometry(of: wash, layoutManager: lm, container: container, origin: .zero, width: 362))
        let slot = try #require(g.slot)
        #expect(abs(slot.width - (gap - 8)) < 0.01)
        // The slot is on the line the wash ends on, 4 after its last piece's end (less the 2 the piece runs past it).
        let last = try #require(g.pieces.last)
        #expect(abs(slot.minX - (last.maxX - PassageWash.overhang + PassageFaces.lineGap)) < 1.5)
        #expect(slot.midY > last.minY && slot.midY < last.maxY)
        // The next character starts after the slot and its 4.
        let next = lm.glyphIndexForCharacter(at: 28)
        var lineRange = NSRange()
        let line = lm.lineFragmentRect(forGlyphAt: next, effectiveRange: &lineRange)
        if NSLocationInRange(lm.glyphIndexForCharacter(at: 27), lineRange) {
            #expect(line.minX + lm.location(forGlyphAt: next).x >= slot.maxX + PassageFaces.lineGap - 1)
        }
        // Each piece is its line box less 6, so two lines' pieces never touch.
        let lineBox = style.font.pointSize * style.lineHeight
        for piece in g.pieces { #expect(abs(piece.height - (lineBox - 6)) < 0.01) }
    }

    @Test func inTheMarginNothingInTheStoryMoves() throws {
        let style = ProseStyle.body(StoryTypography(script: .cjk, layout: .expanded))
        let text = style.attributed([InlineRun("箱子堆滿了客廳，我坐在地上，第一次覺得安靜是屬於自己的。窗外有人在慢慢地收衣服。")])
        let wash = PassageWash(id: "a", range: NSRange(location: 8, length: 20), gap: 0)
        #expect(PassageWash.kerned(text, [wash]) === text)
        let (lm, container, kept) = laidOut(text, width: 300, font: style.font, lineHeight: style.lineHeight)
        _ = kept
        let g = try #require(PassageWash.geometry(of: wash, layoutManager: lm, container: container, origin: .zero, width: 300))
        #expect(g.slot == nil)
        #expect(!g.pieces.isEmpty)
        #expect(g.endLine.width == 300)
    }

    // MARK: On the page

    /// The author's story with picks: each found sentence's faces are one button named `passage-faces-N` in the story's
    /// order and heard as 「…對這一段有共鳴」; a story with no marks has none.
    @Test func theFacesAreButtonsInTheStorysOrder() async throws {
        let ax = AccessibilityOn()
        defer { ax.restore() }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 800)
        let face = TapFaces.face(Fixture.author("gus"))
        let spoken = L10n.Card.Tap.pickedBy(names: "gus")
        var pressed: [String] = []
        let marks = StoryPassageMarks(passages: [
            .init(id: "a", text: "我坐在地上，第一次覺得安靜是屬於自己的。", faces: [face], spoken: spoken),
            .init(id: "q", text: "你不是失去了一個家，你是多了一個可以回去的地方。", faces: [face], spoken: spoken),
        ], room: 20, reading: 1, latinCompact: false) { pressed.append($0) }
        window.rootViewController = UIHostingController(rootView: ScrollView {
            StoryMarkdownView(blocks: Self.story, typography: StoryTypography(script: .cjk, layout: .compact), onOpenURL: { _ in }) { _, _ in
                EmptyView?.none
            }
            .storyPassages(marks)
            .padding(.horizontal, 20)
        })
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        var found: [NSObject] = []
        _ = await eventually {
            found = AccessibilityOn.elements(in: window).filter { $0.accessibilityLabel == spoken }
            return found.count == 2
        }
        #expect(found.count == 2)
        #expect(found.allSatisfy { $0.accessibilityTraits.contains(.button) })
        let ids = Set(found.compactMap { element -> String? in
            guard element.responds(to: NSSelectorFromString("accessibilityIdentifier")) else { return nil }
            return element.value(forKey: "accessibilityIdentifier") as? String
        })
        #expect(ids == ["passage-faces-0", "passage-faces-1"], "\(ids)")
    }
}
