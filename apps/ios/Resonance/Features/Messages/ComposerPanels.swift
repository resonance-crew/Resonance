import DesignSystem
import Foundation
import GameController
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
    /// How many times the keyboard has been asked for while a panel showed: a wait for it (``KeyboardWait``)
    /// belongs to the latest ask alone.
    private(set) var asks = 0

    var isOpen: Bool { shown != .none }

    /// The shortest a panel stands (with the home indicator under it): one too short to use is never laid out.
    static let least: CGFloat = 160

    /// While a panel shows, the thread lays out as if no keyboard were up: the panel stands where it was.
    var ignoresKeyboard: Bool { shown != .none }

    /// ☺ shows ⌨ while the sticker panel is there (back to the keyboard) — still while the keyboard is on its way
    /// under it (round 24 §C): the owner's ⌨ "sometimes didn't bring the keyboard back". It turned to ☺ the moment it
    /// was tapped while the panel stood until the keyboard was up (a keyboard can take most of a second, more with an
    /// input method); a second tap in that time — the tap that seemed not to have taken — opened the sticker panel
    /// again and put the coming keyboard away.
    var stickersOpen: Bool { shown == .stickers }

    /// ＋ wears its open state while the attach panel is open.
    var attachOpen: Bool { shown == .attach && !awaitingKeyboard }

    /// ☺ or ⌨ was tapped, `keyboard` saying it was ⌨ — the face the person saw, not the state at the moment the tap
    /// lands (round 24 §C): ⌨ asks for the keyboard back, the panel staying under it until it is up (another ⌨
    /// meanwhile asks again, never the panel back); ☺ opens the sticker panel. Returns whether the field should take
    /// the focus (the keyboard back) — ⌨ always does, even should the panel have gone under it already.
    mutating func tapStickerKey(keyboard: Bool) -> Bool {
        if keyboard {
            keyboardRequested()
            return true
        }
        open(.stickers)
        return false
    }

    /// ☺ / ⌨ as the panels stand now (``tapStickerKey(keyboard:)`` with the face ``stickersOpen`` draws).
    mutating func toggleStickers() -> Bool {
        tapStickerKey(keyboard: stickersOpen)
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
        asks += 1
    }

    /// The keyboard is up (or, with a hardware keyboard, would have been by now): a panel waiting for it goes.
    mutating func keyboardShown() {
        guard awaitingKeyboard else { return }
        close()
    }

    /// The field gave the focus up before the keyboard it asked for came (a tap or a drag on the thread put it away):
    /// the ask is over, and the panel goes with it — never left waiting to bring back a keyboard put away on purpose.
    /// Returns whether a panel went.
    @discardableResult mutating func focusLost() -> Bool {
        guard awaitingKeyboard else { return false }
        close()
        return true
    }

    /// The field never took the focus it was asked for, twice (UIKit refused it): the panel stays where it is, ⌨ there
    /// to ask again — never the composer dropped to the screen's foot with no keyboard under it.
    mutating func keyboardNeverCame() {
        awaitingKeyboard = false
    }

    /// The panel is put away (a tap on the thread or the foot's paper, the grip swiped down) — and with it the keyboard
    /// asked for in its place, should it still be on its way (round 24 §C). Returns whether there was such an ask: the
    /// composer then lets the focus go itself, since a field UIKit never gave the focus hears no resign, and a later
    /// update would raise the keyboard put away after all.
    mutating func putAway() -> Bool {
        let asked = awaitingKeyboard
        close()
        return asked
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

/// A panel waiting for the keyboard it was traded for (round 24 §C): its didShow takes the panel away, and these
/// looks see to the rest — the panel never goes from under a keyboard still on its way (it went at 700 ms, before a
/// slow one, and the composer dipped to the screen's foot and came back), a field that didn't take the focus is
/// asked once more, and where no keyboard will take the panel's place (a hardware keyboard, a floating one — the
/// field has the focus) the panel goes at the first. A field that has the focus with no word of a keyboard yet is
/// given until the last look: "no frame yet" is a slow keyboard as often as none. A field that never took the focus
/// leaves the panel where it is, ⌨ there to ask again (`giveUp`).
nonisolated enum KeyboardWait: Equatable, Sendable {
    case keepWaiting, askAgain, close, giveUp

    /// When it looks, from the ask: the first, then the last, after which the wait ends whatever came.
    static let firstLook: Duration = .milliseconds(700)
    static let lastLook: Duration = .milliseconds(1500)

    /// What a look does: `keyboardComing` — a keyboard is up or rising (a docked frame since the ask);
    /// `fieldFocused` — the composer's text has the focus in UIKit; `noneComes` — no keyboard will rise into the
    /// panel's place (``HardwareKeyboard/connected``, or the keyboard over the screen floats).
    static func next(keyboardComing: Bool, fieldFocused: Bool, noneComes: Bool, last: Bool) -> KeyboardWait {
        if keyboardComing { return last ? .close : .keepWaiting }
        if fieldFocused { return last || noneComes ? .close : .keepWaiting }
        return last ? .giveUp : .askAgain
    }
}

/// What the composer's field does about UIKit's focus after an update (round 24 §C), from what the composer wants
/// (`wanted`: its `focused`), whether the field holds the focus now (`held`), is in a window, and whether the keyboard
/// was asked for outright since the last update (`asked`: ⌨, or a look that found the field without the focus).
/// `take` and `give` follow the binding; `retake` answers an ask the binding alone can't — it was true already, so
/// setting it again asks UIKit nothing — when the field holds the focus with no keyboard over it: the field lets the
/// focus go and takes it again, which brings a keyboard as any focusing does (``ComposerUITextView/retakeKeyboard()``,
/// only once no keyboard shows).
nonisolated enum FieldFocus: Equatable, Sendable {
    case none, take, retake, give

    static func next(wanted: Bool, held: Bool, inWindow: Bool, asked: Bool) -> FieldFocus {
        if wanted {
            if !held { return inWindow ? .take : .none }
            return asked ? .retake : .none
        }
        return held ? .give : .none
    }

    /// A field that took the focus this recently is left be by a `retake`: its keyboard may be a moment from its
    /// first frame, and an impatient second ⌨ would restart it on its way.
    static let retakeGrace: TimeInterval = 0.4

    /// Whether a `retake`, when it runs, lets the focus go and takes it again: only with no keyboard over the screen or
    /// on its way (`keyboardOnScreen`), not within ``retakeGrace`` of the field taking the focus (`sinceFocus`, in
    /// seconds), and never with a hardware keyboard connected — no keyboard comes on the screen for one.
    static func retakes(keyboardOnScreen: Bool, sinceFocus: TimeInterval, hardwareKeyboard: Bool) -> Bool {
        !keyboardOnScreen && !hardwareKeyboard && sinceFocus >= retakeGrace
    }
}

/// A hardware keyboard is connected (GameController's coalesced keyboard, round 24 §C): the field takes the focus and
/// no keyboard comes on the screen — told apart directly, not guessed from a keyboard frame that hasn't come yet.
/// GameController finds keyboards on its own time (``GCKeyboardDidConnect``): asked cold, a moment after launch, the
/// coalesced keyboard can still be nil with one connected, and the first ☺ after launch opened a panel on the owner's
/// iPad — the jump back (round 24, part 3 review). So it is watched from launch (``watch()``, in the app's init), kept by
/// the connect and disconnect notifications rather than asked at the tap.
enum HardwareKeyboard {
    private static var known = false
    private static var observers: [NSObjectProtocol] = []

    static var connected: Bool {
        watch()
        return known
    }

    /// Starts watching (once; again does nothing): the notifications first, then the coalesced keyboard read — one found
    /// before is coalesced already, one found after is said.
    static func watch() {
        guard observers.isEmpty else { return }
        let center = NotificationCenter.default
        observers = [
            center.addObserver(forName: .GCKeyboardDidConnect, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { known = true }
            },
            // The coalesced keyboard goes only with the last keyboard connected.
            center.addObserver(forName: .GCKeyboardDidDisconnect, object: nil, queue: .main) { _ in
                MainActor.assumeIsolated { known = false }
            },
        ]
        known = GCKeyboard.coalesced != nil
    }
}

/// What ☺ and ＋ open (round 24, part 3 §A2): a panel in the keyboard's place, or the popover at the button the Mac
/// opens (``MacComposerPopover``). A panel is a trade — the keyboard goes and the panel stands where it stood, so
/// nothing moves — and only worth making where an on-screen keyboard would stand in its place. On an iPad with a
/// hardware keyboard (the owner's simulator: the Mac's keyboard), a floating or split keyboard, or only a hardware
/// keyboard's shortcut strip docked, there is none: the panel rose from the window's foot and took the composer and
/// the thread up with it, and ⌨ dropped them again (the owner's "jump"). There the popovers open instead — the field
/// keeps the focus and the hardware keyboard keeps typing, and nothing under the thread moves. Decided at the tap (a
/// popover open when the answer changes stays one until it closes); a phone keeps its panel in every case, and so
/// does an iPad window too narrow for a popover beside the capsule. So does a window placed so high on the screen
/// (iPadOS's windowed apps, Stage Manager) that its keyboard covers less of it than a panel's least
/// (``ComposerPanels/least``): the panel can't be that short, so trading would move the composer all the same — the
/// popovers there too.
nonisolated enum ComposerOpens: Equatable, Sendable {
    case panel, popover

    nonisolated enum Device: Equatable, Sendable {
        case phone, pad, mac
    }

    /// The narrowest iPad window the popovers open in.
    static let popoverWindowMin: CGFloat = 520

    /// `dockedHeight`: how tall the keyboard docked at the screen's foot stands now, on the screen (0 for none, or for one
    /// that floats) — under ``KeyboardHeightMemory/smallest`` a hardware keyboard's shortcut strip; `keyboardHeight`: the
    /// keyboard's remembered height here (``KeyboardHeightMemory``), the one a field taking the focus would raise;
    /// `windowGap`: how far the window's foot stands above the screen's (``KeyboardCover``).
    static func at(device: Device, windowWidth: CGFloat, hardwareKeyboard: Bool, keyboardFloats: Bool,
                   dockedHeight: CGFloat, keyboardHeight: CGFloat, windowGap: CGFloat) -> ComposerOpens {
        switch device {
        case .mac:
            return .popover
        case .phone:
            return .panel
        case .pad:
            guard windowWidth >= popoverWindowMin else { return .panel }
            if hardwareKeyboard || keyboardFloats { return .popover }
            let strip = dockedHeight > 0 && dockedHeight < KeyboardHeightMemory.smallest
            if strip { return .popover }
            // What the keyboard — the one up, else the one the field would raise — covers of the window: a panel trades
            // for exactly that, and under a panel's least there is nothing to trade it for.
            let cover = KeyboardCover.overWindow(dockedHeight > 0 ? dockedHeight : keyboardHeight, gap: windowGap)
            return cover < ComposerPanels.least ? .popover : .panel
        }
    }
}

extension ComposerOpens.Device {
    /// This device: the Mac (Catalyst, or the iPad app on a Mac — whatever idiom it reports), an iPad, or a phone.
    @MainActor static var current: ComposerOpens.Device {
        if ProcessInfo.processInfo.isMacCatalystApp || ProcessInfo.processInfo.isiOSAppOnMac { return .mac }
        return UIDevice.current.userInterfaceIdiom == .pad ? .pad : .phone
    }
}

/// How much of the app's window a keyboard covers (round 24, part 3 §A1). The keyboard's frame is the screen's, and its
/// height is remembered as it stands on the screen (``KeyboardHeightMemory``); a window that doesn't reach the screen's
/// foot — iPadOS's windowed apps, Stage Manager, Split View in some layouts — has that much less of the keyboard over
/// it. A panel in the keyboard's place is the part over the window: taller by the gap, trading the keyboard for it
/// moved the composer and the thread up by as much, and back as the keyboard came again.
nonisolated enum KeyboardCover {
    /// How far the window's foot stands above the screen's, both in the screen's space: never less than nothing.
    static func windowGap(screenMaxY: CGFloat, windowMaxY: CGFloat) -> CGFloat {
        max(0, screenMaxY - windowMaxY)
    }

    /// What of a keyboard `height` tall, docked at the screen's foot, lies over a window whose foot is `gap` above it.
    static func overWindow(_ height: CGFloat, gap: CGFloat) -> CGFloat {
        max(0, height - max(0, gap))
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
    /// Whether any keyboard is over the screen or on its way there — docked, floating or split, or a hardware
    /// keyboard's strip — read when the field holds the focus and the keyboard is asked for (``FieldFocus/retake``).
    /// Not observed: no view draws from it.
    @ObservationIgnored private(set) var onScreen = false
    /// A keyboard over the screen that isn't docked at its foot (floating, split): it never takes a panel's place.
    var floats: Bool { onScreen && height == 0 }
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
            MainActor.assumeIsolated {
                self?.height = 0
                self?.onScreen = false
            }
        })
    }

    private func changed(_ end: CGRect?) {
        guard let end, let screen = Self.screenBounds else { return }
        let docked = abs(end.maxY - screen.maxY) < 1 && end.width >= screen.width - 1
        let visible = max(0, screen.maxY - end.minY)
        height = docked ? visible : 0
        onScreen = end.height > 0 && end.width > 0 && end.minY < screen.maxY - 1 && end.maxY > screen.minY
        var next = memory
        next.record(height: end.height, docked: docked, landscape: Self.landscape)
        if next != memory {
            memory = next
            next.save()
        }
    }

    /// The height a panel opens at here and now: what the keyboard remembered for this orientation covers of the window
    /// (``KeyboardCover``) — the keyboard's own height kept as it is, since the window may move; the gap taken off here.
    var panelHeight: CGFloat {
        KeyboardCover.overWindow(rememberedHeight, gap: Self.windowGap)
    }

    /// The keyboard's own height remembered for this orientation, on the screen (a phone's on its side capped).
    var rememberedHeight: CGFloat {
        memory.height(landscape: Self.landscape, phone: UIDevice.current.userInterfaceIdiom == .phone)
    }

    static var landscape: Bool {
        guard let screen = screenBounds else { return false }
        return screen.width > screen.height
    }

    /// How far the active scene's key window stands short of the screen's foot, in the screen's space (the keyboard's);
    /// 0 when it can't be told.
    static var windowGap: CGFloat {
        guard let scene = activeScene, let window = scene.keyWindow ?? scene.windows.first else { return 0 }
        let frame = window.convert(window.bounds, to: scene.screen.coordinateSpace)
        return KeyboardCover.windowGap(screenMaxY: scene.screen.bounds.maxY, windowMaxY: frame.maxY)
    }

    private static var screenBounds: CGRect? { activeScene?.screen.bounds }

    private static var activeScene: UIWindowScene? {
        let scenes = UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }
        return scenes.first { $0.activationState == .foregroundActive } ?? scenes.first
    }
}
