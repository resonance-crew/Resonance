import SwiftUI

/// Colours built from the palette's tokens rather than tokens themselves. Everything that follows
/// the reader's appearance is generated from src/lib/design/palette.ts (Generated/Tokens.swift) —
/// what stands on a picture too (`photoInk`, `photoShade`, `viewerGround`, the same in both schemes);
/// nothing here hand-copies a value of it.
extension Tokens {
    /// Divider's default ink: color-mix(in oklch, field-border-hover 35%, transparent).
    public nonisolated static let dividerInk = fieldBorderHover.opacity(0.35)
}

extension UIColor {
    /// The same colour as a SwiftUI colour.
    public nonisolated var swiftUI: Color { Color(uiColor: self) }
}
