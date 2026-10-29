import DesignSystem
import SwiftUI

/// Settings → 外觀 → 小紙團's strip (round 20, the owner: a puppet in settings, so it is plain what the switch
/// is — 「讓它在下面走來走去」, with something to do when tapped; the web's MascotsStrip): under the row, as wide
/// as it, a floor drawn in the light pen and a small island of its own over it, exactly the strip's size and
/// `headroom` more above it (a raised arm, a pointing mitten over the row is never cut off). Off, one puppet
/// naps on the floor and nobody else comes; on, they walk along it, meet, and stand by the switch pointing
/// at it — turning it on wakes the napper where it lay. A tap anywhere on the strip goes to the island (a
/// puppet there hops, then does something more). It scrolls with the list like any row, never stops a
/// scroll, and is a decoration: VoiceOver passes it by.
struct MascotStrip: View {
    /// The switch is on: they come and go. Off: one naps.
    let awake: Bool
    /// The switch's frame, in `space`.
    let control: CGRect?
    /// The named space `control` is measured in (the field's, which holds the strip too).
    let space: String
    @State private var island: MascotIsland?
    /// The strip's frame, in `space`.
    @State private var frame: CGRect = .zero
    @State private var appeared = false
    @Environment(\.window) private var window
    @Environment(\.colorScheme) private var colorScheme
    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @Environment(\.scenePhase) private var scenePhase
    @Environment(\.isSelectedTab) private var selectedTab

    /// Points the island reaches above the strip (settingsStage.ts STRIP_HEADROOM).
    static let headroom: CGFloat = 24
    /// The strip's height: room for the tallest standing (牽牽, 1.3 × the strip's unit) over its floor — the
    /// web's 104 on a phone's width (under 480), 116 wider.
    static func height(window width: CGFloat) -> CGFloat { width < 480 ? 104 : 116 }

    var body: some View {
        let height = Self.height(window: window.width)
        Self.floor
            .frame(maxWidth: .infinity)
            .frame(height: height, alignment: .bottom)
            .overlay(alignment: .bottom) {
                if let island {
                    MascotIslandView(island: island)
                        .frame(height: height + Self.headroom)
                        .allowsHitTesting(false)
                }
            }
            .contentShape(Rectangle())
            .onTapGesture(coordinateSpace: .local) { point in
                island?.tap(at: CGPoint(x: point.x, y: point.y + Self.headroom))
            }
            .onGeometryChange(for: CGRect.self) { $0.frame(in: .named(space)) } action: { frame = $0 }
            .accessibilityHidden(true)
            .onAppear { appeared = true }
            .onDisappear { appeared = false }
            .task {
                if island == nil { island = MascotIsland(page: "settings") }
                island?.inset(top: Self.headroom - 10, bottom: 0)
                applySettings()
                sendScene()
            }
            .onChange(of: scene) { sendScene() }
            .onChange(of: colorScheme) { applySettings() }
            .onChange(of: reduceMotion) { applySettings() }
            .onChange(of: showing) { applySettings() }
    }

    /// The floor: a wavy hairline in the light pen, the field's quiet grey half faded, 4 in from each end and
    /// its line 12 above the strip's foot (the web's `.stripFloor`: 8 tall, 8 up).
    static var floor: some View {
        WavyRuleShape(seed: 31, amp: 1.1, steps: 9)
            .stroke(Tokens.fieldBorderHover.opacity(0.55), style: StrokeStyle(lineWidth: Tokens.inkLight, lineCap: .round))
            .frame(height: 8)
            .padding(.horizontal, 4)
            .padding(.bottom, 8)
    }

    private var showing: Bool { appeared && selectedTab && scenePhase == .active }

    private var scene: ReadingScene? {
        Self.scene(strip: frame, height: Self.height(window: window.width), control: control, awake: awake)
    }

    /// The strip's scene, in its island's points (the strip starts `headroom` down): its floor, the switch
    /// over it, asleep or awake. Nil until the strip is laid out.
    static func scene(strip: CGRect, height: CGFloat, control: CGRect?, awake: Bool) -> ReadingScene? {
        guard strip.width > 0 else { return nil }
        let into = { (r: CGRect) in r.offsetBy(dx: -strip.minX, dy: -strip.minY + headroom) }
        return ReadingScene(width: Double(strip.width), height: Double(height + headroom),
                            settings: .init(floor: SceneRect(CGRect(x: 0, y: headroom, width: strip.width, height: height)),
                                            control: control.map { SceneRect(into($0)) }, asleep: !awake))
    }

    private func sendScene() {
        guard let island, let scene else { return }
        island.scene(scene)
    }

    private func applySettings() {
        guard let island else { return }
        island.theme(colorScheme == .dark ? "dark" : "light")
        island.reducedMotion(reduceMotion)
        island.paused(!showing)
    }
}
