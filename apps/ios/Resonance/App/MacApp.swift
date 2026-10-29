#if targetEnvironment(macCatalyst)
import ResonanceKit
import SwiftUI
import UIKit

// The Mac app (Mac Catalyst, the owner's 2026-10-29 call): the iPad app's own layouts in a Mac window,
// with what a Mac app is expected to have — a window that keeps its own header clear of the title,
// a minimum size the tablet layouts fit, and a menu bar whose commands do what the header's controls do.

/// What the menu bar asks of the window: the commands live on the App, the tabs and the writer in
/// ``MainTabView``, which listens for these.
enum MacMenuCommand: String, CaseIterable {
    case write, settings, feed, messages, notifications, cardBox

    static let posted = Notification.Name("resonance.macMenuCommand")

    func send() { NotificationCenter.default.post(name: Self.posted, object: rawValue) }

    init?(_ note: Notification) {
        guard let raw = note.object as? String, let command = Self(rawValue: raw) else { return nil }
        self = command
    }

    /// The tab a command picks (⌘1…⌘4, in the header's order), if it is one.
    var tab: AppTab? {
        switch self {
        case .feed: .feed
        case .messages: .messages
        case .notifications: .notifications
        case .cardBox: .cardBox
        case .write, .settings: nil
        }
    }

    static let tabs: [MacMenuCommand] = [.feed, .messages, .notifications, .cardBox]
}

/// The menu bar: 寫卡片 (⌘N) where a document app has New, 設定 (⌘,) in the app's menu, the four tabs
/// (⌘1…⌘4) atop the View menu, and the support page in Help. Saving, importing and printing have
/// nothing to act on here and are left out.
struct MacMenuCommands: Commands {
    var body: some Commands {
        CommandGroup(replacing: .appSettings) {
            Button(L10n.App.Nav.settings) { MacMenuCommand.settings.send() }
                .keyboardShortcut(",", modifiers: .command)
        }
        CommandGroup(replacing: .newItem) {
            Button(L10n.App.Nav.write) { MacMenuCommand.write.send() }
                .keyboardShortcut("n", modifiers: .command)
        }
        CommandGroup(replacing: .saveItem) {}
        CommandGroup(replacing: .importExport) {}
        CommandGroup(replacing: .printItem) {}
        // The View menu: the four tabs where a toolbar's items would be (there is no toolbar to show).
        CommandGroup(replacing: .toolbar) {
            ForEach(Array(MacMenuCommand.tabs.enumerated()), id: \.element) { i, command in
                Button(command.tab?.title ?? "") { command.send() }
                    .keyboardShortcut(KeyEquivalent(Character("\(i + 1)")), modifiers: .command)
            }
        }
        CommandGroup(replacing: .help) {
            Button(L10n.Native.menuSupport) {
                UIApplication.shared.open(AppConfig.current.origin.appending(path: "support"))
            }
        }
    }
}

extension AppDelegate {
    /// What SwiftUI's commands can't reach: UIKit's document items in the File menu (Duplicate, Move,
    /// Rename, Export) have no document here to act on.
    override func buildMenu(with builder: any UIMenuBuilder) {
        super.buildMenu(with: builder)
        guard builder.system == .main else { return }
        builder.remove(menu: .document)
    }
}

/// The window's own chrome, set once it has a scene: the title bar keeps the traffic lights but not the
/// app's name (the header under it names the page), and the window never narrows past where the
/// tablet layouts begin.
struct MacWindowChrome: UIViewRepresentable {
    /// The medium layout's breakpoint and a little more: below it the iPhone layout, its tab bar at the
    /// foot, would take over a Mac window.
    static let minimumSize = CGSize(width: 720, height: 560)

    func makeUIView(context: Context) -> ChromeView { ChromeView() }
    func updateUIView(_ uiView: ChromeView, context: Context) {}

    final class ChromeView: UIView {
        override func didMoveToWindow() {
            super.didMoveToWindow()
            isUserInteractionEnabled = false
            guard let scene = window?.windowScene else { return }
            scene.titlebar?.titleVisibility = .hidden
            scene.titlebar?.toolbar = nil
            scene.sizeRestrictions?.minimumSize = MacWindowChrome.minimumSize
            #if DEBUG
            // `-macWindowSize 1440x900`: the window held at that size (the store's screenshots are taken at it).
            let parts = (UserDefaults.standard.string(forKey: "macWindowSize") ?? "").split(separator: "x").compactMap { Double($0) }
            if parts.count == 2 {
                let size = CGSize(width: parts[0], height: parts[1])
                scene.sizeRestrictions?.minimumSize = size
                scene.sizeRestrictions?.maximumSize = size
            }
            #endif
        }
    }
}
#endif
