import CoreText
import DesignSystem
import ResonanceKit
import Testing
import UIKit

/// A story's type comes from the web's `--story-*` tokens through one place (`StoryTypography`),
/// by its script and the window — the numbers reading-type §6 works out for the web, here as the
/// app takes them; the CJK faces fall back glyph by glyph as the CSS stacks do; and a story's own
/// words follow the person's text size up to 2× while the interface keeps its 1.25×.
@MainActor @Suite struct StoryTypographyTests {
    private func close(_ a: CGFloat, _ b: CGFloat, _ within: CGFloat = 0.06) -> Bool { abs(a - b) < within }

    /// reading-type §6 "Computed values": body size / line / tracking, the visible paragraph step,
    /// h2 and h3 size / line / above / below, and the title, for CJK and Latin on a desktop and a phone.
    @Test(arguments: [
        // script, compact, body, line, tracking, para gap, h2, h2 line, h2 above, h2 below, h3, h3 line, title, title line
        (StoryScript.cjk, false, 18.0, 33.3, 0.54, 23.4, 23.4, 32.8, 46.8, 14.0, 20.2, 28.2, 36.0, 50.4),
        (StoryScript.cjk, true, 17.0, 30.6, 0.51, 22.1, 22.1, 30.9, 44.2, 13.3, 19.0, 26.7, 28.0, 39.2),
        (StoryScript.latin, false, 20.0, 33.0, 0.0, 26.0, 26.0, 36.4, 52.0, 15.6, 22.4, 31.4, 40.0, 48.0),
        (StoryScript.latin, true, 18.0, 28.8, 0.0, 23.4, 23.4, 32.8, 46.8, 14.0, 20.2, 28.2, 32.0, 38.4),
    ] as [(StoryScript, Bool, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)])
    func theNumbersAreTheWebs(_ c: (StoryScript, Bool, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat, CGFloat)) {
        let t = StoryTypography(script: c.0, compact: c.1)
        #expect(t.bodySize == c.2)
        #expect(close(t.bodySize * t.bodyLeading, c.3))
        #expect(close(t.bodySize * t.bodyTracking, c.4))
        #expect(close(t.bodySize * t.paragraphGap, c.5))
        let h2 = t.headingSize(level: 2)
        #expect(close(h2, c.6))
        #expect(close(h2 * t.headingLeading, c.7))
        #expect(close(h2 * StoryTypography.headingMargins(level: 2).above, c.8))
        #expect(close(h2 * StoryTypography.headingMargins(level: 2).below, c.9))
        let h3 = t.headingSize(level: 3)
        #expect(close(h3, c.10))
        #expect(close(h3 * t.headingLeading, c.11))
        // A story's `#` is drawn as an h2; h4–h6 as h3.
        #expect(t.headingSize(level: 1) == h2 && t.headingSize(level: 6) == h3)
        #expect(t.titleSize == c.12)
        #expect(close(t.titleSize * t.titleLeading, c.13))
    }

    @Test func aCJKStoryIsAMingTitleOverAHeiBodyJustifiedAndALatinOnePlayfairOverDMSansRagged() {
        let zh = StoryTypography(script: .cjk, layout: .expanded)
        #expect(zh.titleFamily == .headingCJK && zh.headingFamily == .headingCJK && zh.bodyFamily == .bodyCJK)
        #expect(zh.titleWeight == .semibold && zh.headingWeight == .semibold && zh.boldWeight == .semibold)
        #expect(zh.titleTracking == 0.02 && zh.headingTracking == 0.02 && zh.bodyTracking == 0.03)
        #expect(zh.alignment == .justified)
        let en = StoryTypography(script: .latin, layout: .medium)
        #expect(en.titleFamily == .heading && en.bodyFamily == .body)
        #expect(en.titleWeight == .bold && en.boldWeight == .semibold)
        #expect(en.titleTracking == 0 && en.bodyTracking == 0)
        #expect(en.alignment == .natural)
        // Never negative tracking on a title, whichever the script.
        for script in StoryScript.allCases { #expect(StoryTypography(script: script, compact: false).titleTracking >= 0) }
        // An apostrophe inside a Latin word takes the element's Latin face; a Latin face keeps its own.
        #expect(StoryTypography.latinMarkFamily(for: .bodyCJK) == .body)
        #expect(StoryTypography.latinMarkFamily(for: .headingCJK) == .heading)
        #expect(StoryTypography.latinMarkFamily(for: .body) == nil && StoryTypography.latinMarkFamily(for: .heading) == nil)
        #expect(StoryTypography.italicShear == 0.25)
    }

    @Test func thePhoneTakesTheCompactNumbersAndEveryWiderWindowTheOthers() {
        let phone = StoryTypography(script: .cjk, layout: .compact)
        #expect(phone.compact)
        #expect(phone.blockGap == 24 && phone.ruleGap == 32 && phone.coverGap == 20 && phone.leadGap == 32 && phone.endGap == 32)
        #expect(phone.metaSize == 13)
        for layout in [LayoutClass.medium, .expanded] {
            let wide = StoryTypography(script: .cjk, layout: layout)
            #expect(!wide.compact)
            #expect(wide.blockGap == 32 && wide.ruleGap == 40 && wide.coverGap == 28 && wide.leadGap == 40 && wide.endGap == 40)
            #expect(wide.metaSize == 14)
        }
        #expect(phone.metaGap == 16 && phone.bylineAvatar == 40 && phone.railGap == 48)
        #expect(phone.listIndent == 1.6 && phone.itemGap == 0.3 && phone.codeScale == 0.88)
        #expect(StoryTypography.measure == 680)
    }

    /// Each face is the bundled one, falling back glyph by glyph as its CSS stack does.
    @Test func theCJKFacesAreTheBundledNotoFirst() {
        let zh = StoryTypography(script: .cjk, compact: false)
        #expect(zh.bodyFont().familyName == "Noto Sans TC")
        #expect(zh.titleFont().familyName == "Noto Serif TC")
        #expect(zh.headingFont(level: 2).familyName == "Noto Serif TC")
        let en = StoryTypography(script: .latin, compact: false)
        #expect(en.bodyFont().familyName == "DM Sans")
        #expect(en.titleFont().familyName == "Playfair Display")
        // Han in a Latin story's title still comes from Noto Serif TC, never the system's PingFang;
        // a CJK story's own Latin letters are Noto's.
        #expect(drawingFamily(en.titleFont(), "雨") == "Noto Serif TC")
        #expect(drawingFamily(zh.bodyFont(), "iPhone 2400") == "Noto Sans TC")
        #expect(AppFonts.Family.bodyCJK.fallback == "DM Sans" && AppFonts.Family.headingCJK.fallback == "Playfair Display")
    }

    /// Playfair's own figures are old-style, so 「2400 公尺」 bobbed: titles and headings set lining ones.
    @Test func titlesSetLiningFigures() {
        let plain = AppFonts.uiFont(.heading, size: 40, weight: .bold)
        let lining = StoryTypography(script: .latin, compact: false).titleFont()
        #expect(glyphs(plain, "2400") != glyphs(lining, "2400"))
        #expect(glyphs(AppFonts.uiFont(.heading, size: 40, weight: .bold, lining: true), "2400") == glyphs(lining, "2400"))
    }

    @Test func theStorysOwnWordsGrowOnTheReadingCurve() {
        let zh = StoryTypography(script: .cjk, compact: true)
        #expect(close(zh.bodyFont().pointSize, 17 * TextScale.readingFactor(relativeTo: .body), 0.01))
        #expect(close(zh.titleFont().pointSize, 28 * TextScale.readingFactor(relativeTo: .title1), 0.01))
        #expect(close(zh.headingFont(level: 3).pointSize, zh.headingSize(level: 3) * TextScale.readingFactor(relativeTo: .title3), 0.01))
        #expect(zh.scale(.body) == TextScale.readingFactor(relativeTo: .body))
        #expect(StoryTypography.Role.title.textStyle == .title1 && StoryTypography.Role.heading.textStyle == .title3
            && StoryTypography.Role.body.textStyle == .body)
    }

    @Test func aCJKParagraphIsJustifiedALatinOneRaggedAndTitlesAndHeadingsStartAligned() {
        let zhType = StoryTypography(script: .cjk, compact: false)
        let zh = zhType.paragraphStyle(lineBox: 33.3)
        #expect(zh.alignment == .justified)
        #expect(zh.minimumLineHeight == 33.3 && zh.maximumLineHeight == 33.3)
        let en = StoryTypography(script: .latin, compact: false).paragraphStyle(lineBox: 33)
        #expect(en.alignment == .natural)
        // No paragraph ends on a lone character or word, in either script (`text-wrap: pretty`).
        #expect(zh.lineBreakStrategy == .pushOut && en.lineBreakStrategy == .pushOut)
        // The title and headings start-aligned (story.css `text-align: start`), never justified.
        for role in [StoryTypography.Role.title, .heading] {
            #expect(zhType.paragraphStyle(lineBox: 50.4, role: role).alignment == .natural)
            #expect(zhType.alignment(role) == .natural)
        }
        #expect(zhType.alignment(.body) == .justified)
        // Tracking as UIKit's kern: em × the grown size; the title's +0.02em, the body's +0.03em, Latin none.
        #expect(close(zhType.kern(.body, pointSize: 20), 0.6, 0.0001))
        #expect(close(zhType.kern(.title, pointSize: 40), 0.8, 0.0001))
        #expect(close(zhType.kern(.heading, pointSize: 30), 0.6, 0.0001))
        #expect(StoryTypography(script: .latin, compact: true).kern(.body, pointSize: 20) == 0)
        #expect(StoryTypography(script: .latin, compact: true).kern(.title, pointSize: 40) == 0)
    }

    /// The CJK title is Noto Serif TC at 600 and the CJK body Noto Sans TC at 400 — the bundled
    /// variable faces drawn at those weights, not merely named.
    @Test func theCJKFacesAreDrawnAtTheirWeights() throws {
        func weight(_ font: UIFont) -> Double? {
            let variation = CTFontCopyVariation(font as CTFont) as? [NSNumber: NSNumber]
            // 'wght' as a four-character code.
            return variation?[NSNumber(value: 0x7767_6874)]?.doubleValue
        }
        let zh = StoryTypography(script: .cjk, compact: false)
        let title = try #require(weight(zh.titleFont()))
        let heading = try #require(weight(zh.headingFont(level: 2)))
        let body = try #require(weight(zh.bodyFont()))
        let bold = try #require(weight(zh.bodyFont(bold: true)))
        #expect(abs(title - 600) < 1 && abs(heading - 600) < 1)
        #expect(abs(body - 400) < 1 && abs(bold - 600) < 1)
    }

    @Test func anApostropheInsideALatinWordIsSetInTheLatinFaceInACJKStoryOnly() {
        let text = "教練只說：don’t rush. 他’s"
        let zh = StoryTypography(script: .cjk, compact: false)
        let run = NSMutableAttributedString(string: text, attributes: [.font: AppFonts.uiFont(.bodyCJK, size: 18)])
        zh.settingLatinMarks(in: run, family: .bodyCJK, size: 18, weight: .semibold)
        let mark = (text as NSString).range(of: "’").location
        #expect((run.attribute(.font, at: mark, effectiveRange: nil) as? UIFont)?.familyName == "DM Sans")
        #expect((run.attribute(.font, at: mark, effectiveRange: nil) as? UIFont)?.pointSize == 18)
        #expect((run.attribute(.font, at: 0, effectiveRange: nil) as? UIFont)?.familyName == "Noto Sans TC")
        // 他’s keeps the CJK form, as CJK typesetting wants.
        let cjkMark = (text as NSString).range(of: "’", options: .backwards).location
        #expect((run.attribute(.font, at: cjkMark, effectiveRange: nil) as? UIFont)?.familyName == "Noto Sans TC")
        // A heading's mark takes Playfair.
        let heading = NSMutableAttributedString(string: "don’t", attributes: [.font: AppFonts.uiFont(.headingCJK, size: 23)])
        zh.settingLatinMarks(in: heading, family: .headingCJK, size: 23, weight: .semibold, lining: true)
        #expect((heading.attribute(.font, at: 3, effectiveRange: nil) as? UIFont)?.familyName == "Playfair Display")
        // A Latin story is left as it is.
        let en = NSMutableAttributedString(string: "don’t", attributes: [.font: AppFonts.uiFont(.body, size: 20)])
        StoryTypography(script: .latin, compact: false).settingLatinMarks(in: en, family: .body, size: 20)
        #expect(en.attributes(at: 3, effectiveRange: nil).count == 1)
    }

    @Test func cssWeightsReadAsTheNearestNamedOne() {
        #expect(AppFonts.weight(css: 400) == .regular)
        #expect(AppFonts.weight(css: 600) == .semibold)
        #expect(AppFonts.weight(css: 700) == .bold)
        #expect(AppFonts.weight(css: 650) == .semibold || AppFonts.weight(css: 650) == .bold)
        #expect(AppFonts.weight(css: 100) == .ultraLight && AppFonts.weight(css: 900) == .black)
    }

    /// The face CoreText draws `text` with in `font` (its first run's).
    private func drawingFamily(_ font: UIFont, _ text: String) -> String? {
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [.font: font]))
        guard let run = (CTLineGetGlyphRuns(line) as? [CTRun])?.first,
              let used = (CTRunGetAttributes(run) as NSDictionary)[kCTFontAttributeName] else { return nil }
        return CTFontCopyFamilyName(used as! CTFont) as String
    }

    /// The glyphs CoreText lays `text` out in with `font` (its features applied).
    private func glyphs(_ font: UIFont, _ text: String) -> [CGGlyph] {
        let line = CTLineCreateWithAttributedString(NSAttributedString(string: text, attributes: [.font: font]))
        return ((CTLineGetGlyphRuns(line) as? [CTRun]) ?? []).flatMap { run in
            var glyphs = [CGGlyph](repeating: 0, count: CTRunGetGlyphCount(run))
            CTRunGetGlyphs(run, CFRange(location: 0, length: 0), &glyphs)
            return glyphs
        }
    }
}
