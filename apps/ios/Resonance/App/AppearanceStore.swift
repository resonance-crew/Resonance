import DesignSystem
import ResonanceKit
import SwiftUI
import UIKit

/// Settings → 外觀 (spec §2): the display mode — 跟隨系統 · 淺色 · 深色 — and the theme colour, kept
/// on this device (`appearance.scheme`, `appearance.accent`, the values Android keeps) and worn by
/// the window scene itself: its trait overrides set the interface style and the theme
/// (``AccentTrait``), so everything in the scene follows at once — every screen's palette colours,
/// sheets and alerts, the keyboard, the photo picker, the in-app browser, the story editor's web
/// view — without a screen being rebuilt or a navigation stack reset. Default for everyone: follow
/// the system, terracotta; nothing announces it.
@MainActor @Observable
final class AppearanceStore {
    enum Mode: String, CaseIterable, Sendable {
        case system, light, dark

        var title: String {
            switch self {
            case .system: L10n.Tweaks.schemeSystem
            case .light: L10n.Tweaks.schemeLight
            case .dark: L10n.Tweaks.schemeDark
            }
        }

        /// The interface style the scene is told to take; nil leaves the system's.
        var interfaceStyle: UIUserInterfaceStyle? {
            switch self {
            case .system: nil
            case .light: .light
            case .dark: .dark
            }
        }
    }

    static let shared = AppearanceStore()
    static let modeKey = "appearance.scheme"
    static let accentKey = "appearance.accent"
    /// 小精靈 (round 19): the paper puppets now and then on the home feed and a card's page. Off until turned on.
    static let mascotsKey = "appearance.mascots"

    private(set) var mode: Mode
    private(set) var accent: Accent
    /// The paper puppets come to the home feed and a card's page (``MascotStage``); off by default.
    private(set) var mascots: Bool
    @ObservationIgnored private let defaults: UserDefaults
    /// The scenes a change is laid on (the app's; a test's none).
    @ObservationIgnored private let scenes: () -> [UIWindowScene]

    init(defaults: UserDefaults = .standard,
         scenes: @escaping () -> [UIWindowScene] = { UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene } }) {
        self.defaults = defaults
        self.scenes = scenes
        mode = defaults.string(forKey: Self.modeKey).flatMap(Mode.init(rawValue:)) ?? .system
        accent = defaults.string(forKey: Self.accentKey).flatMap(Accent.init(rawValue:)) ?? .terracotta
        mascots = defaults.bool(forKey: Self.mascotsKey)
    }

    func setMascots(_ on: Bool) {
        guard on != mascots else { return }
        mascots = on
        defaults.set(on, forKey: Self.mascotsKey)
    }

    func setMode(_ mode: Mode) {
        guard mode != self.mode else { return }
        self.mode = mode
        defaults.set(mode.rawValue, forKey: Self.modeKey)
        apply()
    }

    func setAccent(_ accent: Accent) {
        guard accent != self.accent else { return }
        self.accent = accent
        defaults.set(accent.rawValue, forKey: Self.accentKey)
        apply()
    }

    /// The choice laid on a scene's traits (every window in it inherits them).
    func apply(to scene: UIWindowScene) {
        if let style = mode.interfaceStyle {
            scene.traitOverrides.userInterfaceStyle = style
        } else if scene.traitOverrides.contains(UITraitUserInterfaceStyle.self) {
            scene.traitOverrides.remove(UITraitUserInterfaceStyle.self)
        }
        scene.traitOverrides.accent = accent
    }

    /// The choice laid on every scene the app has.
    func apply() {
        for scene in scenes() { apply(to: scene) }
    }
}

#if DEBUG
extension AppearanceStore {
    /// `-appearanceCycle <seconds>` steps through dark terracotta, dark sage, light lavender and light
    /// terracotta every that many seconds (a live switch checked on whatever screen is open).
    func cycleIfAsked() {
        let seconds = UserDefaults.standard.double(forKey: "appearanceCycle")
        guard seconds > 0 else { return }
        let steps: [(Mode, Accent)] = [(.dark, .terracotta), (.dark, .sage), (.light, .lavender), (.light, .terracotta)]
        Task {
            for i in 0... {
                try? await Task.sleep(for: .seconds(seconds))
                let (mode, accent) = steps[i % steps.count]
                setMode(mode)
                setAccent(accent)
            }
        }
    }
}
#endif

extension View {
    /// Lays the reader's appearance on the window scene this view is shown in, as soon as it is in one.
    func wearsAppearance(_ store: AppearanceStore) -> some View {
        background(SceneAppearance(store: store).frame(width: 0, height: 0).accessibilityHidden(true))
    }
}

/// Finds the scene a view is in (the first time it lands in a window) and lays the appearance on it:
/// the earliest a SwiftUI app reaches its window, before the first frame is committed.
private struct SceneAppearance: UIViewRepresentable {
    let store: AppearanceStore

    func makeUIView(context: Context) -> Probe { Probe(store: store) }
    func updateUIView(_ view: Probe, context: Context) {}

    final class Probe: UIView {
        let store: AppearanceStore
        init(store: AppearanceStore) {
            self.store = store
            super.init(frame: .zero)
            isUserInteractionEnabled = false
        }

        required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

        override func didMoveToWindow() {
            super.didMoveToWindow()
            guard let scene = window?.windowScene else { return }
            store.apply(to: scene)
            #if DEBUG
            if !cycling { cycling = true; store.cycleIfAsked() }
            #endif
        }

        #if DEBUG
        private var cycling = false
        #endif
    }
}
