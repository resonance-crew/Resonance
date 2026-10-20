import StoryFormat
import SwiftUI
import UIKit

/// A story's title as the card page sets it (src/styles/story.css `.story-title`): in the story's
/// title face (``StoryTypography``: Noto Serif TC 600 at +0.02em for CJK, Playfair 700 for Latin,
/// never negative tracking, lining figures), growing with the person's text size along the reading
/// curve, start-aligned and balanced (`text-wrap: balance`: the lines as even as the line count
/// allows, so a two-line title doesn't leave one word on its second).
///
/// A CJK title is cut into its clauses (`StoryScript.titleClauses`, the web's `.story-clause`
/// inline blocks): each stays whole on a line when it fits, so a title too long for one line breaks
/// after its punctuation (「湖中央，／我看見了知行合一」), not mid-phrase; a clause longer than the
/// line still wraps inside itself. An apostrophe inside a Latin word is set in Playfair.
///
/// VoiceOver reads it as one heading, in the story's language (`lang`), whatever the interface's.
public struct StoryTitle: View {
    let title: String
    let typography: StoryTypography
    let lang: String?
    var color: UIColor

    public init(_ title: String, typography: StoryTypography, lang: String?, color: UIColor = UIColor(Tokens.text)) {
        self.title = title
        self.typography = typography
        self.lang = lang
        self.color = color
    }

    public var body: some View {
        let font = typography.titleFont()
        let clauses = Self.clauses(title, script: typography.script)
        BalancedClauses(lineBox: font.pointSize * typography.titleLeading) {
            ForEach(Array(clauses.enumerated()), id: \.offset) { _, clause in
                TitleClauseLabel(text: typography.titleText(clause, font: font, color: color))
            }
        }
        .accessibilityHidden(true)
        .overlay { SpokenText(text: title, language: lang, traits: .header) }
    }

    /// The pieces a title is laid out in: a CJK title's clauses, a Latin title whole.
    public static func clauses(_ title: String, script: StoryScript) -> [String] {
        script == .cjk ? StoryScript.titleClauses(title) : [title]
    }
}

extension StoryTypography {
    /// A title's words (or one clause of them) as the title sets them: its face, tracking and CSS line
    /// box, start-aligned, an apostrophe inside a Latin word in Playfair in a CJK title.
    @MainActor public func titleText(_ text: String, font: UIFont, color: UIColor = UIColor(Tokens.text)) -> NSAttributedString {
        let lineBox = font.pointSize * titleLeading
        let style = paragraphStyle(lineBox: lineBox, role: .title)
        let out = NSMutableAttributedString(string: text, attributes: [
            .font: font,
            .foregroundColor: color,
            .paragraphStyle: style,
            .kern: kern(.title, pointSize: font.pointSize),
            // A UILabel sets glyphs on a fixed line's foot; CSS centres the face's content area in it.
            .baselineOffset: (lineBox - font.lineHeight) / 2,
        ])
        settingLatinMarks(in: out, family: titleFamily, size: font.pointSize, weight: titleWeight, lining: true)
        return out
    }
}

/// Lays out a title's clauses as CSS lays out inline blocks with `text-wrap: balance`: each on the
/// line it began on when it fits there, else at the start of the next; one wider than the line
/// takes the whole line and wraps inside. Then the lines are evened: the narrowest width giving the
/// same number of lines is the one laid out at (start-aligned in the full width).
public struct BalancedClauses: Layout {
    /// One line's height (the title's CSS line box).
    let lineBox: CGFloat

    public init(lineBox: CGFloat) { self.lineBox = lineBox }

    public struct Cache {
        var natural: [CGFloat] = []
    }

    public func makeCache(subviews: Subviews) -> Cache {
        Cache(natural: subviews.map { $0.sizeThatFits(.unspecified).width })
    }

    public func updateCache(_ cache: inout Cache, subviews: Subviews) {
        cache = makeCache(subviews: subviews)
    }

    public func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) -> CGSize {
        let full = proposal.width ?? cache.natural.reduce(0, +)
        let width = Self.balanced(full, natural: cache.natural) { rows(width: $0, natural: cache.natural, subviews: subviews).height }
        let laid = rows(width: width, natural: cache.natural, subviews: subviews)
        return CGSize(width: proposal.width ?? laid.width, height: laid.height)
    }

    public func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout Cache) {
        let full = bounds.width
        let width = Self.balanced(full, natural: cache.natural) { rows(width: $0, natural: cache.natural, subviews: subviews).height }
        let laid = rows(width: width, natural: cache.natural, subviews: subviews)
        for (i, place) in laid.places.enumerated() {
            subviews[i].place(at: CGPoint(x: bounds.minX + place.origin.x, y: bounds.minY + place.origin.y),
                              proposal: ProposedViewSize(width: place.width, height: nil))
        }
    }

    public struct Place: Equatable, Sendable {
        public var origin: CGPoint
        public var width: CGFloat
    }

    /// The clauses flowed into lines `width` wide.
    func rows(width: CGFloat, natural: [CGFloat], subviews: Subviews) -> (places: [Place], width: CGFloat, height: CGFloat) {
        Self.flow(width: width, natural: natural, lineBox: lineBox) { i, w in
            subviews[i].sizeThatFits(ProposedViewSize(width: w, height: nil)).height
        }
    }

    /// The flow itself: `natural` are the clauses' one-line widths (each one line box tall), and
    /// `height(i, w)` a clause's height laid out `w` wide — asked only of one wider than the line.
    public static func flow(width: CGFloat, natural: [CGFloat], lineBox: CGFloat, height: (Int, CGFloat) -> CGFloat)
        -> (places: [Place], width: CGFloat, height: CGFloat) {
        let slack: CGFloat = 0.5
        var places: [Place] = []
        var x: CGFloat = 0, y: CGFloat = 0, rowHeight: CGFloat = 0, widest: CGFloat = 0
        for (i, w) in natural.enumerated() {
            if w > width + slack {
                // Wider than the line: a line (or more) of its own.
                if x > 0 { y += rowHeight; x = 0 }
                let h = height(i, width)
                places.append(Place(origin: CGPoint(x: 0, y: y), width: width))
                widest = max(widest, width)
                y += h
                rowHeight = 0
                continue
            }
            if x > 0, x + w > width + slack {
                y += rowHeight
                x = 0
                rowHeight = 0
            }
            places.append(Place(origin: CGPoint(x: x, y: y), width: w))
            x += w
            widest = max(widest, x)
            rowHeight = lineBox
        }
        return (places, widest, y + rowHeight)
    }

    /// The narrowest width, at most `full`, whose lines are as many as `full`'s (the browser's
    /// balance): a title of one line keeps its width.
    public static func balanced(_ full: CGFloat, natural: [CGFloat], height: (CGFloat) -> CGFloat) -> CGFloat {
        guard full.isFinite, full > 0 else { return full }
        let target = height(full)
        // One line already: nothing to even out.
        guard natural.reduce(0, +) > full + 0.5 else { return full }
        var lo: CGFloat = 0, hi = full
        for _ in 0..<14 where hi - lo > 0.5 {
            let mid = (lo + hi) / 2
            if height(mid) <= target + 0.5 { hi = mid } else { lo = mid }
        }
        return hi
    }
}

/// One clause of a title: a label sized to its words (one line when it fits, wrapped inside the
/// width offered when not).
struct TitleClauseLabel: UIViewRepresentable {
    let text: NSAttributedString

    func makeUIView(context: Context) -> UILabel {
        let label = UILabel()
        label.numberOfLines = 0
        label.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        return label
    }

    func updateUIView(_ label: UILabel, context: Context) {
        if label.attributedText != text { label.attributedText = text }
    }

    func sizeThatFits(_ proposal: ProposedViewSize, uiView: UILabel, context: Context) -> CGSize? {
        let width = proposal.width ?? .greatestFiniteMagnitude
        let size = uiView.sizeThatFits(CGSize(width: width, height: .greatestFiniteMagnitude))
        return CGSize(width: min(width, ceil(size.width)), height: ceil(size.height))
    }
}

/// What VoiceOver reads for words drawn in pieces (a title's clauses): one element, in `language`
/// (a BCP 47 tag; nil keeps the interface's), with `traits`.
struct SpokenText: UIViewRepresentable {
    let text: String
    let language: String?
    var traits: UIAccessibilityTraits = .staticText

    func makeUIView(context: Context) -> UIView {
        let view = UIView()
        view.isAccessibilityElement = true
        view.backgroundColor = .clear
        view.isUserInteractionEnabled = false
        return view
    }

    func updateUIView(_ view: UIView, context: Context) {
        view.accessibilityLabel = text
        view.accessibilityLanguage = language
        view.accessibilityTraits = traits
    }
}
