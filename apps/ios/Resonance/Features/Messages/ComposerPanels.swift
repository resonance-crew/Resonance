import DesignSystem
import Foundation
import UIKit

// Round 22 §4.1–4.2: what lies under the composer — the keyboard, the sticker panel or the attach panel, in
// the keyboard's place and at its height — as a small state machine (pure, tested), and the keyboard's
// height remembered per orientation so a panel opens exactly where the keyboard was.

/// What the composer's foot holds under the capsule.
nonisolated enum ComposerPanel: Equatable, Sendable {
    case none, stickers, attach
}

/// The send segment's face: Send, or — the sticker panel open with nothing to send — ↑ (grow the panel to
/// under the header) and ↓ (back).
typealias SendFace = ComposerSendFace

/// The panels under the composer (round 22 §4.1): which one shows, whether it has grown to under the header,
/// and whether the field asked for the keyboard back while one shows (the panel stays until the keyboard is
/// up, so nothing dips between them).
nonisolated struct ComposerPanels: Equatable, Sendable {
    private(set) var shown: ComposerPanel = .none
    /// Grown to just under the header (↑, the attach panel's grip dragged up, the grid scrolled up).
    private(set) var expanded = false
    /// The field took the focus while a panel showed: the panel goes once the keyboard is up.
    private(set) var awaitingKeyboard = false

    var isOpen: Bool { shown != .none }

    /// While a panel shows, the thread lays out as if no keyboard were up: the panel stands where it was.
    var ignoresKeyboard: Bool { shown != .none }

    /// ☺ shows ⌨ while the sticker panel is open (back to the keyboard).
    var stickersOpen: Bool { shown == .stickers && !awaitingKeyboard }

    /// ＋ wears its open state while the attach panel is open.
    var attachOpen: Bool { shown == .attach && !awaitingKeyboard }

    /// ☺ (or ⌨) was tapped: the sticker panel opens — or, open, gives way to the keyboard.
    /// Returns whether the field should take the focus (the keyboard back).
    mutating func toggleStickers() -> Bool {
        if stickersOpen {
            keyboardRequested()
            return true
        }
        open(.stickers)
        return false
    }

    /// ＋ was tapped: the attach panel opens — or, open, closes back to where things were (no keyboard asked).
    mutating func toggleAttach() {
        if attachOpen { close() } else { open(.attach) }
    }

    mutating func open(_ panel: ComposerPanel) {
        if shown != panel { expanded = false }
        shown = panel
        awaitingKeyboard = false
    }

    /// The field took the focus (a tap on it, ⌨): the panel stays until the keyboard is up.
    mutating func keyboardRequested() {
        guard shown != .none else { return }
        awaitingKeyboard = true
    }

    /// The keyboard is up (or, with a hardware keyboard, would have been by now): a panel waiting for it goes.
    mutating func keyboardShown() {
        guard awaitingKeyboard else { return }
        close()
    }

    /// The panel goes (sent from the attach panel, swiped down, a tap on the thread).
    mutating func close() {
        shown = .none
        expanded = false
        awaitingKeyboard = false
    }

    mutating func setExpanded(_ value: Bool) {
        guard shown != .none else { return }
        expanded = value
    }

    /// What the send segment shows: ↑ / ↓ only in the sticker panel with nothing to send.
    func sendFace(canSend: Bool) -> SendFace {
        guard shown == .stickers, !awaitingKeyboard, !canSend else { return .send }
        return expanded ? .collapse : .expand
    }
}

/// The keyboard's height remembered per orientation, across launches (round 22 §4.1): a panel opens at it, so
/// trading the keyboard for a panel moves nothing. A keyboard that isn't docked at the screen's foot (floating,
/// split) or only a hardware keyboard's strip is no height to remember; without one, 300. A phone on its side
/// keeps a panel to about 200, leaving room for the thread.
nonisolated struct KeyboardHeightMemory: Equatable, Sendable {
    static let fallback: CGFloat = 300
    static let landscapePhoneCap: CGFloat = 200
    /// Less than this is a hardware keyboard's shortcut strip, not a keyboard.
    static let smallest: CGFloat = 150

    private(set) var portrait: CGFloat?
    private(set) var landscape: CGFloat?

    init(portrait: CGFloat? = nil, landscape: CGFloat? = nil) {
        self.portrait = portrait
        self.landscape = landscape
    }

    /// A keyboard frame came up: `height` tall, its foot `docked` at the screen's foot or not.
    mutating func record(height: CGFloat, docked: Bool, landscape isLandscape: Bool) {
        guard docked, height >= Self.smallest else { return }
        if isLandscape { landscape = height } else { portrait = height }
    }

    /// The height a panel takes in this orientation.
    func height(landscape isLandscape: Bool, phone: Bool) -> CGFloat {
        let kept = (isLandscape ? landscape : portrait) ?? Self.fallback
        return isLandscape && phone ? min(kept, Self.landscapePhoneCap) : kept
    }

    // MARK: Kept across launches

    static let defaultsKey = "composer.keyboardHeight"

    static func load(_ defaults: UserDefaults = .standard) -> KeyboardHeightMemory {
        let kept = defaults.dictionary(forKey: defaultsKey) as? [String: Double] ?? [:]
        return KeyboardHeightMemory(portrait: kept["portrait"].map { CGFloat($0) }, landscape: kept["landscape"].map { CGFloat($0) })
    }

    func save(_ defaults: UserDefaults = .standard) {
        var kept: [String: Double] = [:]
        if let portrait { kept["portrait"] = Double(portrait) }
        if let landscape { kept["landscape"] = Double(landscape) }
        defaults.set(kept, forKey: Self.defaultsKey)
    }
}

/// Follows the keyboard's frame for the composer: remembers its height (``KeyboardHeightMemory``) and says when
/// it has come up, so a panel waiting for it can go.
@MainActor @Observable
final class KeyboardWatch {
    static let shared = KeyboardWatch()

    private(set) var memory = KeyboardHeightMemory.load()
    /// Counts each time the keyboard finished coming up.
    private(set) var shownCount = 0
    /// Its height on screen now (0 when it is down).
    private(set) var height: CGFloat = 0
    @ObservationIgnored private var observers: [NSObjectProtocol] = []

    init() {
        let center = NotificationCenter.default
        observers.append(center.addObserver(forName: UIResponder.keyboardWillChangeFrameNotification, object: nil, queue: .main) { [weak self] note in
            let end = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? NSValue)?.cgRectValue
            MainActor.assumeIsolated { self?.changed(end) }
        })
        observers.append(center.addObserver(forName: UIResponder.keyboardDidShowNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.shownCount += 1 }
        })
        observers.append(center.addObserver(forName: UIResponder.keyboardWillHideNotification, object: nil, queue: .main) { [weak self] _ in
            MainActor.assumeIsolated { self?.height = 0 }
        })
    }

    private func changed(_ end: CGRect?) {
        guard let end, let screen = Self.screenBounds else { return }
        let docked = abs(end.maxY - screen.maxY) < 1 && end.width >= screen.width - 1
        let visible = max(0, screen.maxY - end.minY)
        height = docked ? visible : 0
        var next = memory
        next.record(height: end.height, docked: docked, landscape: Self.landscape)
        if next != memory {
            memory = next
            next.save()
        }
    }

    /// The height a panel opens at here and now.
    var panelHeight: CGFloat {
        memory.height(landscape: Self.landscape, phone: UIDevice.current.userInterfaceIdiom == .phone)
    }

    static var landscape: Bool {
        guard let screen = screenBounds else { return false }
        return screen.width > screen.height
    }

    private static var screenBounds: CGRect? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return (scenes.first { $0.activationState == .foregroundActive } ?? scenes.first)?.screen.bounds
    }
}
