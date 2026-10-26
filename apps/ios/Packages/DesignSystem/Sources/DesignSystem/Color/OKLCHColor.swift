import Synchronization
import SwiftUI

/// CSS `oklch(L C H [/ a])` → Display P3, the same conversion
/// scripts/native/tokens.ts uses for the static tokens. For colors that
/// arrive as data (a profile's accent color is stored as its CSS string).
public nonisolated enum OKLCHColor {
    /// Each string's colour, read once: avatars and cards ask for the same few on every update, and
    /// the pattern match is the costly part. Bounded — data colours are few, but they are data.
    private static let parsed = Mutex<[String: Color?]>([:])
    private static let parsedLimit = 512

    public static func parse(_ css: String) -> Color? {
        if let kept = parsed.withLock({ $0[css] }) { return kept }
        let color = read(css)
        parsed.withLock { cache in
            if cache.count >= parsedLimit { cache.removeAll(keepingCapacity: true) }
            cache[css] = color
        }
        return color
    }

    /// `parse` without the memory.
    static func read(_ css: String) -> Color? {
        guard let c = components(css) else { return nil }
        return color(c.L, c.C, c.H, alpha: c.alpha)
    }

    /// `oklch(L C H / alpha)` with L as a fraction (0.58 for 58%).
    public static func color(_ L: Double, _ C: Double, _ H: Double, alpha: Double = 1) -> Color {
        let (r, g, b) = displayP3(L: L, C: C, H: H)
        return Color(.displayP3, red: r, green: g, blue: b, opacity: alpha)
    }

    /// Display P3 (encoded, each channel clamped to the gamut).
    static func displayP3(L: Double, C: Double, H: Double) -> (Double, Double, Double) {
        let p3 = linearP3(L: L, C: C, H: H)
        func encode(_ x: Double) -> Double {
            let v = min(1, max(0, x))
            return v <= 0.0031308 ? 12.92 * v : 1.055 * pow(v, 1 / 2.4) - 0.055
        }
        return (encode(p3.0), encode(p3.1), encode(p3.2))
    }

    /// Linear Display P3, unclamped (outside 0…1 is outside the gamut).
    static func linearP3(L: Double, C: Double, H: Double) -> (Double, Double, Double) {
        let a = C * cos(H * .pi / 180), b = C * sin(H * .pi / 180)
        let l = pow(L + 0.3963377774 * a + 0.2158037573 * b, 3)
        let m = pow(L - 0.1055613458 * a - 0.0638541728 * b, 3)
        let s = pow(L - 0.0894841775 * a - 1.291485548 * b, 3)
        let sr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
        let sg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
        let sb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
        return (0.8224621 * sr + 0.177538 * sg,
                0.0331941 * sr + 0.9668058 * sg,
                0.0170827 * sr + 0.0723974 * sg + 0.9105199 * sb)
    }

    /// Inside Display P3 (palette.ts `inP3`).
    public static func inP3(_ L: Double, _ C: Double, _ H: Double) -> Bool {
        let p = linearP3(L: L, C: C, H: H)
        return [p.0, p.1, p.2].allSatisfy { $0 >= -1e-4 && $0 <= 1 + 1e-4 }
    }

    /// The colour with its chroma lowered until it fits Display P3, lightness and hue kept
    /// (palette.ts `fitGamut`).
    public static func fitted(_ L: Double, _ C: Double, _ H: Double) -> (L: Double, C: Double, H: Double) {
        if inP3(L, C, H) { return (L, C, H) }
        var lo = 0.0, hi = C
        for _ in 0..<24 {
            let mid = (lo + hi) / 2
            if inP3(L, mid, H) { lo = mid } else { hi = mid }
        }
        return (L, lo, H)
    }

    // MARK: Avatars

    /// A stored avatar colour as a scheme draws it (palette.ts `avatarFill`): the stored pastel in
    /// light; in dark the same hue at the ladder's avatar step (40%, chroma × 0.85), so chalk initials
    /// read on it and a person keeps their colour across schemes. Nil for what isn't an oklch().
    public static func avatarFill(_ stored: String, _ scheme: PaletteScheme) -> (L: Double, C: Double, H: Double, alpha: Double)? {
        guard let c = components(stored) else { return nil }
        guard scheme == .dark else { return c }
        let f = fitted(0.4, c.C * 0.85, c.H)
        return (f.L, f.C, f.H, c.alpha)
    }

    private static let avatars = Mutex<[String: Color?]>([:])

    /// A stored avatar colour (a profile's `accentColor`) as a dynamic colour: the pastel in light, its
    /// night twin in dark (``avatarFill(_:_:)``). Nil for what isn't an oklch().
    public static func avatar(_ stored: String?) -> Color? {
        guard let stored else { return nil }
        if let kept = avatars.withLock({ $0[stored] }) { return kept }
        var color: Color?
        if let light = avatarFill(stored, .light), let dark = avatarFill(stored, .dark) {
            func ui(_ c: (L: Double, C: Double, H: Double, alpha: Double)) -> UIColor {
                let (r, g, b) = displayP3(L: c.L, C: c.C, H: c.H)
                return UIColor(displayP3Red: r, green: g, blue: b, alpha: c.alpha)
            }
            color = Color(uiColor: Palette.schemed(light: ui(light), dark: ui(dark)))
        }
        avatars.withLock { cache in
            if cache.count >= parsedLimit { cache.removeAll(keepingCapacity: true) }
            cache[stored] = color
        }
        return color
    }

    /// An `oklch(L C H [/ a])` string's numbers, L as a fraction.
    public static func components(_ css: String) -> (L: Double, C: Double, H: Double, alpha: Double)? {
        let pattern = /oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?\s*\)/
        guard let m = css.firstMatch(of: pattern),
              var L = Double(m.1), let C = Double(m.3), let H = Double(m.4) else { return nil }
        if m.2 == "%" { L /= 100 }
        return (L, C, H, m.5.flatMap { Double($0) } ?? 1)
    }
}
