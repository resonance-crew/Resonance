import SwiftUI

/// Colours built from the palette's tokens rather than tokens themselves, and the few that are the
/// same in every scheme on purpose. Everything that follows the reader's appearance is generated
/// from src/lib/design/palette.ts (Generated/Tokens.swift); nothing here hand-copies a value of it.
extension Tokens {
    /// Divider's default ink: color-mix(in oklch, field-border-hover 35%, transparent).
    public nonisolated static let dividerInk = fieldBorderHover.opacity(0.35)

    // Fixed whatever the scheme (colourLiterals.ios.test.ts allows these lines): they stand on a
    // picture or on the viewer's own dark, never on the paper.

    /// HandDrawnImage's ✕ chip: a dark translucent pebble with a pale rim, over the picture it removes.
    public nonisolated static let imageRemoveFill = OKLCHColor.color(0.30, 0.02, 70, alpha: 0.7) // fixed: over a picture
    public nonisolated static let imageRemoveStroke = OKLCHColor.color(0.96, 0.02, 75, alpha: 0.75) // fixed: over a picture
    /// The picture viewer's own dark (Thread.module.css `.viewer`: oklch(12% 0.01 60)) — what its ✕
    /// stands on, at half strength (round 12 §1–2). Dark in both schemes.
    public nonisolated static let viewerInk = OKLCHColor.color(0.12, 0.01, 60) // fixed: the viewer's dark
    /// The ✕ glyph on the viewer's dark disc, and the viewer's own words: a light ink in both schemes.
    public nonisolated static let viewerLabel = Palette.shared(.cream).swiftUI
}

extension UIColor {
    /// The same colour as a SwiftUI colour.
    public nonisolated var swiftUI: Color { Color(uiColor: self) }
}
