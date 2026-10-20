import DesignSystem
import Testing
import UIKit

@MainActor @Suite struct TextScaleTests {
    private func close(_ a: CGFloat, _ b: CGFloat) -> Bool { abs(a - b) < 0.001 }

    /// The owner's rule: follow a smaller size, half of what a larger one adds, never past 1.25.
    @Test func curveHalvesTheSystemsGrowthAndCapsIt() {
        #expect(close(TextScale.effective(system: 0.8), 0.8))
        #expect(close(TextScale.effective(system: 1), 1))
        #expect(close(TextScale.effective(system: 1.15), 1.075))
        #expect(close(TextScale.effective(system: 1.3), 1.15))
        #expect(close(TextScale.effective(system: 1.5), 1.25))
        #expect(close(TextScale.effective(system: 2), 1.25))
        #expect(close(TextScale.effective(system: 3.1), 1.25))
    }

    @Test func curveNeverJumpsOrShrinksAsTheSystemGrows() {
        var last: CGFloat = 0
        for step in 0...400 {
            let value = TextScale.effective(system: 0.7 + CGFloat(step) * 0.01)
            #expect(value >= last)
            last = value
        }
        #expect(close(TextScale.effective(system: 1.0001), 1.00005))
    }

    @Test func systemFactorIsThatOfTheStylesOwnCurve() {
        #expect(close(TextScale.system(relativeTo: .body, in: .large), 1))
        #expect(close(TextScale.system(relativeTo: .title1, in: .large), 1))
        // Body is 17pt at the default size and about 22.4pt at xxxLarge.
        let large = TextScale.system(relativeTo: .body, in: .extraExtraExtraLarge)
        #expect(large > 1.25 && large < 1.4)
        #expect(TextScale.system(relativeTo: .body, in: .extraSmall) < 1)
        // Titles grow less than body text at the same setting.
        let body = TextScale.system(relativeTo: .body, in: .accessibilityExtraExtraExtraLarge)
        let title = TextScale.system(relativeTo: .title1, in: .accessibilityExtraExtraExtraLarge)
        #expect(title < body)
        #expect(body > 2)
    }

    @Test func everyTextSizeEndsUpWithinTheCap() {
        let categories: [UIContentSizeCategory] = [
            .extraSmall, .small, .medium, .large, .extraLarge, .extraExtraLarge, .extraExtraExtraLarge,
            .accessibilityMedium, .accessibilityLarge, .accessibilityExtraLarge,
            .accessibilityExtraExtraLarge, .accessibilityExtraExtraExtraLarge,
        ]
        for style in [UIFont.TextStyle.body, .title1] {
            for category in categories {
                let factor = TextScale.effective(system: TextScale.system(relativeTo: style, in: category))
                #expect(factor <= TextScale.ceiling)
            }
        }
        // xxxLarge, the largest setting before the accessibility ones: half its growth.
        let system = TextScale.system(relativeTo: .body, in: .extraExtraExtraLarge)
        #expect(close(TextScale.effective(system: system), 1 + (system - 1) / 2))
        // The first accessibility size is already past the cap.
        #expect(close(TextScale.effective(system: TextScale.system(relativeTo: .body, in: .accessibilityMedium)), TextScale.ceiling))
    }

    /// The owner's call for a story's own words (reading-type §8): the system's size one for one up to
    /// 2× — to AX2, where a phone's line still holds about ten CJK characters — never past it; a
    /// smaller size followed as it is. The interface keeps its 1.25×.
    @Test func aStorysWordsFollowTheSystemUpToTwiceTheirSize() {
        #expect(close(TextScale.reading(system: 0.8), 0.8))
        #expect(close(TextScale.reading(system: 1), 1))
        #expect(close(TextScale.reading(system: 1.3), 1.3))
        #expect(close(TextScale.reading(system: 1.94), 1.94))
        #expect(close(TextScale.reading(system: 2), 2))
        #expect(close(TextScale.reading(system: 3.1), TextScale.readingCeiling))
        #expect(TextScale.readingCeiling == 2)
        // At AX2 a story's body follows the system; at AX3 it stops at 2; the interface stopped at 1.25 long before.
        let ax2 = TextScale.system(relativeTo: .body, in: .accessibilityLarge)
        #expect(ax2 > 1.8 && ax2 < 2)
        #expect(close(TextScale.reading(system: ax2), ax2))
        #expect(close(TextScale.effective(system: ax2), TextScale.ceiling))
        let ax3 = TextScale.system(relativeTo: .body, in: .accessibilityExtraLarge)
        #expect(close(TextScale.reading(system: ax3), 2))
        // Headings grow like .title3 and the title like .title1: less than the body, so the hierarchy holds.
        for category: UIContentSizeCategory in [.extraExtraExtraLarge, .accessibilityLarge] {
            let body = TextScale.reading(system: TextScale.system(relativeTo: .body, in: category))
            let heading = TextScale.reading(system: TextScale.system(relativeTo: .title3, in: category))
            let title = TextScale.reading(system: TextScale.system(relativeTo: .title1, in: category))
            #expect(title <= heading && heading <= body)
            #expect(18 * 1.3 * heading > 18 * body)
        }
    }

    /// A story's own words take the reading factor; at the current size the two agree up to 1.25.
    @Test func storyFontsTakeTheReadingFactor() {
        let reading = TextScale.readingFactor(relativeTo: .body)
        #expect(close(AppFonts.storyUIFont(.bodyCJK, size: 17, relativeTo: .body).pointSize, 17 * reading))
        #expect(reading >= TextScale.factor(relativeTo: .body))
    }

    /// CSS-line-box text takes the same factor as the platform fonts.
    @Test func scaledFontsFollowTheCurrentTextSize() {
        let factor = TextScale.factor(relativeTo: .body)
        let font = AppFonts.scaledUIFont(.body, size: 14)
        #expect(close(font.pointSize, 14 * factor))
        #expect(close(AppFonts.scaledUIFont(.heading, size: 18, relativeTo: .body).pointSize, 18 * factor))
        // The fixed face is what the thought map measures with.
        #expect(close(AppFonts.uiFont(.body, size: 14).pointSize, 14))
    }
}
