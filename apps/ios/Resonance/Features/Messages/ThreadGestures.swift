import DesignSystem
import SwiftUI
import UIKit
import UIKit.UIGestureRecognizerSubclass

// The thread's two gestures on a message, as UIKit recognizers: they sit in a scrolling list, and
// UIKit's rules for which recognizer wins are what keep a press or a sideways drag from fighting
// the scroll (a press gives way to a finger that moves; a sideways drag begins only sideways).

/// Press and hold a message: its menu. Tells `onPress` the link under the finger, if the finger is
/// on one in the message's words (the menu then offers to open or copy it).
struct MessagePress: UIGestureRecognizerRepresentable {
    let onPress: (URL?) -> Void

    func makeUIGestureRecognizer(context: Context) -> UILongPressGestureRecognizer {
        let press = UILongPressGestureRecognizer()
        press.minimumPressDuration = BubbleMetrics.menuHold
        return press
    }

    func handleUIGestureRecognizerAction(_ recognizer: UILongPressGestureRecognizer, context: Context) {
        guard recognizer.state == .began else { return }
        onPress(Self.link(under: recognizer))
    }

    /// The words under the finger are a ChatText's view: it knows which of its links is there.
    private static func link(under recognizer: UIGestureRecognizer) -> URL? {
        guard let view = recognizer.view else { return nil }
        var hit = view.hitTest(recognizer.location(in: view), with: nil)
        while let current = hit, !(current is ChatTextView) { hit = current.superview }
        guard let text = hit as? ChatTextView else { return nil }
        return text.link(at: recognizer.location(in: text))
    }
}

/// Drag a message toward the middle of the screen — theirs to the right, yours to the left — to
/// reply to it. `onDrag` follows the finger's distance that way (never less than 0); `onEnd` is
/// told when it lets go (or the drag is taken away).
struct ReplySwipe: UIGestureRecognizerRepresentable {
    /// +1: the drag that counts goes right; −1: it goes left.
    let direction: CGFloat
    let onDrag: (CGFloat) -> Void
    let onEnd: () -> Void

    func makeUIGestureRecognizer(context: Context) -> SidewaysDragRecognizer {
        SidewaysDragRecognizer()
    }

    func updateUIGestureRecognizer(_ recognizer: SidewaysDragRecognizer, context: Context) {
        recognizer.direction = direction
    }

    func handleUIGestureRecognizerAction(_ recognizer: SidewaysDragRecognizer, context: Context) {
        switch recognizer.state {
        case .began, .changed: onDrag(max(0, recognizer.distance * direction))
        case .ended, .cancelled, .failed: onEnd()
        default: break
        }
    }
}

/// A one-finger drag that begins only when it goes sideways, the way `direction` says, before it
/// goes up or down: a drag that starts vertical is the list's scroll, and this one fails at once.
/// It begins a little sooner than the list's own pan would, so a sideways drag is never a scroll.
final class SidewaysDragRecognizer: UIGestureRecognizer {
    var direction: CGFloat = 1
    /// How far the finger has gone across since it went down (window points, + is right).
    private(set) var distance: CGFloat = 0
    private var start: CGPoint = .zero
    private let slop: CGFloat = 8
    /// The strip along the screen's left edge that the system's swipe back starts from.
    private static let edgeZone: CGFloat = 24

    override func touchesBegan(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesBegan(touches, with: event)
        guard touches.count == 1, let touch = touches.first, (event.allTouches?.count ?? 1) == 1 else {
            state = .failed
            return
        }
        // In the window's space: the list is drawn upside down, its rows the right way up again.
        start = touch.location(in: nil)
        distance = 0
        // A drag to the right from the screen's left edge is the way back, not a reply.
        if direction > 0, start.x < Self.edgeZone { state = .failed }
    }

    override func touchesMoved(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesMoved(touches, with: event)
        guard let touch = touches.first else { return }
        let p = touch.location(in: nil)
        let dx = p.x - start.x, dy = p.y - start.y
        switch state {
        case .possible:
            if abs(dy) > slop, abs(dy) >= abs(dx) { state = .failed }
            else if dx * direction < -slop { state = .failed }
            else if dx * direction > slop, abs(dx) > abs(dy) * 1.5 {
                distance = dx
                state = .began
            }
        case .began, .changed:
            distance = dx
            state = .changed
        default:
            break
        }
    }

    override func touchesEnded(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesEnded(touches, with: event)
        state = state == .began || state == .changed ? .ended : .failed
    }

    override func touchesCancelled(_ touches: Set<UITouch>, with event: UIEvent) {
        super.touchesCancelled(touches, with: event)
        state = state == .began || state == .changed ? .cancelled : .failed
    }

    override func reset() {
        super.reset()
        distance = 0
    }
}

// MARK: - A tap on the thread puts the keyboard away (round 10 §4)

/// Puts away whatever keyboard is up — the composer's, or the search's — the way UIKit says it: the
/// first responder resigns (and SwiftUI's focus follows it).
enum KeyboardAway {
    /// Said each time (round 22): a panel in the keyboard's place goes the same way.
    static let didAsk = Notification.Name("resonance.keyboardAway")

    static func now() {
        UIApplication.shared.sendAction(#selector(UIResponder.resignFirstResponder), to: nil, from: nil, for: nil)
        NotificationCenter.default.post(name: didAsk, object: nil)
    }
}

/// A tap on the thread — on the paper between messages, or on a message's words — puts the keyboard
/// away, as Messages does; dragging the list down takes it away with the finger
/// (`scrollDismissesKeyboard(.interactively)`). Before round 10 nothing did on a tap: the list only let
/// the keyboard go to a drag that reached it, and the owner tapped and tapped.
///
/// It is a UIKit tap on the list's own scroll view, never a SwiftUI gesture over the rows: it lets
/// every touch through (`cancelsTouchesInView` off), recognizes beside the list's other gestures, and
/// waits for the ones that are a message's own to fail first — a hold (the message's menu: the keyboard
/// stays where it is under it), a tap on a picture, a quote, a card or a link's page (`PartTapRecognizer`)
/// and a tap on a link in the words — so those still do only what they do. A control (a button) is
/// left alone too.
struct KeyboardTapAway: UIViewRepresentable {
    func makeUIView(context: Context) -> KeyboardTapAwayView { KeyboardTapAwayView() }
    func updateUIView(_ view: KeyboardTapAwayView, context: Context) {}
}

/// ``KeyboardTapAway``'s view: puts its tap on the scroll view it is drawn in, and takes it off again
/// when it leaves (the tap's target is this view).
final class KeyboardTapAwayView: UIView, UIGestureRecognizerDelegate {
    let tap = UITapGestureRecognizer()

    override init(frame: CGRect) {
        super.init(frame: frame)
        isUserInteractionEnabled = false
        isHidden = true
        tap.addTarget(self, action: #selector(tapped))
        tap.cancelsTouchesInView = false
        tap.delaysTouchesEnded = false
        tap.delegate = self
    }

    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override func didMoveToWindow() {
        super.didMoveToWindow()
        guard window != nil else {
            tap.view?.removeGestureRecognizer(tap)
            return
        }
        let enclosing = sequence(first: superview, next: { $0?.superview }).lazy.compactMap { $0 as? UIScrollView }.first
        if let enclosing, tap.view !== enclosing { attach(to: enclosing) }
    }

    func attach(to view: UIView) {
        tap.view?.removeGestureRecognizer(tap)
        view.addGestureRecognizer(tap)
    }

    @objc private func tapped() {
        if tap.state == .ended { KeyboardAway.now() }
    }

    /// Whether `other` is a message's own gesture, which a tap must leave its touch to.
    static func yields(to other: UIGestureRecognizer) -> Bool {
        other is UILongPressGestureRecognizer || other is PartTapRecognizer || other.view is ChatTextView
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldReceive touch: UITouch) -> Bool {
        !(touch.view is UIControl)
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer) -> Bool {
        true
    }

    func gestureRecognizer(_ g: UIGestureRecognizer, shouldRequireFailureOf other: UIGestureRecognizer) -> Bool {
        Self.yields(to: other)
    }
}
