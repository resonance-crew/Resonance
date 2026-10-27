import SwiftUI

/// A small word over the page that something happened, or the way to act on it — the web's
/// atoms/InkPill, made as a card is (round 18, the owner's): a fill of its own colour — the accent's light
/// wash — inside one hand-drawn pen line of the accent at ``Tokens/ink``, and flat, as the whole page is:
/// what floats is told by its line, never a shadow. The whole pill is a button when it has an action. The
/// face of the thread's way back to the latest message and its 已複製 (`.small`, round), and of every
/// toast (`.toast`, `ToastHost`: a card's corners, 16). Its numbers are the thread pill's tuned recipe.
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

    /// The thread pill's shape (seed 41): round — its radius never more than half its height.
    public static let shape = WobRectShape(radius: 18, seed: 41, mag: 1.2)

    /// A toast's shape: a card's corners (16), the same seed.
    public static let toastShape = WobRectShape(radius: toastRadius, seed: 41, mag: 1.2)
    public static let toastRadius: Double = 16

    /// Its shape at `size`.
    public static func shape(_ size: Size) -> WobRectShape { size == .toast ? toastShape : shape }

    /// Its fill and pen line (round 18): the accent's light wash inside a line of the accent.
    public static let fill = Tokens.terracottaLight
    public static let pen = Tokens.terracotta

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
            // Made as a card is: the wash, then its pen line over it. No shadow.
            Self.shape(size).fill(Self.fill)
            Self.shape(size).stroke(Self.pen, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
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

/// The ink pill around a glyph alone (the web's InkPill with no words): a face 36 across inside a 44
/// touch target — the thread's way back to the latest message, an arrow, small over the thread (the
/// owner, 2026-10-28). Its face is an avatar's hand (``HandDrawnAvatar``'s recipe) a step rounder: its
/// corners 42 % of its size (an avatar's 40 %, a circle's 50 %), their jitter and shift calmer (2 and
/// 4 %, an avatar's 3.2 and 6 %) — organic, not a coin. `accessibilityLabel` is its name for VoiceOver.
public struct OrganicPillGlyph: View {
    /// The face's size, its glyph's, and the touch target around it.
    public static let face: CGFloat = 36
    public static let glyph: CGFloat = 18
    public static let target: CGFloat = 44
    /// Its face's outline (the web's `glyphFace`).
    public static let shape = WobRectShape(radius: face * 0.42, seed: 41, mag: face * 0.022, options: WobRectOptions(
        curve: 1.3, cornerJitter: 2, cornerOffset: face * 0.04, segmentsH: .count(1), segmentsV: .count(1)))

    let icon: IconName
    let label: String
    let action: () -> Void

    public init(icon: IconName, accessibilityLabel: String, action: @escaping () -> Void) {
        self.icon = icon
        label = accessibilityLabel
        self.action = action
    }

    public var body: some View {
        Button(action: action) {
            OrganicIcon(icon, size: Self.glyph, color: Tokens.terracottaInk)
                .frame(width: Self.face, height: Self.face)
                .background {
                    Self.shape.fill(OrganicPill.fill)
                    Self.shape.stroke(OrganicPill.pen, style: StrokeStyle(lineWidth: Tokens.ink, lineCap: .round, lineJoin: .round))
                }
                .frame(width: Self.target, height: Self.target)
                .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(label)
    }
}
