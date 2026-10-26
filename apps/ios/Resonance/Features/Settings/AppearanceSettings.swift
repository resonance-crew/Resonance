import DesignSystem
import ResonanceKit
import SwiftUI

/// 外觀 (spec §2): the display mode — 跟隨系統 · 淺色 · 深色, the writer's segmented choice (the
/// publish step's 卡片類型) — and the theme colour, a row of hand-drawn swatches, each the theme's
/// paper with its accent in the scheme now worn, the chosen one ringed and checked, its name under it.
/// Both apply at once, everywhere (``AppearanceStore``), and are kept on this device.
struct AppearanceSettings: View {
    private let store = AppearanceStore.shared

    var body: some View {
        VStack(alignment: .leading, spacing: 28) {
            VStack(alignment: .leading, spacing: 10) {
                label(L10n.Tweaks.scheme)
                SegmentedActionBar(AppearanceStore.Mode.allCases.map(modeOption), fill: Tokens.creamDark)
            }
            VStack(alignment: .leading, spacing: 14) {
                label(L10n.Tweaks.accentColor)
                HStack(alignment: .top, spacing: 0) {
                    ForEach(Array(Accent.allCases.enumerated()), id: \.element) { i, accent in
                        ThemeSwatch(accent: accent, name: Self.name(accent), chosen: store.accent == accent, seed: Double(81 + i * 7)) {
                            store.setAccent(accent)
                        }
                        .frame(maxWidth: .infinity)
                    }
                }
                .accessibilityElement(children: .contain)
                .accessibilityLabel(L10n.Tweaks.accentColor)
            }
        }
    }

    /// The theme's name (tweaks.theme*).
    static func name(_ accent: Accent) -> String {
        switch accent {
        case .terracotta: L10n.Tweaks.themeTerracotta
        case .sage: L10n.Tweaks.themeSage
        case .lavender: L10n.Tweaks.themeLavender
        case .yellow: L10n.Tweaks.themeYellow
        }
    }

    private func modeOption(_ mode: AppearanceStore.Mode) -> SegmentSpec {
        let chosen = store.mode == mode
        return SegmentSpec(id: mode.rawValue, label: mode.title,
                           fill: chosen ? Tokens.buttonTonal : nil,
                           ink: chosen ? Tokens.buttonOnTonal : Tokens.segmentIdleInk,
                           pressInk: Tokens.towardInk.opacity(0.05), selected: chosen) {
            store.setMode(mode)
        }
    }

    private func label(_ text: String) -> some View {
        Text(text.uppercased())
            .font(AppFonts.body(Tokens.labelSize, weight: .semibold))
            .tracking(Tokens.labelSize * 0.06)
            .foregroundStyle(Tokens.textMuted)
            .accessibilityAddTraits(.isHeader)
    }
}

/// One theme as a choice: a wobbly disc of its paper, edged in the field pen, holding a smaller disc
/// of its accent — both as the theme draws them in the scheme now worn (its own `accent` in the
/// environment) — ringed in its accent and checked when chosen.
private struct ThemeSwatch: View {
    let accent: Accent
    let name: String
    let chosen: Bool
    let seed: Double
    let action: () -> Void

    static let side: CGFloat = 56

    var body: some View {
        Button(action: action) {
            VStack(spacing: 8) {
                ZStack {
                    WobCircleShape(seed: seed, options: WobCircleOptions(segments: 8, mag: 0.8, cpJitter: 0.4))
                        .stroke(chosen ? Tokens.terracotta : .clear, lineWidth: Tokens.inkStrong)
                        .frame(width: Self.side + 10, height: Self.side + 10)
                    WobCircleShape(seed: seed + 3, options: WobCircleOptions(segments: 8, mag: 0.8, cpJitter: 0.4))
                        .fill(Tokens.cream)
                        .overlay {
                            WobCircleShape(seed: seed + 3, options: WobCircleOptions(segments: 8, mag: 0.8, cpJitter: 0.4))
                                .stroke(Tokens.fieldBorder, lineWidth: Tokens.ink)
                        }
                        .frame(width: Self.side, height: Self.side)
                    WobCircleShape(seed: seed + 5, options: WobCircleOptions(segments: 7, mag: 0.6, cpJitter: 0.3))
                        .fill(Tokens.terracotta)
                        .frame(width: 30, height: 30)
                    if chosen {
                        OrganicIcon(.check, size: 16, color: Tokens.cream, strokeWidth: Tokens.inkStrong)
                            .transition(.scale(scale: 0.4).combined(with: .opacity))
                    }
                }
                .frame(width: Self.side + 12, height: Self.side + 12)
                // The theme's own colours, in whichever scheme the window wears.
                .environment(\.accent, accent)
                Text(name)
                    .font(AppFonts.body(13, weight: chosen ? .semibold : .regular))
                    .foregroundStyle(chosen ? Tokens.text : Tokens.textMuted)
                    .lineLimit(1)
                    .minimumScaleFactor(0.8)
            }
            .contentShape(Rectangle())
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: chosen)
        }
        .buttonStyle(OrganicPressStyle(inset: 2, color: Tokens.terracotta.opacity(0.08)))
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(name)
        .accessibilityAddTraits(chosen ? [.isButton, .isSelected] : .isButton)
    }
}
