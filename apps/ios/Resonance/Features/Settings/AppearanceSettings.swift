import DesignSystem
import ResonanceKit
import SwiftUI

/// 外觀 (spec §2): the display mode — 跟隨系統 · 淺色 · 深色, the writer's segmented choice (the
/// publish step's 卡片類型) — and the theme colour, a row of hand-drawn swatches, each the theme's
/// paper with its accent in the scheme now worn, the chosen one ringed and checked, its name under it;
/// then 小精靈, the paper puppets' switch (round 19). All apply at once, everywhere (``AppearanceStore``),
/// and are kept on this device.
struct AppearanceSettings: View {
    private let store = AppearanceStore.shared
    /// Where the 小精靈 switch is (the strip's puppets point at it).
    @State private var toggle: CGRect?

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
            // 小精靈 (round 19, the web's MascotsSwitch): the field's label over it, the hint at its start
            // and the switch at its end; off until turned on, kept on this device. Under it (round 20) the
            // strip where one naps while it is off and they come and go while it is on.
            VStack(alignment: .leading, spacing: 10) {
                label(L10n.Tweaks.mascots)
                VStack(alignment: .leading, spacing: 4) {
                    HStack(alignment: .top, spacing: 20) {
                        CSSText(L10n.Tweaks.mascotsHint, font: AppFonts.scaledUIFont(.body, size: Tokens.hintSize), lineHeight: 1.55,
                                color: Tokens.UI.textMuted)
                            .frame(maxWidth: .infinity, alignment: .leading)
                            .accessibilityHidden(true)
                        OrganicToggle(isOn: Binding(get: { store.mascots }, set: { store.setMascots($0) }),
                                      label: L10n.Tweaks.mascots, seed: 97)
                            .accessibilityHint(L10n.Tweaks.mascotsHint)
                            .padding(.top, 1)
                            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(Self.mascotsField)) } action: { toggle = $0 }
                    }
                    MascotStrip(awake: store.mascots, control: toggle, space: Self.mascotsField)
                }
                .coordinateSpace(.named(Self.mascotsField))
            }
        }
    }

    /// The 小精靈 field's own space: the switch and the strip under it are measured in it.
    private nonisolated static let mascotsField = "settings.mascots"

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
/// environment). Chosen, its own edge takes the accent at the strong pen (no ring round it, as the
/// web's and Android's) and it is checked.
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
                    WobCircleShape(seed: seed + 3, options: WobCircleOptions(segments: 8, mag: 0.8, cpJitter: 0.4))
                        .fill(Tokens.cream)
                        .overlay {
                            WobCircleShape(seed: seed + 3, options: WobCircleOptions(segments: 8, mag: 0.8, cpJitter: 0.4))
                                .stroke(chosen ? Tokens.terracotta : Tokens.fieldBorder, lineWidth: chosen ? Tokens.inkStrong : Tokens.ink)
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
                .frame(width: Self.side + 4, height: Self.side + 4)
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
