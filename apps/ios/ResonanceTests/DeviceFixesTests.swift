import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
import UIKit
@testable import Resonance

/// The owner's iPad, 2026-11-23: the first send's 傳送中 pushed the thread (it now hangs in the air under the newest
/// message, taking no room), and a thread reopened from a push stood its composer over a keyboard that wasn't there,
/// its field looking focused (the keyboard's height left by one that went while the app was behind is zeroed as the
/// app comes back, and the composer comes back unfocused).
@MainActor @Suite struct DeviceFixesTests {
    // MARK: 傳送中

    @Test func sendingUnderTheNewestTakesNoRoomAndAFailureKeepsItsRetryInTheLayout() {
        #expect(DeliveryLinePlace.of(.sending, newest: true) == .under)
        // An older message still on its way, with newer ones under it: no air to hang in, so in the layout as before.
        #expect(DeliveryLinePlace.of(.sending, newest: false) == .inline)
        #expect(DeliveryLinePlace.of(.failed, newest: true) == .inline)
        #expect(DeliveryLinePlace.of(.failed, newest: false) == .inline)
        #expect(DeliveryLinePlace.of(.sent, newest: true) == .none)
        #expect(DeliveryLinePlace.of(.delivered, newest: true) == .none)
    }

    @Test func aLineHungBelowTakesNoRoomAndStandsUnderTheFoot() async throws {
        // The bubble's box with and without the line hung from it: the same size — the list never moves for it.
        func size(_ view: some View) -> CGSize {
            UIHostingController(rootView: view).sizeThatFits(in: CGSize(width: 400, height: 1000))
        }
        let bare = size(Color.red.frame(width: 40, height: 30))
        let hung = size(Color.red.frame(width: 40, height: 30).hangingBelow(.trailing) {
            Text(verbatim: "傳送中，請稍候").font(.system(size: 11.5)).padding(.top, 4)
        })
        #expect(bare == hung)
        // On screen: the line's top on the bubble's foot, its trailing edge on the bubble's, wider than it, unwrapped,
        // and within the composer's clearance under the newest message.
        final class Frames { var bubble = CGRect.null, line = CGRect.null }
        let frames = Frames()
        let view = VStack(spacing: 0) {
            Color.red.frame(width: 40, height: 30)
                .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frames.bubble = $0 }
                .hangingBelow(.trailing) {
                    Text(verbatim: "傳送中，請稍候").font(.system(size: 11.5)).padding(.top, 4)
                        .onGeometryChange(for: CGRect.self) { $0.frame(in: .global) } action: { frames.line = $0 }
                }
            Spacer()
        }
        let scene = try #require(UIApplication.shared.connectedScenes.compactMap { $0 as? UIWindowScene }.first)
        let window = UIWindow(windowScene: scene)
        window.frame = CGRect(x: 0, y: 0, width: 300, height: 300)
        window.rootViewController = UIHostingController(rootView: view)
        window.makeKeyAndVisible()
        defer { window.isHidden = true }
        #expect(await eventually { !frames.bubble.isNull && !frames.line.isNull })
        #expect(abs(frames.line.minY - frames.bubble.maxY) < 0.5)
        #expect(abs(frames.line.maxX - frames.bubble.maxX) < 0.5)
        #expect(frames.line.width > frames.bubble.width)
        #expect(frames.line.height < 30)
        #expect(frames.line.height <= ComposerMetrics.clearance + 2)
    }

    @Test func theDebugSendDelayIsReadFromItsLaunchArgument() throws {
        let defaults = try #require(UserDefaults(suiteName: "send-delay-\(UUID().uuidString)"))
        #expect(ChatOutboxes.sendDelay(defaults) == nil)
        defaults.set(3, forKey: "threadSendDelay")
        #expect(ChatOutboxes.sendDelay(defaults) == 3)
        defaults.set(0, forKey: "threadSendDelay")
        #expect(ChatOutboxes.sendDelay(defaults) == nil)
        defaults.set(600, forKey: "threadSendDelay")
        #expect(ChatOutboxes.sendDelay(defaults) == 60)
    }

    // MARK: the keyboard's height as the app comes back

    private func watch(focused: @escaping @MainActor () -> Bool) throws -> (KeyboardWatch, NotificationCenter) {
        let center = NotificationCenter()
        let defaults = try #require(UserDefaults(suiteName: "keyboard-watch-\(UUID().uuidString)"))
        return (KeyboardWatch(center: center, defaults: defaults, textInputFocused: focused), center)
    }

    private let screen = CGRect(x: 0, y: 0, width: 1024, height: 1366)
    private var docked: CGRect { CGRect(x: 0, y: 1366 - 400, width: 1024, height: 400) }

    @Test func comingBackWithNoFieldFocusedZeroesAKeyboardThatNeverSaidItWent() throws {
        let (keyboard, center) = try watch(focused: { false })
        keyboard.changed(docked, screen: screen, landscape: false)
        #expect(keyboard.height == 400)
        #expect(keyboard.onScreen)
        // The app went behind with the keyboard up; its hide never came. Back in front:
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        #expect(keyboard.height == 0)
        #expect(!keyboard.onScreen)
        #expect(!keyboard.floats)
        // What it remembered for a panel stays: only what is on screen now was stale.
        #expect(keyboard.memory.portrait == 400)
    }

    @Test func aFieldStillFocusedKeepsItsKeyboard() throws {
        let (keyboard, center) = try watch(focused: { true })
        keyboard.changed(docked, screen: screen, landscape: false)
        center.post(name: UIApplication.didBecomeActiveNotification, object: nil)
        #expect(keyboard.height == 400)
        #expect(keyboard.onScreen)
    }

    @Test func goingBehindSettlesTooAndSettleIsSynchronous() throws {
        var focused = true
        let (keyboard, center) = try watch(focused: { focused })
        keyboard.changed(docked, screen: screen, landscape: false)
        // The thread let its field go as the app went behind.
        focused = false
        center.post(name: UIApplication.didEnterBackgroundNotification, object: nil)
        #expect(keyboard.height == 0)
        // A floating keyboard (not docked) left standing is cleared the same way.
        focused = true
        keyboard.changed(CGRect(x: 200, y: 600, width: 320, height: 260), screen: screen, landscape: false)
        #expect(keyboard.floats)
        focused = false
        keyboard.settle()
        #expect(!keyboard.floats && !keyboard.onScreen)
    }

    // MARK: reopened from a push

    @Test func aConversationOpenedAgainWhileItShowsIsToldSo() {
        let center = NotificationCenter()
        final class Count: @unchecked Sendable { var n = 0 }
        let count = Count()
        let token = center.addObserver(forName: ThreadReturn.didAsk, object: nil, queue: nil) { _ in count.n += 1 }
        defer { center.removeObserver(token) }
        let shown = Route.thread(handle: "bob", uid: "u_bob", note: nil)
        let again = Route.thread(handle: "Bob", uid: "u_bob", note: nil)
        #expect(again.reopens(shown))
        ThreadReturn.ask(center)
        #expect(count.n == 1)
        // Two panes: the same conversation chosen again leaves the path as it is (and so is told, not re-pushed).
        #expect(MessagesPanes.choose(again, in: [shown]) == [shown])
    }
}
