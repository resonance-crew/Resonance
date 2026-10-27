import SwiftUI
import UIKit

/// The writer's tag field (round 16 §1): the chat composer's capsule (``ComposerCapsule``) — the field's
/// wobble at radius 16, the cream paper, its pen at INK in the field's border, darker while written in
/// (never terracotta), exactly 48 tall on one line — with no ＋, the text (`field`) from its start, and
/// one end segment behind a wavy seam. With nothing typed (or an input method still composing) the
/// segment is the tonal face, ✦ and 「AI 建議」, asking the model for tags — the pen loop takes the ✦'s
/// place while it thinks, the words staying; with a word typed it is the solid face, ＋ and 「新增」
/// (a 140 ms change). The segment is as wide as the wider of its two faces plus 28, so the seam never
/// moves as typing starts. The chosen tags are drawn above it by the page, never inside it.
public struct TagEntryCapsule<Field: View>: View {
    let focused: Bool
    let ready: Bool
    let thinking: Bool
    let suggestLabel: String
    let suggestAccessibility: String
    let addLabel: String
    let addAccessibility: String
    let seed: Double
    let onSegment: () -> Void
    @ViewBuilder let field: Field
    @State private var pressed = false

    /// - Parameters:
    ///   - ready: a word is typed and committed (not mid-composition): the segment adds it.
    ///   - thinking: the model is working on suggestions (the pen loop in the ✦'s place).
    public init(focused: Bool, ready: Bool, thinking: Bool, suggestLabel: String, suggestAccessibility: String,
                addLabel: String, addAccessibility: String, seed: Double = 53, onSegment: @escaping () -> Void,
                @ViewBuilder field: () -> Field) {
        self.focused = focused
        self.ready = ready
        self.thinking = thinking
        self.suggestLabel = suggestLabel
        self.suggestAccessibility = suggestAccessibility
        self.addLabel = addLabel
        self.addAccessibility = addAccessibility
        self.seed = seed
        self.onSegment = onSegment
        self.field = field()
    }

    public var body: some View {
        let width = TagEntryMetrics.segmentWidth(suggest: suggestLabel, add: addLabel)
        HStack(spacing: 0) {
            field
                .frame(maxWidth: .infinity, minHeight: ComposerMetrics.height, alignment: .leading)
                .padding(.leading, TagEntryMetrics.textStart)
                .padding(.trailing, ComposerMetrics.textTrailing)
            Button(action: onSegment) {
                // The two faces crossfade by their opacity alone, never by a frame (round 17 review A2: an
                // animation over the whole segment slid it in from where the field had been as 新增 committed).
                ZStack {
                    face(icon: .sparkle, label: suggestLabel, ink: Tokens.buttonOnTonal, loading: thinking)
                        .animation(ComposerCapsuleFace.faceChange) { $0.opacity(ready ? 0 : 1) }
                    face(icon: .plus, label: addLabel, ink: Tokens.cream, loading: false)
                        .animation(ComposerCapsuleFace.faceChange) { $0.opacity(ready ? 1 : 0) }
                }
                .frame(width: width, height: ComposerMetrics.height)
                .contentShape(Rectangle())
            }
            .buttonStyle(TagSegmentPress(pressed: $pressed))
            // Placed by the capsule at once, whatever the press's own transaction carries: its faces never
            // glide in from where the field stood before the pills above it moved it.
            .geometryGroup()
            .accessibilityLabel(ready ? addAccessibility : suggestAccessibility)
        }
        .frame(height: ComposerMetrics.height)
        .background {
            ComposerCapsuleFace(seed: seed, focused: focused, canSend: ready, pressed: pressed, segmentWidth: width)
        }
    }

    /// One face of the segment: its glyph (or, thinking, the pen loop in its place) 6 before its words.
    private func face(icon: IconName, label: String, ink: Color, loading: Bool) -> some View {
        HStack(spacing: TagEntryMetrics.iconGap) {
            ZStack {
                if loading {
                    ButtonLoader(size: TagEntryMetrics.loaderSize, color: ink).transition(.opacity)
                } else {
                    OrganicIcon(icon, size: TagEntryMetrics.glyph, color: ink, strokeWidth: Tokens.ink)
                }
            }
            .frame(width: TagEntryMetrics.glyph, height: TagEntryMetrics.glyph)
            // The pen loop comes and goes in 150 ms; the glyph's box is placed by the segment at once.
            .animation(.easeOut(duration: 0.15), value: loading)
            .geometryGroup()
            Text(label)
                .font(AppFonts.body(TagEntryMetrics.labelSize, weight: .semibold))
                .tracking(TagEntryMetrics.labelSize * 0.02)
                .foregroundStyle(ink)
                .lineLimit(1)
                .fixedSize()
        }
        .accessibilityHidden(true)
    }

}

/// The tag field's measures (round 16 §1), the same on the web and Android.
public enum TagEntryMetrics {
    /// Where the text starts in the capsule (no ＋ before it: the field's own padding).
    public static var textStart: CGFloat { Tokens.fieldPadX }
    static let glyph: CGFloat = 16
    static let loaderSize: CGFloat = 14
    static let iconGap: CGFloat = 6
    static let labelSize: CGFloat = 14
    /// The segment's room round its face: 14 either side.
    static let segmentPad: CGFloat = 28

    /// The segments measured so far, per pair of words.
    @MainActor private static var known: [String: CGFloat] = [:]

    /// The segment's width: the wider of its two faces (glyph, 6, words) plus 28 — measured once per pair
    /// of words (a language), so it never changes while the field is used.
    @MainActor public static func segmentWidth(suggest: String, add: String) -> CGFloat {
        let key = suggest + "\u{1F}" + add
        if let width = known[key] { return width }
        let font = AppFonts.uiFont(.body, size: labelSize, weight: .semibold)
        func words(_ s: String) -> CGFloat {
            let attributes: [NSAttributedString.Key: Any] = [.font: font, .kern: labelSize * 0.02]
            return ceil((s as NSString).size(withAttributes: attributes).width)
        }
        let width = glyph + iconGap + max(words(suggest), words(add)) + segmentPad
        known[key] = width
        return width
    }
}

/// The segment reports its press to the face drawn behind the whole capsule (its wash).
private struct TagSegmentPress: ButtonStyle {
    @Binding var pressed: Bool

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .onChange(of: configuration.isPressed) { _, now in pressed = now }
    }
}
