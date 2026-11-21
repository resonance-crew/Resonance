import StoryFormat
import SwiftUI
import UIKit

// Round 29: on the author's own page of a published card, every sentence a reader picked after 共振 — still in the
// story — wears a faint wash, and the people who picked it (newest first, at most three, overlapped, nothing after
// them) stand beside it: in the right margin where the white right of the column is ≥ 70, else in the line, right
// after the sentence's last character (§S1, §S2, §S9). Pressing the faces or the wash opens who picked that sentence
// (§S4). Only the author's page passes the marks; every other page is drawn as it was.

/// One picked sentence in one drawn text: its id, its range in the text (UTF-16), and — in the line placement — the
/// room its faces take after its last character (kerned onto that character, so the two never part across a line
/// break), 0 in the margin.
public struct PassageWash: Equatable, Sendable {
    public let id: String
    public let range: NSRange
    public let gap: CGFloat

    public init(id: String, range: NSRange, gap: CGFloat) {
        self.id = id
        self.range = range
        self.gap = gap
    }

    /// The wash's paper (`--passage-wash`): the tap's tonal over the page, by day and at night.
    public static let ink = Tokens.UI.passageWash
    /// How far a piece runs past the sentence's first and last glyph on its line.
    public static let overhang: CGFloat = 2
    /// How much shorter than its line box a piece is, so two lines' pieces never touch.
    public static let inset: CGFloat = 6
    public static let corner: CGFloat = 6
    /// A wash (and its faces) that comes after the text was drawn fades in over this long.
    public static let fade: Double = 0.15

    /// `text` with each wash's room kerned onto its last character (nothing changes for a wash in the margin).
    public static func kerned(_ text: NSAttributedString, _ washes: [PassageWash]) -> NSAttributedString {
        let rooms = washes.filter { $0.gap > 0 && $0.range.length > 0 && NSMaxRange($0.range) <= text.length }
        guard !rooms.isEmpty else { return text }
        let out = NSMutableAttributedString(attributedString: text)
        let string = text.string as NSString
        for wash in rooms {
            let last = string.rangeOfComposedCharacterSequence(at: NSMaxRange(wash.range) - 1)
            let kern = (out.attribute(.kern, at: last.location, effectiveRange: nil) as? NSNumber).map { CGFloat($0.doubleValue) } ?? 0
            out.addAttribute(.kern, value: kern + wash.gap, range: last)
        }
        return out
    }

    /// Where `wash` came out in a laid-out text: one piece per line (in the view's points, `origin` the text
    /// container's inset), the line box of the line it ends on, and in the line placement the faces' slot after its
    /// last character. Nil when the range isn't in the text.
    public static func geometry(of wash: PassageWash, layoutManager lm: NSLayoutManager, container: NSTextContainer, origin: CGPoint,
                         width: CGFloat) -> PassageGeometry? {
        guard let storage = lm.textStorage, wash.range.length > 0, NSMaxRange(wash.range) <= storage.length else { return nil }
        let frags = LinkWaves.fragments(of: wash.range, layoutManager: lm, container: container)
        guard !frags.isEmpty else { return nil }
        let last = (storage.string as NSString).rangeOfComposedCharacterSequence(at: NSMaxRange(wash.range) - 1)
        let glyphs = lm.glyphRange(forCharacterRange: last, actualCharacterRange: nil)
        guard glyphs.length > 0 else { return nil }
        let line = lm.lineFragmentRect(forGlyphAt: glyphs.location, effectiveRange: nil)
        // The last character's own end: where its glyph starts, its advance and the story's tracking — not the room
        // kerned on for the faces.
        var advance: CGFloat = 0
        if let font = storage.attribute(.font, at: last.location, effectiveRange: nil) as? UIFont {
            for g in glyphs.location ..< NSMaxRange(glyphs) {
                var glyph = lm.cgGlyph(at: g)
                var size = CGSize.zero
                CTFontGetAdvancesForGlyphs(font as CTFont, .horizontal, &glyph, &size, 1)
                advance += size.width
            }
        }
        let kern = (storage.attribute(.kern, at: last.location, effectiveRange: nil) as? NSNumber).map { CGFloat($0.doubleValue) } ?? 0
        let end = line.minX + lm.location(forGlyphAt: glyphs.location).x + advance + max(0, kern - wash.gap)
        let pieces = frags.enumerated().map { i, f -> CGRect in
            let maxX = i == frags.count - 1 ? min(f.maxX, end) : f.maxX
            return CGRect(x: f.minX - overhang + origin.x, y: f.lineTop + inset / 2 + origin.y,
                          width: max(0, maxX - f.minX) + 2 * overhang, height: max(0, f.lineHeight - inset))
        }
        let endLine = CGRect(x: 0, y: line.minY + origin.y, width: width, height: line.height)
        let slot = wash.gap > 0
            ? CGRect(x: end + PassageFaces.lineGap + origin.x, y: line.minY + origin.y, width: max(0, wash.gap - 2 * PassageFaces.lineGap),
                     height: line.height)
            : nil
        return PassageGeometry(pieces: pieces, endLine: endLine, slot: slot)
    }
}

/// Where one wash came out, in its text view's points.
public struct PassageGeometry: Equatable, Sendable {
    public var pieces: [CGRect]
    /// The line box of the line the sentence ends on, across the view.
    public var endLine: CGRect
    /// In the line placement: where its faces lie, after its last character.
    public var slot: CGRect?

    public init(pieces: [CGRect], endLine: CGRect, slot: CGRect?) {
        self.pieces = pieces
        self.endLine = endLine
        self.slot = slot
    }
}

/// A text's washes as laid out, with its links' boxes (a link keeps its press where the faces' hit area reaches it).
public struct PassageLayout: Equatable, Sendable {
    public var marks: [String: PassageGeometry]
    public var links: [CGRect]
    public var width: CGFloat
}

/// The faces' measures and places (§S1, §S2) — pure, the web's PassageFaces and Android's alike.
public nonisolated enum PassageFaces {
    public enum Place: Equatable, Sendable { case margin, inline }

    /// A face at 1×; × the story's reading scale in the apps.
    public static let size: CGFloat = 24
    /// A Latin-script story on a compact window (its line box is 28.8).
    public static let latinCompactSize: CGFloat = 22
    /// The white right of the column the margin needs (`PASSAGE_MARGIN_MIN`).
    public static let marginMin: CGFloat = 70
    /// From the column's right edge to the group's left edge, in the margin.
    public static let marginGap: CGFloat = 8
    /// In the line: after the sentence's last character, and before the next.
    public static let lineGap: CGFloat = 4
    /// In the margin the widest group keeps at least 6 from the rail or the window's edge: room − 14 for three faces.
    public static let marginClear: CGFloat = 14
    /// A finger's hit area, centred on the group.
    public static let hit: CGFloat = 44

    /// Which place by the white right of the column.
    public static func place(room: CGFloat) -> Place { room >= marginMin ? .margin : .inline }

    /// The white right of the story's column: to the contents rail when one stands (always the rail gap), else to the
    /// page's edge. `width`: what the page has across.
    public static func room(_ layout: CardPageLayout, width: CGFloat) -> CGFloat {
        if layout.rail { return Tokens.storyRailGap }
        return max(0, width - (layout.leading + layout.article - CardPageLayout.articleInset))
    }

    /// A face's size: 24 × the reading scale (22 × it for a Latin story on a compact window) and never taller than
    /// the line box in the line; in the margin capped so three overlapped faces (2.32 × a face) keep 6 clear.
    public static func faceSize(_ place: Place, room: CGFloat, reading: CGFloat, latinCompact: Bool, lineBox: CGFloat) -> CGFloat {
        switch place {
        case .inline: return min((latinCompact ? latinCompactSize : size) * reading, lineBox)
        case .margin: return min(size * reading, (room - marginClear) / FaceStack.width(count: FaceStack.maxFaces, size: 1))
        }
    }

    /// The room the faces take in the line: the group and 4 at each side of it.
    public static func lineRoom(count: Int, size: CGFloat) -> CGFloat {
        FaceStack.width(count: count, size: size) + 2 * lineGap
    }

    /// Each margin group's centre line, in order down the text: a group that would share a line with the one before
    /// it moves down one line box.
    public static func marginCentres(_ ends: [CGFloat], lineBox: CGFloat) -> [CGFloat] {
        var out: [CGFloat] = []
        for y in ends { out.append(max(y, (out.last ?? -.infinity) + lineBox)) }
        return out
    }

    /// The group's box in its text's points: in the line, its slot (centred, the faces' own width); in the margin,
    /// ``marginGap`` past the text's right edge, centred on `centreY`.
    public static func groupBox(_ geometry: PassageGeometry, place: Place, count: Int, size: CGFloat, textWidth: CGFloat,
                                centreY: CGFloat) -> CGRect {
        let width = FaceStack.width(count: count, size: size)
        switch place {
        case .inline:
            let slot = geometry.slot ?? geometry.endLine
            return CGRect(x: slot.minX, y: slot.midY - size / 2, width: width, height: size)
        case .margin:
            return CGRect(x: textWidth + marginGap, y: centreY - size / 2, width: width, height: size)
        }
    }
}

/// What the author's page hands its story (§U1): the picked sentences with their faces, where the faces stand, and
/// what a press does. Only the author's card page sets it (``View/storyPassages(_:)``).
public struct StoryPassageMarks {
    public struct Passage: Equatable {
        public let id: String
        public let text: String
        public let faces: [FaceStack.Face]
        /// What a screen reader hears for its faces (`card.tap.pickedBy` / `pickedByMore`).
        public let spoken: String

        public init(id: String, text: String, faces: [FaceStack.Face], spoken: String) {
            self.id = id
            self.text = text
            self.faces = Array(faces.prefix(FaceStack.maxFaces))
            self.spoken = spoken
        }
    }

    public var passages: [Passage]
    public var place: PassageFaces.Place
    public var room: CGFloat
    /// The story's reading scale (`StoryTypography.scale(.body)`: the system's, capped at 2, × the Mac's boost).
    public var reading: CGFloat
    /// A Latin-script story on a compact window.
    public var latinCompact: Bool
    public var press: (String) -> Void

    public init(passages: [Passage], room: CGFloat, reading: CGFloat, latinCompact: Bool, press: @escaping (String) -> Void) {
        self.passages = passages
        self.place = PassageFaces.place(room: room)
        self.room = room
        self.reading = reading
        self.latinCompact = latinCompact
        self.press = press
    }
}

private struct StoryPassagesKey: EnvironmentKey {
    static let defaultValue: StoryPassageMarks? = nil
}

private struct StoryPassageLeavesKey: EnvironmentKey {
    static let defaultValue: [[Int]: [PassageLeaves.Mark]] = [:]
}

extension EnvironmentValues {
    /// The author's picked sentences, for the story view under it (nil everywhere else).
    public var storyPassages: StoryPassageMarks? {
        get { self[StoryPassagesKey.self] }
        set { self[StoryPassagesKey.self] = newValue }
    }

    /// Each leaf's found sentences, by its path (``PassageLeaves``), as the story view found them.
    var storyPassageLeaves: [[Int]: [PassageLeaves.Mark]] {
        get { self[StoryPassageLeavesKey.self] }
        set { self[StoryPassageLeavesKey.self] = newValue }
    }
}

extension View {
    /// The author's page: its story washes the picked sentences and stands their faces beside them.
    public func storyPassages(_ marks: StoryPassageMarks?) -> some View {
        environment(\.storyPassages, marks)
    }
}

/// One drawn text of the author's story with its washes and its sentences' faces: ``CSSTextView`` washing the ranges,
/// and over it one button per sentence — the house face stack, overlapped, at most three, with a 44 hit area that a
/// link's own box keeps out of.
struct PassageText: View {
    let text: NSAttributedString
    let font: UIFont
    let lineHeight: CGFloat
    let language: String?
    let onOpenURL: (URL) -> Void
    let marks: [PassageLeaves.Mark]
    let plan: StoryPassageMarks
    @State private var layout: PassageLayout?
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    private var lineBox: CGFloat { font.pointSize * lineHeight }
    private var faceSize: CGFloat {
        PassageFaces.faceSize(plan.place, room: plan.room, reading: plan.reading, latinCompact: plan.latinCompact, lineBox: lineBox)
    }

    /// This text's sentences with their passages, in the story's order.
    private var shown: [(mark: PassageLeaves.Mark, passage: StoryPassageMarks.Passage)] {
        marks.sorted { $0.order < $1.order }.compactMap { mark in
            plan.passages.first { $0.id == mark.id }.map { (mark, $0) }
        }
    }

    var body: some View {
        let size = faceSize
        let washes = shown.map { item in
            PassageWash(id: item.mark.id, range: item.mark.range,
                        gap: plan.place == .inline ? PassageFaces.lineRoom(count: item.passage.faces.count, size: size) : 0)
        }
        CSSTextView(text, font: font, lineHeight: lineHeight, language: language, onOpenURL: onOpenURL)
            .washing(washes, onLayout: receive, onPress: plan.press)
            .overlay(alignment: .topLeading) {
                if let layout { groups(layout, size: size) }
            }
    }

    /// A layout that brings a sentence the text didn't have when last drawn fades its faces in (as the wash does).
    private func receive(_ new: PassageLayout) {
        guard new != layout else { return }
        let fresh = layout.map { old in !Set(new.marks.keys).subtracting(old.marks.keys).isEmpty } ?? false
        if fresh, !reduceMotion, UIView.areAnimationsEnabled {
            withAnimation(.easeOut(duration: PassageWash.fade)) { layout = new }
        } else {
            layout = new
        }
    }

    private func groups(_ layout: PassageLayout, size: CGFloat) -> some View {
        let items = shown.filter { layout.marks[$0.mark.id] != nil }
        let centres = PassageFaces.marginCentres(items.map { layout.marks[$0.mark.id]!.endLine.midY }, lineBox: lineBox)
        return ZStack(alignment: .topLeading) {
            ForEach(Array(items.enumerated()), id: \.element.mark.id) { i, item in
                let box = PassageFaces.groupBox(layout.marks[item.mark.id]!, place: plan.place, count: item.passage.faces.count,
                                                size: size, textWidth: layout.width, centreY: centres[i])
                PassageGroup(passage: item.passage, order: item.mark.order, size: size, box: box, links: layout.links) {
                    plan.press(item.passage.id)
                }
                .transition(.opacity)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    }
}

/// One sentence's faces: a button, its hit area 44 × 44 (wider for a wider group) centred on them, less any link's box.
private struct PassageGroup: View {
    let passage: StoryPassageMarks.Passage
    let order: Int
    let size: CGFloat
    /// The faces' own box, in the text's points.
    let box: CGRect
    let links: [CGRect]
    let action: () -> Void

    var body: some View {
        let hit = CGRect(x: box.midX - max(PassageFaces.hit, box.width) / 2, y: box.midY - PassageFaces.hit / 2,
                         width: max(PassageFaces.hit, box.width), height: PassageFaces.hit)
        let holes = links.filter { $0.intersects(hit) }.map { $0.offsetBy(dx: -hit.minX, dy: -hit.minY) }
        Button(action: action) {
            FaceStack(faces: passage.faces, size: size)
                .frame(width: hit.width, height: hit.height)
                .contentShape(HitArea(holes: holes), eoFill: true)
        }
        .buttonStyle(OrganicPressStyle(inset: 2))
        .accessibilityLabel(passage.spoken)
        // The name the interaction flows find it by (maestro/flows/tap-picked.yaml).
        .accessibilityIdentifier("passage-faces-\(order)")
        .frame(width: hit.width, height: hit.height)
        .offset(x: hit.minX, y: hit.minY)
    }
}

/// A rectangle less the links' boxes inside it (even-odd).
private nonisolated struct HitArea: Shape {
    let holes: [CGRect]

    func path(in rect: CGRect) -> Path {
        var path = Path(rect)
        for hole in holes { path.addRect(hole.intersection(rect)) }
        return path
    }
}
