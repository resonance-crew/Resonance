import Observation
import SwiftUI
import UIKit

/// The app's one toast — the web's providers/ToastProvider: `show(message, announcement:, action:)`
/// puts a word over the foot of the window (`ToastHost`, mounted once at the shell, so it outlives
/// the page that asked: a card trashed from its page, then popped), in place of any showing — the
/// earlier one simply goes. It stays 4 s, or 8 s with an action (undo, mostly), and 16 s while
/// VoiceOver or Switch Control is on, so whoever reaches it by swiping still finds it; it is said
/// aloud as it comes (an announcement), and never takes focus. Whatever a toast says is somewhere
/// that stays as well (the trash shelf, the page itself), so its time is never the only way back.
@MainActor @Observable public final class ToastCenter {
    /// What a toast offers to do about what it says.
    public struct Action {
        /// The verb, set in bold after the message (「復原」).
        public var label: String
        /// The button's name: the visible words first, then what it acts on (「已移到垃圾桶 · 復原〈title〉」).
        public var accessibilityLabel: String
        public var icon: IconName?
        public var perform: @MainActor () -> Void

        public init(label: String, accessibilityLabel: String, icon: IconName? = nil, perform: @escaping @MainActor () -> Void) {
            self.label = label
            self.accessibilityLabel = accessibilityLabel
            self.icon = icon
            self.perform = perform
        }
    }

    /// The toast showing.
    public struct Toast: Identifiable {
        public let id: Int
        /// The words on the pill: one fragment, no full stop (「已還原」).
        public let message: String
        /// What is said aloud instead, when the words alone aren't the whole of it (「〈title〉已移到垃圾桶」).
        public let announcement: String?
        public let action: Action?
        /// How long it stays.
        public let duration: Duration
    }

    /// How long a toast stays: long enough to read a status, longer to reach its action, and
    /// longer still for whoever reads the screen by swiping or switching.
    public static let statusDuration: Duration = .seconds(4)
    public static let actionDuration: Duration = .seconds(8)
    public static let assistiveDuration: Duration = .seconds(16)

    public static func duration(action: Bool, assistive: Bool) -> Duration {
        assistive ? assistiveDuration : action ? actionDuration : statusDuration
    }

    public private(set) var current: Toast?

    @ObservationIgnored private var nextID = 0
    @ObservationIgnored private var timer: Task<Void, Never>?
    @ObservationIgnored private let sleep: @Sendable (Duration) async throws -> Void
    @ObservationIgnored private let assistive: @MainActor () -> Bool
    @ObservationIgnored private let announce: @MainActor (String) -> Void

    /// The app's own takes the clock, VoiceOver and the announcement from the system; a test hands its own.
    public init(sleep: @escaping @Sendable (Duration) async throws -> Void = { try await Task.sleep(for: $0) },
                assistive: @escaping @MainActor () -> Bool = { UIAccessibility.isVoiceOverRunning || UIAccessibility.isSwitchControlRunning },
                announce: @escaping @MainActor (String) -> Void = { AccessibilityNotification.Announcement($0).post() }) {
        self.sleep = sleep
        self.assistive = assistive
        self.announce = announce
    }

    /// Shows a toast in place of any showing; answers its id (for `dismiss`).
    @discardableResult
    public func show(_ message: String, announcement: String? = nil, action: Action? = nil) -> Int {
        nextID += 1
        let id = nextID
        let toast = Toast(id: id, message: message, announcement: announcement, action: action,
                          duration: Self.duration(action: action != nil, assistive: assistive()))
        current = toast
        announce(announcement ?? message)
        timer?.cancel()
        let duration = toast.duration
        timer = Task { [weak self, sleep] in
            do { try await sleep(duration) } catch { return }
            self?.dismiss(id)
        }
        return id
    }

    /// Takes the toast down: the one with this id (a later one stays), or whichever is showing.
    public func dismiss(_ id: Int? = nil) {
        guard let toast = current, id == nil || toast.id == id else { return }
        current = nil
        timer?.cancel()
        timer = nil
    }

    /// Its action, once: the toast goes first, then the action runs.
    public func act() {
        guard let action = current?.action else { return }
        dismiss()
        action.perform()
    }
}

/// Where the toast shows: over the foot of the window, centred, at most 440 wide and 16 from either
/// side; it fades and grows in (180 ms) and fades out (140 ms), and simply comes and goes under
/// Reduce Motion. Only the pill takes touches: the page under the rest of the host stays live.
/// The shell mounts one, over the tab bar or the page's foot (`MainTabView`).
public struct ToastHost: View {
    let center: ToastCenter
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    public init(_ center: ToastCenter) {
        self.center = center
    }

    public static let maxWidth: CGFloat = 440
    public static let sideMargin: CGFloat = 16

    public var body: some View {
        ZStack {
            if let toast = center.current {
                face(toast)
                    .id(toast.id)
                    .transition(.asymmetric(insertion: .opacity.combined(with: .scale(scale: 0.9)), removal: .opacity))
            }
        }
        .frame(maxWidth: Self.maxWidth)
        .padding(.horizontal, Self.sideMargin)
        .animation(motion, value: center.current?.id)
    }

    private var motion: Animation? {
        guard !reduceMotion else { return nil }
        return center.current == nil ? .easeOut(duration: 0.14) : .easeOut(duration: 0.18)
    }

    @ViewBuilder private func face(_ toast: ToastCenter.Toast) -> some View {
        if let action = toast.action {
            OrganicPill(icon: action.icon, text: toast.message, verb: action.label, size: .toast,
                        accessibilityLabel: action.accessibilityLabel) { center.act() }
        } else {
            // Said aloud as it came: VoiceOver would only read it again.
            OrganicPill(text: toast.message, size: .toast).accessibilityHidden(true)
        }
    }
}
