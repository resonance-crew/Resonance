import Synchronization
import SwiftUI
import UIKit

// MARK: - The theme as a trait

/// The theme a window wears (Settings → 外觀 → 主題色): a trait beside the interface style, set
/// once on the window scene (`AppearanceStore`), so everything under it — SwiftUI views, UIKit
/// views, sheets, alerts, the keyboard's host — resolves the palette's colours in that theme.
/// Changing it re-resolves every dynamic colour, as a light/dark switch does.
public nonisolated struct AccentTrait: UITraitDefinition {
    public static let defaultValue: Accent = .terracotta
    public static let identifier = "com.resonance.stories.accent"
    public static let name = "Accent"
    public static let affectsColorAppearance = true
}

extension UITraitCollection {
    /// The theme (``AccentTrait``).
    public nonisolated var accent: Accent { self[AccentTrait.self] }
}

extension UIMutableTraits {
    /// The theme (``AccentTrait``).
    public nonisolated var accent: Accent {
        get { self[AccentTrait.self] }
        set { self[AccentTrait.self] = newValue }
    }
}

/// The theme in SwiftUI's environment — the trait itself, both ways: a hosted view reads the
/// window's theme, and a view given another (the share card's light terracotta) hands it on to the
/// UIKit colours it resolves.
private nonisolated struct AccentKey: EnvironmentKey, UITraitBridgedEnvironmentKey {
    static let defaultValue: Accent = .terracotta
    static func read(from traitCollection: UITraitCollection) -> Accent { traitCollection.accent }
    static func write(to mutableTraits: inout UIMutableTraits, value: Accent) { mutableTraits.accent = value }
}

extension EnvironmentValues {
    /// The theme the palette's colours resolve in (``AccentTrait``).
    public nonisolated var accent: Accent {
        get { self[AccentKey.self] }
        set { self[AccentKey.self] = newValue }
    }
}

extension Accent {
    /// Its place in palette.ts ACCENTS (the tables' order).
    nonisolated var index: Int { Self.allCases.firstIndex(of: self) ?? 0 }
}

extension PaletteScheme {
    nonisolated var index: Int { self == .light ? 0 : 1 }

    /// The scheme a trait collection draws in (anything not dark is light, as the palette's default).
    public nonisolated init(_ traits: UITraitCollection) {
        self = traits.userInterfaceStyle == .dark ? .dark : .light
    }

    public nonisolated init(_ scheme: ColorScheme) {
        self = scheme == .dark ? .dark : .light
    }
}

// MARK: - Resolving

/// The palette at draw time (Generated/PaletteTables.swift holds the tables, made from palette.ts).
/// `Tokens.<colour>` are ``color(_:)``: a SwiftUI colour backed by a UIColor provider that looks the
/// token up for the trait collection it is drawn in — its interface style and its ``AccentTrait`` —
/// so a view drawn in a dark window, or a theme chosen in Settings, recolours without being told.
public nonisolated enum Palette {
    private static let tokenCount = PaletteToken.allCases.count

    /// Every token of every theme and scheme, made once (`PaletteTables.p3`'s order).
    private static let colours: [UIColor] = stride(from: 0, to: PaletteTables.p3.count, by: 4).map { k in
        let p = PaletteTables.p3
        return UIColor(displayP3Red: CGFloat(p[k]), green: CGFloat(p[k + 1]), blue: CGFloat(p[k + 2]), alpha: CGFloat(p[k + 3]))
    }

    private static func slot(_ token: PaletteToken, _ accent: Accent, _ scheme: PaletteScheme) -> Int {
        (accent.index * 2 + scheme.index) * tokenCount + token.rawValue
    }

    /// The token as a theme draws it in a scheme (a fixed colour: what a picture that leaves the
    /// device, or a test, asks for).
    public static func resolved(_ token: PaletteToken, accent: Accent, scheme: PaletteScheme) -> UIColor {
        colours[slot(token, accent, scheme)]
    }

    /// The `oklch()` the token was made from in that theme and scheme (palette.json's value).
    public static func oklch(_ token: PaletteToken, accent: Accent, scheme: PaletteScheme) -> String {
        PaletteTables.oklch[slot(token, accent, scheme)]
    }

    /// The token as a dynamic UIColor (``Tokens/UI``).
    public static func uiColor(_ token: PaletteToken) -> UIColor {
        UIColor { traits in resolved(token, accent: traits.accent, scheme: PaletteScheme(traits)) }
    }

    /// The token as a dynamic SwiftUI colour (``Tokens``).
    public static func color(_ token: PaletteToken) -> Color { Color(uiColor: uiColor(token)) }

    /// The light terracotta colour of a token: what never changes with the reader's appearance — a
    /// picture stored for everyone (a cropped avatar's backing) or shared off the device.
    public static func shared(_ token: PaletteToken) -> UIColor {
        resolved(token, accent: .terracotta, scheme: .light)
    }

    /// One colour in light and another in dark, whatever the theme: the twin of a colour the data
    /// or a component computes, where the palette has no token for it.
    public static func schemed(light: UIColor, dark: UIColor) -> UIColor {
        UIColor { $0.userInterfaceStyle == .dark ? dark : light }
    }

    /// ``schemed(light:dark:)`` as a SwiftUI colour.
    public static func schemed(light: Color, dark: Color) -> Color {
        Color(uiColor: schemed(light: UIColor(light), dark: UIColor(dark)))
    }

    /// How strong the grain is drawn in a scheme (SCHEME_NUMBERS `grain-scale`): light specks on
    /// night paper read louder than dark ones on cream.
    public static func grainScale(_ scheme: PaletteScheme) -> Double { PaletteTables.grainScale[scheme.index] }

    /// The reading progress line's glow in a scheme (SCHEME_NUMBERS `reading-progress-glow-alpha`).
    public static func readingProgressGlowAlpha(_ scheme: PaletteScheme) -> Double {
        PaletteTables.readingProgressGlowAlpha[scheme.index]
    }

    // MARK: Mixes

    /// CSS `color-mix(in oklch, a share, b)` of two oklch colours: lightness, chroma and alpha
    /// straight, the hue the shorter way round.
    public static func mixOKLCH(_ a: (L: Double, C: Double, H: Double, alpha: Double), _ share: Double,
                                _ b: (L: Double, C: Double, H: Double, alpha: Double)) -> (L: Double, C: Double, H: Double, alpha: Double) {
        var dh = b.H - a.H
        if dh > 180 { dh -= 360 }
        if dh < -180 { dh += 360 }
        let H = ((a.H + dh * (1 - share)).truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
        return (a.L * share + b.L * (1 - share), a.C * share + b.C * (1 - share), H, a.alpha * share + b.alpha * (1 - share))
    }

    private struct MixKey: Hashable { let a: Int; let share: Int; let b: Int; let alpha: Int }
    private static let mixes = Mutex<[MixKey: Color]>([:])

    /// `color-mix(in oklch, var(--a) share, var(--b))`, taken at `alpha` — what the web writes inline
    /// over two tokens — in every theme and scheme, dynamic like the tokens.
    public static func mix(_ a: PaletteToken, _ share: Double, _ b: PaletteToken, alpha: Double = 1) -> Color {
        let key = MixKey(a: a.rawValue, share: Int((share * 10000).rounded()), b: b.rawValue, alpha: Int((alpha * 1000).rounded()))
        if let kept = mixes.withLock({ $0[key] }) { return kept }
        var made: [UIColor] = []
        for accent in Accent.allCases {
            for scheme in PaletteScheme.allCases {
                let x = OKLCHColor.components(oklch(a, accent: accent, scheme: scheme)) ?? (0, 0, 0, 1)
                let y = OKLCHColor.components(oklch(b, accent: accent, scheme: scheme)) ?? (0, 0, 0, 1)
                let m = mixOKLCH(x, share, y)
                let (r, g, bl) = OKLCHColor.displayP3(L: m.L, C: m.C, H: m.H)
                made.append(UIColor(displayP3Red: r, green: g, blue: bl, alpha: m.alpha * alpha))
            }
        }
        let table = made
        let color = Color(uiColor: UIColor { traits in table[traits.accent.index * 2 + PaletteScheme(traits).index] })
        mixes.withLock { $0[key] = color }
        return color
    }

    // MARK: Hue-made colours

    /// A HueInk's lightness and chroma in a scheme (palette.ts HUE_INKS).
    public static func hueLC(_ role: HueInk, _ scheme: PaletteScheme) -> (L: Double, C: Double) {
        let k = role.rawValue * 4 + scheme.index * 2
        return (PaletteTables.hueInks[k], PaletteTables.hueInks[k + 1])
    }

    /// The colour a role wears at `hue` in a scheme, as oklch (`hueInk`): light as it was always
    /// drawn, dark held inside Display P3.
    public static func hueOKLCH(_ role: HueInk, _ hue: Double, _ scheme: PaletteScheme) -> (L: Double, C: Double, H: Double) {
        let (L, C) = hueLC(role, scheme)
        let H = (hue.truncatingRemainder(dividingBy: 360) + 360).truncatingRemainder(dividingBy: 360)
        return scheme == .dark ? OKLCHColor.fitted(L, C, H) : (L, C, H)
    }

    private struct HueKey: Hashable { let role: Int; let hue: Int; let alpha: Int }
    private static let hueColours = Mutex<[HueKey: Color]>([:])

    /// A role of HUE_INKS at a hue the data carries (a map card's, a region's, a card's cover), dynamic
    /// by scheme. Remembered: a map draws the same few on every frame.
    public static func hue(_ role: HueInk, _ hue: Double, alpha: Double = 1) -> Color {
        let key = HueKey(role: role.rawValue, hue: Int((hue * 100).rounded()), alpha: Int((alpha * 1000).rounded()))
        if let kept = hueColours.withLock({ $0[key] }) { return kept }
        func make(_ scheme: PaletteScheme) -> UIColor {
            let c = hueOKLCH(role, hue, scheme)
            let (r, g, b) = OKLCHColor.displayP3(L: c.L, C: c.C, H: c.H)
            return UIColor(displayP3Red: r, green: g, blue: b, alpha: alpha)
        }
        let color = Color(uiColor: schemed(light: make(.light), dark: make(.dark)))
        hueColours.withLock { cache in
            if cache.count >= 1024 { cache.removeAll(keepingCapacity: true) }
            cache[key] = color
        }
        return color
    }
}
