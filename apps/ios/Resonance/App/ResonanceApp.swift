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
        // GameController finds a hardware keyboard on its own time: watched from launch, an iPad's first ☺ knows of one
        // (round 24, part 3 §A2 — ``ComposerOpens``).
        HardwareKeyboard.watch()
        #if DEBUG
        if VisualCapture.on { UIView.setAnimationsEnabled(false) }
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environment(session)
                .wearsAppearance(AppearanceStore.shared)
                // Every link into the app comes here, a cold launch's too (before the tabs exist): Google's sign-in
                // callback is Google's; a universal link or the Smart App Banner's 打開 waits for the tabs (round 23 §7).
                .onOpenURL { url in session.links.receive(url) { GIDSignIn.sharedInstance.handle($0) } }
                #if targetEnvironment(macCatalyst)
                // The Mac's universal links should come through onOpenURL as the iPhone's do; should a Mac hand one over
                // as a browsing activity instead (native macOS SwiftUI apps did), it lands in the same inbox — which
                // opens one link handed over twice once.
                .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
                    if let url = activity.webpageURL { session.links.receive(url) { _ in false } }
                }
                #endif
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
