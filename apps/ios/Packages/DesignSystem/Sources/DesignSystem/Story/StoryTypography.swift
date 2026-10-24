import StoryFormat
import SwiftUI
import UIKit

/// A story's type — what the card page's reader, the writer and a share card set a story in —
/// from the generated `--story-*` tokens (tokens.css "A story's type", which the web's
/// src/styles/story.css sets every story with), by the story's script (`StoryScript`, which
/// ResonanceKit's `ScriptRule` reads from the title and story) and the window: a compact one takes
/// the phone's numbers (the web's ≤ 640 and `data-density="compact"`), medium and expanded the
/// others. The one place the app reads those tokens: a screen that sets a story takes its numbers
/// here, never from `Tokens.story*` itself, so the three surfaces can't drift apart.
///
/// Ratios are in em of the element's own size, as the CSS writes `calc(var(--x) * 1em)`; lengths
/// are points at the default text size. A story's own words grow with the person's text size along
/// the reading curve (`TextScale.readingFactor`, up to 2×: `titleFont`, `headingFont`, `bodyFont`);
/// what is around them (the byline, the meta line, buttons) is interface type under the 1.25× cap.
///
/// A CJK story: Noto Serif TC 600 for its title and headings (+0.02em, never negative) over Noto
/// Sans TC (+0.03em, justified, strict line breaks), each with its own Latin and digits; an
/// apostrophe inside a Latin word in the Latin face (`latinMarkFamily`). A Latin story: Playfair
/// 700 with lining figures over DM Sans, no tracking, ragged.
public nonisolated struct StoryTypography: Hashable, Sendable {
    public var script: StoryScript
    /// The phone's numbers.
    public var compact: Bool

    public init(script: StoryScript, compact: Bool) {
        self.script = script
        self.compact = compact
    }

    /// The numbers for a window of `layout`: compact takes the phone's.
    public init(script: StoryScript, layout: LayoutClass) {
        self.init(script: script, compact: layout == .compact)
    }

    private var cjk: Bool { script == .cjk }

    /// The story column's widest (`--measure`): 36 CJK characters at the body's size, 75 Latin.
    public static var measure: CGFloat { Tokens.measure }

    // MARK: Faces

    /// The title's face (`--font-story-serif` for CJK, `--font-heading` for Latin).
    public var titleFamily: AppFonts.Family { cjk ? .headingCJK : .heading }
    /// Headings h2–h6 (a story's `#` is drawn as an h2) take the title's face.
    public var headingFamily: AppFonts.Family { titleFamily }
    /// The body's, the quotes' and the lists' (`--font-story-sans` for CJK, `--font-body` for Latin).
    public var bodyFamily: AppFonts.Family { cjk ? .bodyCJK : .body }

    /// The face an apostrophe inside a Latin word (`StoryScript.latinMarks`) is set in, in text set
    /// in `family`: the element's Latin face (DM Sans in the body, Playfair in a heading or the
    /// title) — a CJK face draws ’ full-width, a half-em hole inside "don’t". Nil for a Latin face,
    /// whose own apostrophe is right.
    public static func latinMarkFamily(for family: AppFonts.Family) -> AppFonts.Family? {
        switch family {
        case .bodyCJK: .body
        case .headingCJK: .heading
        case .heading, .body, .handwritten: nil
        }
    }

    // MARK: The body

    /// The body's size (`--story-size`, `-compact`, `-latin`, `-latin-compact`).
    public var bodySize: CGFloat {
        switch (cjk, compact) {
        case (true, false): Tokens.storySize
        case (true, true): Tokens.storySizeCompact
        case (false, false): Tokens.storySizeLatin
        case (false, true): Tokens.storySizeLatinCompact
        }
    }

    /// The body's line height, × its size (`--story-leading` and the rest).
    public var bodyLeading: CGFloat {
        switch (cjk, compact) {
        case (true, false): Tokens.storyLeading
        case (true, true): Tokens.storyLeadingCompact
        case (false, false): Tokens.storyLeadingLatin
        case (false, true): Tokens.storyLeadingLatinCompact
        }
    }

    /// The body's letter spacing in em (`--story-tracking` for CJK body, quotes and lists; Latin 0).
    public var bodyTracking: CGFloat { cjk ? Tokens.storyTracking : 0 }
    /// `strong` (`--story-bold`).
    public var boldWeight: UIFont.Weight { AppFonts.weight(css: Tokens.storyBold) }
    /// How the body's lines meet the column: justified as Chinese is printed (clreq; the last line
    /// of a paragraph stays as it falls), a Latin story ragged (WCAG 1.4.8).
    public var alignment: NSTextAlignment { cjk ? .justified : .natural }
    /// The gap after a paragraph, a list, a quote or a code block, in em (`--story-para-gap`).
    public var paragraphGap: CGFloat { Tokens.storyParaGap }
    /// A list's indent: its marker's gutter, in em (`--story-list-indent`).
    public var listIndent: CGFloat { Tokens.storyListIndent }
    /// Above and below a list item, in em (`--story-item-gap`).
    public var itemGap: CGFloat { Tokens.storyItemGap }
    /// Code, inline or in a block, × the text around it (`--story-code`).
    public var codeScale: CGFloat { Tokens.storyCode }
    /// A line the writer left blank, in em of the body (`--story-blank-line: 1.6em`, not exported: an em length).
    public static let blankLine: CGFloat = 1.6
    /// The quote's pen rail: how wide its wavy line's box is, the same on all three platforms.
    public static let quoteRail: CGFloat = 5.2
    /// A code block's line height × the body (`pre { line-height: 1.6 }` at the body's size), its
    /// padding (12 above and below, 16 a side) and radius (`--radius-sm`).
    public static let codeBlockLeading: CGFloat = 1.6
    public static let codeBlockPadding = EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16)
    public static let codeBlockRadius: CGFloat = Tokens.radiusSm
    /// `em`'s synthesized oblique: the one shear both apps use (AppFonts' italic), the web's browser's.
    public static let italicShear: CGFloat = AppFonts.obliqueMatrix.c

    // MARK: The title

    /// The title's size (`--story-title`, `-compact`, `-latin`, `-latin-compact`).
    public var titleSize: CGFloat {
        switch (cjk, compact) {
        case (true, false): Tokens.storyTitle
        case (true, true): Tokens.storyTitleCompact
        case (false, false): Tokens.storyTitleLatin
        case (false, true): Tokens.storyTitleLatinCompact
        }
    }

    /// The title's line height, × its size.
    public var titleLeading: CGFloat { cjk ? Tokens.storyTitleLeading : Tokens.storyTitleLeadingLatin }
    /// The title's and the headings' letter spacing in em: +0.02 for CJK, 0 for Latin — never negative.
    public var titleTracking: CGFloat { cjk ? Tokens.storyHeadingTracking : 0 }
    /// The title's and the headings' weight (600 for CJK, 700 for Latin).
    public var titleWeight: UIFont.Weight {
        AppFonts.weight(css: cjk ? Tokens.storyHeadingWeight : Tokens.storyHeadingWeightLatin)
    }

    // MARK: Headings

    /// A heading's line height, × its size, both scripts.
    public var headingLeading: CGFloat { Tokens.storyHeadingLeading }
    public var headingTracking: CGFloat { titleTracking }
    public var headingWeight: UIFont.Weight { titleWeight }

    /// A heading's size × the body's: h1 and h2 `--story-h2`, h3–h6 `--story-h3`.
    public static func headingScale(level: Int) -> CGFloat { level <= 2 ? Tokens.storyH2 : Tokens.storyH3 }

    /// A heading's size at the default text size.
    public func headingSize(level: Int) -> CGFloat { bodySize * Self.headingScale(level: level) }

    /// The air above and below a heading, in em of the heading's own size: 2 above (none when it
    /// opens the story, a quote or a list item), 0.6 below an h2, 0.5 below the rest.
    public static func headingMargins(level: Int) -> (above: CGFloat, below: CGFloat) {
        (Tokens.storyHeadingAbove, level <= 2 ? Tokens.storyH2Below : Tokens.storyH3Below)
    }

    // MARK: Around the story (points)

    /// Above and below a picture, a link card or an embedded card.
    public var blockGap: CGFloat { compact ? Tokens.storyBlockGapCompact : Tokens.storyBlockGap }
    /// Above and below the pen's rule.
    public var ruleGap: CGFloat { compact ? Tokens.storyRuleGapCompact : Tokens.storyRuleGap }
    /// The reading head (round 9 §2): from the header's pen line — the wavy rule, not the bar's box —
    /// down to the title's line box (`--story-head-gap`, 48 / 64), or to the cover's top edge when the
    /// card has one (`--story-head-cover-gap`, 56 / 72: a title box carries some air above its ink, a
    /// cover none, so both reach their ink at the same depth).
    public func headGap(cover: Bool) -> CGFloat {
        switch (cover, compact) {
        case (false, true): Tokens.storyHeadGapCompact
        case (false, false): Tokens.storyHeadGap
        case (true, true): Tokens.storyHeadCoverGapCompact
        case (true, false): Tokens.storyHeadCoverGap
        }
    }
    /// The cover → the title.
    public var coverGap: CGFloat { compact ? Tokens.storyCoverGapCompact : Tokens.storyCoverGap }
    /// The title → the byline or meta row.
    public var metaGap: CGFloat { compact ? Tokens.storyMetaGapCompact : Tokens.storyMetaGap }
    /// The byline or meta row → the story.
    public var leadGap: CGFloat { compact ? Tokens.storyLeadGapCompact : Tokens.storyLeadGap }
    /// The story → its tags.
    public var endGap: CGFloat { compact ? Tokens.storyEndGapCompact : Tokens.storyEndGap }
    /// The meta line's size (read time · date): interface type, under the 1.25× cap — 13 on a phone,
    /// 14 at every regular width (round 9 §0: the byline's too, which kept the phone's 13 everywhere).
    public var metaSize: CGFloat { compact ? Tokens.storyMetaSizeCompact : Tokens.storyMetaSize }
    /// The byline's avatar (a phone's head).
    public var bylineAvatar: CGFloat { Tokens.storyBylineAvatar }
    /// The text column → the author rail (expanded windows).
    public var railGap: CGFloat { Tokens.storyRailGap }

    // MARK: Growing with the person's text size

    /// What a piece of a story grows like: the body (and quotes, lists, code) as `.body`, h2–h6
    /// as `.title3`, the title as `.title1` — each along the reading curve.
    public enum Role: Sendable, Hashable {
        case title, heading, body

        public var textStyle: UIFont.TextStyle {
            switch self {
            case .title: .title1
            case .heading: .title3
            case .body: .body
            }
        }
    }
}

@MainActor extension StoryTypography {
    /// `text`, set in `family` at `size`, with each apostrophe inside a Latin word set in that
    /// element's Latin face (`latinMarkFamily`) at the same size, weight and slant — in a CJK
    /// story only (a Latin story's face is Latin already). Call it on the attributed run you built.
    public func settingLatinMarks(in text: NSMutableAttributedString, family: AppFonts.Family, size: CGFloat,
                                  weight: UIFont.Weight = .regular, oblique: Bool = false, lining: Bool = false) {
        guard cjk, let latin = Self.latinMarkFamily(for: family) else { return }
        let marks = StoryScript.latinMarks(text.string)
        guard !marks.isEmpty else { return }
        let font = AppFonts.uiFont(latin, size: size, weight: weight, oblique: oblique, lining: lining)
        for mark in marks { text.addAttribute(.font, value: font, range: NSRange(location: mark, length: 1)) }
    }

    /// How much `role` is grown at the person's text size (the reading curve, up to 2×).
    public func scale(_ role: Role) -> CGFloat { TextScale.readingFactor(relativeTo: role.textStyle) }

    /// The title's face at the person's text size: lining figures, so 「2400 公尺」 stands level.
    public func titleFont() -> UIFont {
        AppFonts.storyUIFont(titleFamily, size: titleSize, weight: titleWeight, lining: true, relativeTo: Role.title.textStyle)
    }

    /// A heading's face at the person's text size (h1 drawn as h2).
    public func headingFont(level: Int, oblique: Bool = false) -> UIFont {
        AppFonts.storyUIFont(headingFamily, size: headingSize(level: level), weight: headingWeight, oblique: oblique, lining: true,
                             relativeTo: Role.heading.textStyle)
    }

    /// The story's vertical rhythm at the person's text size: the body's size and the spaces
    /// between its blocks — paragraph and heading margins in their own em, the block and rule gaps
    /// grown with the body (`ProseMetrics` collapses them as CSS does).
    public func rhythm() -> ProseRhythm {
        let body = bodySize * scale(.body)
        let heading = scale(.heading)
        return ProseRhythm(body: body, paragraphGap: paragraphGap, h2: headingSize(level: 2) * heading,
                           h3: headingSize(level: 3) * heading, headingAbove: Tokens.storyHeadingAbove,
                           h2Below: Tokens.storyH2Below, h3Below: Tokens.storyH3Below,
                           blockGap: blockGap * scale(.body), ruleGap: ruleGap * scale(.body), blankLine: Self.blankLine)
    }

    /// The body's face at the person's text size: regular, or `--story-bold`; `oblique` for `em`.
    public func bodyFont(bold: Bool = false, oblique: Bool = false) -> UIFont {
        AppFonts.storyUIFont(bodyFamily, size: bodySize, weight: bold ? boldWeight : .regular, oblique: oblique,
                             relativeTo: Role.body.textStyle)
    }
}

nonisolated extension StoryTypography {
    /// How the lines of `role` meet the column: the body justified in a CJK story (its last line
    /// left as it falls) and ragged in a Latin one; the title and headings start-aligned in both,
    /// as story.css sets them (`text-align: start`).
    public func alignment(_ role: Role) -> NSTextAlignment {
        role == .body ? alignment : .natural
    }

    /// The paragraph style `role` is laid out with: `lineBox` tall lines (the CSS line box,
    /// `CSSLineBoxes` centres the glyphs in it), aligned as `alignment(role)` says, and lines
    /// broken so no paragraph ends on a lone character or word (`.pushOut` — the nearest TextKit
    /// has to the web's `text-wrap: pretty` on paragraphs and list items and `balance` on the
    /// title and headings, in both scripts); TextKit's own kinsoku keeps 。and 「 where they belong.
    public func paragraphStyle(lineBox: CGFloat, role: Role = .body) -> NSMutableParagraphStyle {
        let style = NSMutableParagraphStyle()
        style.alignment = alignment(role)
        style.minimumLineHeight = lineBox
        style.maximumLineHeight = lineBox
        style.lineBreakStrategy = .pushOut
        return style
    }

    /// The letter spacing of `role` at a font of `pointSize` (already grown with the person's text
    /// size), as UIKit's `.kern` takes it: the tracking in em × the size.
    public func kern(_ role: Role, pointSize: CGFloat) -> CGFloat {
        (role == .body ? bodyTracking : titleTracking) * pointSize
    }
}
