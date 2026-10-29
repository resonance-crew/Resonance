import Observation
import SwiftUI
import UIKit

/// How far the person's text size is let to grow the app's type.
///
/// Dynamic Type takes body text to 3.1× at its largest accessibility size, and
/// the interface (tab bar, pills, buttons, the cards' bands) is not drawn for
/// that — it turns hard to use, where Instagram and LINE hold their own type
/// back. So the system's factor `s` is halved above 1 and capped: 1.15 gives
/// 1.075, 1.3 gives 1.15, 1.5 gives 1.25, and nothing goes past 1.25. A text
/// size below the default is followed as it is. Android applies the same curve
/// to its font scale (`textScale`), so the two apps agree.
///
/// Every text the person reads takes the factor of its own text style — the
/// platform fonts (`AppFonts.font`) and the CSS-line-box text (`CSSText`)
/// alike, so a card's title grows exactly as much as the rest. A story's own
/// words — its title, headings and body on the card page and in the writer —
/// follow the reading curve instead (`reading`, up to 2×).
public nonisolated enum TextScale {
    /// The most any text grows beyond its drawn size.
    public static let ceiling: CGFloat = 1.25

    /// The curve: the system's factor in, the factor the app applies out.
    public static func effective(system: CGFloat) -> CGFloat {
        system <= 1 ? system : min(1 + (system - 1) / 2, ceiling)
    }

    /// What the system itself would scale `style` by in `category` (1 at the
    /// default size). Each style keeps its own relative growth: titles grow
    /// less than body text, as they do on the system's own screens.
    public static func system(relativeTo style: UIFont.TextStyle, in category: UIContentSizeCategory) -> CGFloat {
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        // 100 rather than 1: for one point the metrics answer in steps of a third (1, 1.33, 1.67…).
        return UIFontMetrics(forTextStyle: style).scaledValue(for: 100, compatibleWith: traits) / 100
    }

    /// The factor for `style` at the person's current text size. Reading it in
    /// a view's body makes the view re-run when the size changes.
    @MainActor public static func factor(relativeTo style: UIFont.TextStyle) -> CGFloat {
        effective(system: currentSystem(relativeTo: style))
    }

    /// `system(relativeTo:in:)` at the person's current text size, worked out once per style and size
    /// (each answer makes a trait collection and font metrics). Reads `TextSizeSetting.shared.category`
    /// every time, so a view reading it still re-runs when the size changes.
    @MainActor static func currentSystem(relativeTo style: UIFont.TextStyle) -> CGFloat {
        let category = TextSizeSetting.shared.category
        if systemFactors.category != category { systemFactors = (category, [:]) }
        if let kept = systemFactors.byStyle[style] { return kept }
        let factor = system(relativeTo: style, in: category)
        systemFactors.byStyle[style] = factor
        return factor
    }

    @MainActor private static var systemFactors: (category: UIContentSizeCategory, byStyle: [UIFont.TextStyle: CGFloat]) = (.unspecified, [:])

    // MARK: The reading curve

    /// The most a story's own words — its title, headings and body — grow beyond their drawn size.
    public static let readingCeiling: CGFloat = 2

    /// The curve a story's own words follow (the owner's call, reading-type §8): the system's
    /// factor as it is, up to 2× — one for one to AX2, where a phone's line still holds about ten
    /// CJK characters (clreq's floor) — while the interface around the story, its byline and its
    /// buttons included, keeps `effective`'s 1.25×. A size below the default is followed as it is.
    /// Android applies the same numbers.
    public static func reading(system: CGFloat) -> CGFloat {
        min(system, readingCeiling)
    }

    /// The reading factor for `style` at the person's current text size (re-run on a change, as `factor`),
    /// on a Mac drawn larger by `macReadingBoost`.
    @MainActor public static func readingFactor(relativeTo style: UIFont.TextStyle) -> CGFloat {
        reading(system: currentSystem(relativeTo: style)) * macReadingBoost
    }

    // MARK: The Mac

    /// How much larger a story's own words are drawn on a Mac (round 21, the owner's call): the Mac app is
    /// the iPad's layout at Mac Catalyst's 77 % ("Scale Interface to Match iPad"), so the window keeps the
    /// Mac's own proportions — and a story's title, headings and body, on the card page and in the writer,
    /// are drawn by the inverse, reading at their own size there (17 pt, not 13). The story's column widens
    /// with them (`StoryTypography.measure`), so a line holds as many characters. 1 on an iPhone or iPad.
    public static let macReadingBoost: CGFloat = {
        #if DEBUG
        // `-macReadingBoost 1`: a debug build drawn without it, to compare.
        if let forced = UserDefaults.standard.string(forKey: "macReadingBoost").flatMap(Double.init) { return forced }
        #endif
        return macBoost(onMac: ProcessInfo.processInfo.isMacCatalystApp)
    }()

    /// Mac Catalyst's scale for an app laid out as an iPad's.
    public static let macInterfaceScale: CGFloat = 0.77

    public static func macBoost(onMac: Bool) -> CGFloat { onMac ? 1 / macInterfaceScale : 1 }
}

/// The person's text size, watched. A `Font(UIFont)` is a fixed size, not a
/// text style SwiftUI re-resolves when Dynamic Type changes, so a view that
/// sets one would keep the old size until something else re-ran it. Reading
/// `category` through `TextScale.factor` registers that dependency instead.
@MainActor @Observable final class TextSizeSetting {
    static let shared = TextSizeSetting()

    private(set) var category: UIContentSizeCategory

    private init() {
        category = UIApplication.shared.preferredContentSizeCategory
        Task {
            for await _ in NotificationCenter.default.notifications(named: UIContentSizeCategory.didChangeNotification) {
                category = UIApplication.shared.preferredContentSizeCategory
            }
        }
    }
}
