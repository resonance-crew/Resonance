import CoreText
import SwiftUI
import UIKit

/// The web's type stack (tokens.css), rebuilt for iOS.
///
/// CSS `font-family: 'Playfair Display', 'Noto Serif TC', serif` falls back
/// *per glyph*: Latin in Playfair, CJK in Noto Serif TC. A bare
/// `Font.custom("Playfair Display")` would send CJK to the system's PingFang
/// instead, so every font here carries a cascade list mirroring the CSS stack.
public enum AppFonts {
    public enum Family: String, Sendable, CaseIterable {
        case heading = "Playfair Display"
        case body = "DM Sans"
        case handwritten = "ChenYuluoyan 2.0"
        /// A CJK story's body, quotes and lists (`--font-story-sans`): Noto Sans TC first — so the
        /// Latin letters and digits inside Chinese are its own, and 「……」「——」 sit centred — then
        /// DM Sans, then the system's.
        case bodyCJK = "Noto Sans TC"
        /// A CJK story's title and headings (`--font-story-serif`): Noto Serif TC first, then Playfair.
        case headingCJK = "Noto Serif TC"

        /// The next face of the CSS stack, glyph by glyph: what draws a character this one has none for.
        public var fallback: String {
            switch self {
            case .heading, .handwritten: "Noto Serif TC"
            case .body: "Noto Sans TC"
            case .bodyCJK: "DM Sans"
            case .headingCJK: "Playfair Display"
            }
        }

        /// The text style whose growth the family follows: headings grow like titles.
        var textStyle: UIFont.TextStyle { self == .heading || self == .headingCJK ? .title1 : .body }
    }

    /// A CSS `font-weight` (100–900, as the tokens give it: `--story-bold: 600`) as UIKit's weight,
    /// the nearest named one.
    nonisolated public static func weight(css: CGFloat) -> UIFont.Weight {
        let named: [(CGFloat, UIFont.Weight)] = [
            (100, .ultraLight), (200, .thin), (300, .light), (400, .regular), (500, .medium),
            (600, .semibold), (700, .bold), (800, .heavy), (900, .black),
        ]
        return named.min { abs($0.0 - css) < abs($1.0 - css) }!.1
    }

    /// CSS `font-variant-numeric: lining-nums` (OpenType `lnum`): figures that stand on the line at
    /// capital height — Playfair's own are old-style, so 「2400 公尺」 bobbed.
    static let liningFigures: [[UIFontDescriptor.FeatureKey: Int]] = [
        [.type: kNumberCaseType, .selector: kUpperCaseNumbersSelector],
    ]

    /// Registers the bundled fonts (the app target ships apps/shared/fonts
    /// in a `fonts` folder). Call once at launch.
    public static func register(bundle: Bundle = .main) {
        let urls = bundle.urls(forResourcesWithExtension: "ttf", subdirectory: "fonts") ?? []
        for url in urls {
            var error: Unmanaged<CFError>?
            if !CTFontManagerRegisterFontsForURL(url as CFURL, .process, &error) {
                let reason = error?.takeRetainedValue().localizedDescription ?? "unknown"
                // Already registered (e.g. SwiftUI previews) is harmless.
                if !reason.contains("already") { print("Font registration failed: \(url.lastPathComponent) \(reason)") }
            }
        }
    }

    /// The browser's synthetic italic: none of the bundled faces has an italic
    /// (Noto TC has none at all), so CSS `font-style: italic` leans every glyph
    /// by the same 0.25 shear on its baseline — done here with the font matrix.
    nonisolated static let obliqueMatrix = CGAffineTransform(a: 1, b: 0, c: 0.25, d: 1, tx: 0, ty: 0)

    /// Everything that shapes a face: what `uiFont` is asked for (the size already scaled).
    struct FontKey: Hashable {
        let family: Family
        let size: CGFloat
        let weight: CGFloat
        let oblique: Bool
        let lining: Bool
    }

    /// Each face made once: matching a descriptor with its cascade list through Core Text cost more
    /// than anything else a view's update did, and the same few faces are asked for everywhere.
    private static var faces: [FontKey: UIFont] = [:]
    /// The SwiftUI font of each face `font` gave (the same one each time, so a `Text` keeps it).
    private static var swiftUIFaces: [FontKey: Font] = [:]

    /// The face at `size`, falling back glyph by glyph as its CSS stack does (`Family.fallback`,
    /// then the system's). `lining` sets lining figures, in the fallback too (a title's digits).
    public static func uiFont(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false,
                              lining: Bool = false) -> UIFont {
        let key = FontKey(family: family, size: size, weight: weight.rawValue, oblique: oblique, lining: lining)
        if let kept = faces[key] { return kept }
        let face = makeFont(family, size: size, weight: weight, oblique: oblique, lining: lining)
        faces[key] = face
        return face
    }

    /// The face as Core Text matches it (what `uiFont` keeps).
    static func makeFont(_ family: Family, size: CGFloat, weight: UIFont.Weight, oblique: Bool, lining: Bool) -> UIFont {
        let traits: [UIFontDescriptor.TraitKey: Any] = [.weight: weight]
        var fallback: [UIFontDescriptor.AttributeName: Any] = [.family: family.fallback, .traits: traits]
        var attributes: [UIFontDescriptor.AttributeName: Any] = [.family: family.rawValue, .traits: traits]
        if oblique {
            attributes[.matrix] = obliqueMatrix
            fallback[.matrix] = obliqueMatrix
        }
        if lining {
            attributes[.featureSettings] = liningFigures
            fallback[.featureSettings] = liningFigures
        }
        attributes[.cascadeList] = [UIFontDescriptor(fontAttributes: fallback)]
        return UIFont(descriptor: UIFontDescriptor(fontAttributes: attributes), size: size)
    }

    /// The height of a CSS line box at `line-height: normal`. It is the face's
    /// ascent plus descent — until some of the text needs the fallback
    /// (DM Sans has no Han glyphs): then the browser stacks the fallback's own
    /// box on the same baseline, so the line takes the taller ascent over the
    /// taller descent (DM Sans 16 → 20.8, its Han text → 23.5). UIKit and
    /// SwiftUI keep to the primary face's box, which is why this exists.
    public static func normalLineBox(_ family: Family, size: CGFloat, text: String) -> CGFloat {
        let primary = uiFont(family, size: size)
        let box = primary.ascender - primary.descender
        let covered = CTFontCopyCharacterSet(primary as CTFont) as CharacterSet
        guard !text.unicodeScalars.allSatisfy(covered.contains) else { return box }
        let fallback = UIFont(descriptor: UIFontDescriptor(fontAttributes: [.family: family.fallback]), size: size)
        return max(primary.ascender, fallback.ascender) + max(-primary.descender, -fallback.descender)
    }

    /// `uiFont` at the person's text size: it follows Dynamic Type relative to
    /// `textStyle` (the family's own by default) along `TextScale`'s curve, not
    /// without limit like `UIFontMetrics.scaledFont`. For text drawn in CSS line
    /// boxes (`CSSText`, `ProseStyle`), whose line height is a multiple of the
    /// font's size, so it grows with it. `uiFont` stays the fixed face, for
    /// what is measured at the drawn size (the thought map).
    public static func scaledUIFont(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false,
                                    relativeTo textStyle: UIFont.TextStyle? = nil) -> UIFont {
        uiFont(family, size: size * TextScale.factor(relativeTo: textStyle ?? family.textStyle), weight: weight, oblique: oblique)
    }

    /// A story's own words — its title, headings and body — at the person's text size along the
    /// reading curve (`TextScale.readingFactor`: with the system up to 2×), where everything around
    /// them keeps `scaledUIFont`'s 1.25×. `textStyle` is the one the text grows like
    /// (`StoryTypography.Role`).
    public static func storyUIFont(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false,
                                   lining: Bool = false, relativeTo textStyle: UIFont.TextStyle) -> UIFont {
        uiFont(family, size: size * TextScale.readingFactor(relativeTo: textStyle), weight: weight, oblique: oblique, lining: lining)
    }

    /// Scales with Dynamic Type like `scaledUIFont`, for SwiftUI text, in whole
    /// points: `UIFontMetrics.scaledFont`, which this used before, rounded too,
    /// so a designed 10.5 (the tab labels) has always been drawn at 11. Text in
    /// CSS line boxes never was rounded.
    public static func font(_ family: Family, size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false,
                            relativeTo textStyle: UIFont.TextStyle? = nil) -> Font {
        let scaled = (size * TextScale.factor(relativeTo: textStyle ?? family.textStyle)).rounded()
        let key = FontKey(family: family, size: scaled, weight: weight.rawValue, oblique: oblique, lining: false)
        if let kept = swiftUIFaces[key] { return kept }
        let font = Font(uiFont(family, size: scaled, weight: weight, oblique: oblique))
        swiftUIFaces[key] = font
        return font
    }

    public static func heading(_ size: CGFloat, weight: UIFont.Weight = .bold) -> Font {
        font(.heading, size: size, weight: weight)
    }

    public static func body(_ size: CGFloat, weight: UIFont.Weight = .regular, oblique: Bool = false) -> Font {
        font(.body, size: size, weight: weight, oblique: oblique)
    }

    public static func handwritten(_ size: CGFloat) -> Font {
        font(.handwritten, size: size)
    }
}
