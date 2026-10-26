import StoryFormat
import SwiftUI
import UIKit

/// Selectable rich text laid out in exact CSS line boxes (see CSSLineBoxes):
/// each line is `lineHeight × font size` tall with the primary font's content
/// area centred in it, so paragraphs sit where the browser puts them (S5).
/// Links are tappable and handed to `onOpenURL`.
public struct CSSTextView: UIViewRepresentable {
    let text: NSAttributedString
    let font: UIFont
    let lineHeight: CGFloat
    var onOpenURL: (URL) -> Void
    /// Take the text's own width (a chat bubble shrink-wrapping its words) rather than all that's offered.
    var fitsContent: Bool
    /// The language VoiceOver reads it in (a story's own, whatever the interface's); nil keeps the app's.
    var language: String?

    public init(_ text: NSAttributedString, font: UIFont, lineHeight: CGFloat, fitsContent: Bool = false, language: String? = nil,
                onOpenURL: @escaping (URL) -> Void = { _ in }) {
        self.fitsContent = fitsContent
        self.language = language
        self.text = text
        self.font = font
        self.lineHeight = lineHeight
        self.onOpenURL = onOpenURL
    }

    public func makeCoordinator() -> Coordinator { Coordinator() }

    public func makeUIView(context: Context) -> UITextView {
        // TextKit 1: its layout-manager delegate is where line boxes are set.
        let storage = NSTextStorage()
        let layout = NSLayoutManager()
        let container = NSTextContainer(size: CGSize(width: 320, height: CGFloat.greatestFiniteMagnitude))
        container.lineFragmentPadding = 0
        layout.addTextContainer(container)
        storage.addLayoutManager(layout)
        let view = LinkWaveTextView(frame: .zero, textContainer: container)
        view.waveColor = LinkWaves.ink
        view.isEditable = false
        view.isSelectable = true
        view.isScrollEnabled = false
        // A link's wave runs 0.29em under its baseline, which on a heading's last line (h2, h3: a
        // tight line box) is past the view's foot: clipped there, that line would show only the
        // wave's highest crests. UIKit stops a text view clipping once it no longer scrolls (the
        // line above), but the wave relies on it, so it is said here rather than left to that side
        // effect. Nothing else is drawn past the bounds.
        view.clipsToBounds = false
        view.backgroundColor = .clear
        view.textContainerInset = .zero
        view.linkTextAttributes = [:]
        view.adjustsFontForContentSizeCategory = false
        view.setContentCompressionResistancePriority(.defaultLow, for: .horizontal)
        view.delegate = context.coordinator
        return view
    }

    public func updateUIView(_ view: UITextView, context: Context) {
        context.coordinator.onOpenURL = onOpenURL
        let boxes = CSSLineBoxes(font: font, lineHeight: lineHeight)
        context.coordinator.lineBoxes = boxes
        // Under the letters, not under the line box: the depth every platform shares (0.29em).
        (view as? LinkWaveTextView)?.waveDrop = LinkWaves.drop(fontSize: font.pointSize)
        view.layoutManager.delegate = boxes
        // A justified paragraph is laid out ragged and spread by hand once its width is known
        // (StoryJustification: as a browser spreads Chinese, not only at the spaces).
        let coordinator = context.coordinator
        if coordinator.input != text {
            coordinator.input = text
            coordinator.prepared = StoryJustification.prepared(text)
            coordinator.justifiedWidth = nil
            view.attributedText = coordinator.prepared
        }
        view.accessibilityLanguage = language
    }

    public func sizeThatFits(_ proposal: ProposedViewSize, uiView: UITextView, context: Context) -> CGSize? {
        let width = proposal.width ?? 320
        let container = uiView.textContainer
        if container.size.width != width {
            container.size = CGSize(width: width, height: .greatestFiniteMagnitude)
        }
        let coordinator = context.coordinator
        if let prepared = coordinator.prepared, coordinator.justifiedWidth != width, StoryJustification.wanted(coordinator.input ?? prepared) {
            uiView.textStorage.setAttributedString(prepared)
            StoryJustification.apply(storage: uiView.textStorage, layoutManager: uiView.layoutManager, container: container)
            coordinator.justifiedWidth = width
        }
        uiView.layoutManager.ensureLayout(for: container)
        let used = uiView.layoutManager.usedRect(for: container)
        return CGSize(width: fitsContent ? min(width, ceil(used.width)) : width, height: ceil(used.height))
    }

    public final class Coordinator: NSObject, UITextViewDelegate {
        var onOpenURL: (URL) -> Void = { _ in }
        /// The layout manager holds its delegate weakly.
        var lineBoxes: CSSLineBoxes?
        /// The text as given, as laid out (justified paragraphs ragged), and the width it was last
        /// justified for.
        var input: NSAttributedString?
        var prepared: NSAttributedString?
        var justifiedWidth: CGFloat?

        public func textView(_ textView: UITextView, primaryActionFor textItem: UITextItem, defaultAction: UIAction) -> UIAction? {
            guard case let .link(url) = textItem.content else { return defaultAction }
            return UIAction { [onOpenURL] _ in onOpenURL(url) }
        }
    }
}

/// How a run of story text looks — src/styles/story.css's `.story-prose` rules for one kind of block,
/// in the story's type (``StoryTypography``: its script, the window, the person's text size along the
/// reading curve): the body (a paragraph, a quote's words, a list item) or a heading, h2–h6 (a
/// story's `#` is drawn as an h2).
///
/// The body's lines are justified in a CJK story (the last one as it falls) and ragged in a Latin
/// one; headings start-aligned in both, with lining figures. Tracking is the story's (+0.03em in a
/// CJK body, +0.02em on its headings, none in a Latin story or in code); `strong` is the story's
/// bold; `em` the one synthesized oblique; links' words the deep terracotta every label on paper
/// wears (their wave stays terracotta, ``LinkWaveTextView``); code the story's code size on its
/// faint tint. An apostrophe inside a Latin word in a CJK story is set in that element's Latin face.
public struct ProseStyle: Sendable {
    public var typography: StoryTypography
    public var role: StoryTypography.Role
    /// A heading's level (1–6; h1 is drawn as h2). Unused for the body.
    public var level: Int
    public var color: UIColor
    /// Inside a quote: its words and headings muted, its pictures and cards at the quote's edge
    /// instead of centred in the column.
    public var inQuote = false
    /// The story's language (`ScriptRule.storyLang`), for VoiceOver: on the story's words only, never
    /// on what is around them.
    public var language: String?
    /// A table's cell (round 8 §5.2, `.story-table`): the body's face at `TableCell.scale` of its size
    /// on 1.6 lines, set as its column says (never justified), its figures tabular — a header cell in
    /// the story's bold. Nil for every other block.
    public var cell: TableCell?

    /// How a table's cell is set.
    public struct TableCell: Hashable, Sendable {
        public var header: Bool
        public var alignment: NSTextAlignment

        public init(header: Bool, alignment: NSTextAlignment) {
            self.header = header
            self.alignment = alignment
        }

        /// The table's size × the body's (`font-size: 0.94em`) and its line height (`line-height: 1.6`).
        public static let scale: CGFloat = 0.94
        public static let leading: CGFloat = 1.6
    }

    public init(typography: StoryTypography, role: StoryTypography.Role, level: Int = 2, color: UIColor = Tokens.UI.text,
                inQuote: Bool = false, language: String? = nil) {
        self.typography = typography
        self.role = role
        self.level = level
        self.color = color
        self.inQuote = inQuote
        self.language = language
    }

    /// This style's text in a table's cell (a quote's table keeps the quote's ink).
    public func tableCell(header: Bool, alignment: NSTextAlignment) -> ProseStyle {
        var s = self
        s.role = .body
        s.cell = TableCell(header: header, alignment: alignment)
        return s
    }

    /// A story's paragraphs, list items and quoted words.
    public static func body(_ typography: StoryTypography, language: String? = nil) -> ProseStyle {
        ProseStyle(typography: typography, role: .body, language: language)
    }

    /// A heading of `level` in text set as this (a quote's heading keeps the quote's muted ink).
    public func heading(level: Int) -> ProseStyle {
        var s = self
        s.role = .heading
        s.level = level
        return s
    }

    /// A quote's words: muted and upright (no synthetic slanted Chinese), at the body's size.
    public var quoted: ProseStyle {
        var s = self
        s.color = Tokens.UI.textMuted
        s.inQuote = true
        return s
    }

    public var family: AppFonts.Family { role == .heading ? typography.headingFamily : typography.bodyFamily }

    /// The CSS line height, × the font's size.
    public var lineHeight: CGFloat {
        if cell != nil { return TableCell.leading }
        return role == .heading ? typography.headingLeading : typography.bodyLeading
    }

    /// The block's face at the person's text size: what its line boxes are measured by.
    public var font: UIFont { face() }

    private func face(bold: Bool = false, oblique: Bool = false) -> UIFont {
        if let cell {
            // The body's face, smaller; the header row in the story's bold; figures tabular.
            let body = typography.bodyFont()
            let weight = bold || cell.header ? typography.boldWeight : .regular
            return Self.tabular(AppFonts.uiFont(family, size: body.pointSize * TableCell.scale, weight: weight, oblique: oblique))
        }
        if role == .heading {
            // `strong` inside a heading takes the story's bold, as story.css says of every strong.
            guard bold else { return typography.headingFont(level: level, oblique: oblique) }
            let base = typography.headingFont(level: level)
            return AppFonts.uiFont(family, size: base.pointSize, weight: typography.boldWeight, oblique: oblique, lining: true)
        }
        return typography.bodyFont(bold: bold, oblique: oblique)
    }

    /// `font-variant-numeric: tabular-nums`: figures of one width, so a column of numbers lines up.
    static func tabular(_ font: UIFont) -> UIFont {
        let features: [[UIFontDescriptor.FeatureKey: Int]] = [[.type: kNumberSpacingType, .selector: kMonospacedNumbersSelector]]
        return UIFont(descriptor: font.fontDescriptor.addingAttributes([.featureSettings: features]), size: font.pointSize)
    }

    /// The paragraph's runs as one attributed string, laid out in its CSS line boxes (``CSSTextView``
    /// sets the boxes; this the alignment and the breaking).
    public func attributed(_ runs: [InlineRun]) -> NSAttributedString {
        let base = font
        let size = base.pointSize
        let paragraph = typography.paragraphStyle(lineBox: size * lineHeight, role: role)
        // A table's words are set, not justified: its columns are its own measure.
        if let cell { paragraph.alignment = cell.alignment }
        let kern = typography.kern(role, pointSize: size)
        let out = NSMutableAttributedString()
        // Each run's own face, for the Latin face an apostrophe inside a Latin word takes in it.
        var faces: [(range: NSRange, bold: Bool, oblique: Bool, code: Bool)] = []
        for run in runs {
            let font = run.code
                ? UIFont.monospacedSystemFont(ofSize: size * typography.codeScale, weight: run.bold ? typography.boldWeight : .regular)
                : face(bold: run.bold, oblique: run.italic)
            var attrs: [NSAttributedString.Key: Any] = [
                .font: font,
                .foregroundColor: color,
                .paragraphStyle: paragraph,
                // Code keeps its own spacing (`letter-spacing: 0`).
                .kern: run.code ? 0 : kern,
            ]
            if run.code { attrs[.backgroundColor] = Self.codeTint }
            if run.strikethrough { attrs[.strikethroughStyle] = NSUnderlineStyle.single.rawValue }
            if let link = run.link, let url = URL(string: link) {
                attrs[.link] = url
                attrs[.foregroundColor] = Tokens.UI.buttonOnTonal
            }
            faces.append((NSRange(location: out.length, length: (run.text as NSString).length), run.bold, run.italic, run.code))
            out.append(NSAttributedString(string: run.text, attributes: attrs))
        }
        if typography.script == .cjk, let latin = StoryTypography.latinMarkFamily(for: family) {
            let weight = role == .heading ? typography.headingWeight : cell?.header == true ? typography.boldWeight : .regular
            for mark in StoryScript.latinMarks(out.string) {
                guard let run = faces.first(where: { NSLocationInRange(mark, $0.range) }), !run.code else { continue }
                let face = AppFonts.uiFont(latin, size: size, weight: run.bold ? typography.boldWeight : weight, oblique: run.oblique,
                                           lining: role == .heading)
                out.addAttribute(.font, value: face, range: NSRange(location: mark, length: 1))
            }
        }
        return out
    }

    /// Code's tint (`--story-code-tint`): the text's ink at 6% over the paper.
    static let codeTint = Tokens.UI.storyCodeTint
}
