import DesignSystem
import GoogleSignIn
import ResonanceKit
import SwiftUI

@main
struct ResonanceApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) private var appDelegate
    @State private var session: SessionStore

    init() {
        AppFonts.register()
        Strings.shared.load()
        let config = AppConfig.current
        FirebaseBootstrap.configure(config)
        _session = State(initialValue: SessionStore(config: config))
        #if DEBUG
        if VisualCapture.on { UIView.setAnimationsEnabled(false) }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .wearsAppearance(AppearanceStore.shared)
                .onOpenURL { url in _ = GIDSignIn.sharedInstance.handle(url) }
                #if targetEnvironment(macCatalyst)
                .background(MacWindowChrome())
                #endif
                #if DEBUG
                .modifier(VisualCapture())
                #endif
        }
        #if targetEnvironment(macCatalyst)
        .commands { MacMenuCommands() }
        #endif
    }
}

#if DEBUG
/// `-visualCapture YES`: the release screenshots (scripts/visual/ios.ts) — every screen drawn where it
/// ends, nothing on its way in or out (UIKit's animations off in `init`, SwiftUI's here) and no scroll
/// indicators where a screen doesn't choose its own, so two captures of one screen are the same
/// picture. (A Mac with a mouse still shows `.hidden` ones: mac.ts launches with `-AppleShowScrollBars`.)
struct VisualCapture: ViewModifier {
    static let on = UserDefaults.standard.bool(forKey: "visualCapture")

    func body(content: Content) -> some View {
        if Self.on {
            content
                .transaction { $0.disablesAnimations = true; $0.animation = nil }
                .scrollIndicators(.never)
        } else {
            content
        }
    }
}
#endif

extension View {
    /// A modal's content handed the session itself rather than left to inherit it. On a Mac (the iPad
    /// app there) SwiftUI builds a presented cover's view before the presenter's environment reaches
    /// it, and a view reading `@Environment(SessionStore.self)` then crashes the app — 分享卡片 in a
    /// conversation did. Every `organicModal` whose content reads the session goes through this.
    func withSession(_ session: SessionStore) -> some View {
        environment(session)
    }
}
