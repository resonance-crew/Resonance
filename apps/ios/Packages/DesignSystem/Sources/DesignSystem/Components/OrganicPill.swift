import SwiftUI

/// A small word over the page that something happened, or the way to act on it — the web's
/// atoms/InkPill: a wobbly terracotta-light wash with no pen line (a fill marks a button: the whole
/// pill is one when it has an action), lying on the page like cut paper with its shadow
/// (``CutoutShadow``). The face of the thread's way back to the latest message and
/// its 已複製 (`.small`), and of every toast (`.toast`, `ToastHost`). Its numbers are the thread
/// pill's tuned recipe, moved here as they were.
public struct OrganicPill: View {
    /// The thread's pill over its foot, or a toast.
    public enum Size: Sendable, Hashable, CaseIterable {
        case small, toast
    }

    /// One size's numbers (points at the default text size; the words grow as interface type, ≤ 1.25×).
    public struct Metrics: Sendable, Hashable {
        public var fontSize: CGFloat
        public var horizontalPadding: CGFloat
        public var verticalPadding: CGFloat
        public var minHeight: CGFloat
        public var glyph: CGFloat
        public var gap: CGFloat
        /// How many lines the words may take (nil: as many as they need, the thread pill as it always was).
        public var lines: Int?

        public static func of(_ size: Size) -> Metrics {
            switch size {
            case .small: Metrics(fontSize: 12.5, horizontalPadding: 16, verticalPadding: 9, minHeight: 0, glyph: 14, gap: 6, lines: nil)
            case .toast: Metrics(fontSize: 14, horizontalPadding: 20, verticalPadding: 12, minHeight: 44, glyph: 16, gap: 8, lines: 2)
            }
        }
    }

    /// The wash: one shape, cream under terracotta-light (seed 41, the thread pill's).
    public static let shape = WobRectShape(radius: 18, seed: 41, mag: 1.2)

    let icon: IconName?
    let text: String
    /// Set in bold after the words and a " · " (a toast's 復原).
    let verb: String?
    let size: Size
    let accessibilityText: String?
    let action: (() -> Void)?

    /// `verb` follows `text` in bold; `accessibilityLabel` names the button when the words alone
    /// aren't it (the visible words first: 「已移到垃圾桶 · 復原〈title〉」).
    public init(icon: IconName? = nil, text: String, verb: String? = nil, size: Size = .small,
                accessibilityLabel: String? = nil, action: (() -> Void)? = nil) {
        self.icon = icon
        self.text = text
        self.verb = verb
        self.size = size
        accessibilityText = accessibilityLabel
        self.action = action
    }

    /// The words as drawn: the message, then " · " and the verb in bold.
    var words: AttributedString {
        let m = Metrics.of(size)
        var out = AttributedString(text)
        out.font = AppFonts.body(m.fontSize, weight: .semibold)
        if let verb {
            var dot = AttributedString(" · ")
            dot.font = AppFonts.body(m.fontSize, weight: .semibold)
            var bold = AttributedString(verb)
            bold.font = AppFonts.body(m.fontSize, weight: .bold)
            out += dot + bold
        }
        return out
    }

    public var body: some View {
        let m = Metrics.of(size)
        let face = HStack(spacing: m.gap) {
            if let icon { OrganicIcon(icon, size: m.glyph, color: Tokens.terracottaInk) }
            Text(words)
                .foregroundStyle(Tokens.terracottaInk)
                .lineLimit(m.lines)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, m.horizontalPadding).padding(.vertical, m.verticalPadding)
        .frame(minHeight: m.minHeight)
        .background {
            // A piece of cut paper on the page (round 17 addendum A1): the cream casts the paper-cut shadow.
            Self.shape.fill(Tokens.cream).cutoutShadow()
            Self.shape.fill(Tokens.terracottaLight.opacity(0.9))
        }
        .contentShape(Rectangle())
        if let action {
            Button(action: action) { face }
                .buttonStyle(.plain)
                .accessibilityLabel(accessibilityText ?? [text, verb].compactMap(\.self).joined(separator: " · "))
        } else if let accessibilityText {
            face.accessibilityElement(children: .ignore).accessibilityLabel(accessibilityText).accessibilityAddTraits(.updatesFrequently)
        } else {
            face.accessibilityAddTraits(.updatesFrequently)
        }
    }
}
