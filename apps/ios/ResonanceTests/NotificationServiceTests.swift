import Foundation
import Synchronization
import Testing
import UserNotifications

/// The notification service extension itself (NotificationService/NotificationService.swift,
/// compiled into these tests as source): every push is handed back to the system exactly once —
/// a chat message under its sender's name, anything else as it came, and whatever the redraw
/// was doing when the system's patience ran out.
@Suite struct NotificationServiceTests {
    /// What the system got back, and how many times.
    private final class Handed: Sendable {
        private let got = Mutex<[(title: String, body: String, thread: String, keys: Set<String>)]>([])
        func take(_ content: UNNotificationContent) {
            let keys = Set(content.userInfo.keys.compactMap { $0 as? String })
            got.withLock { $0.append((content.title, content.body, content.threadIdentifier, keys)) }
        }
        var all: [(title: String, body: String, thread: String, keys: Set<String>)] { got.withLock { $0 } }
    }

    private func request(_ info: [AnyHashable: Any], title: String, body: String, thread: String = "") -> UNNotificationRequest {
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.threadIdentifier = thread
        content.userInfo = info
        return UNNotificationRequest(identifier: UUID().uuidString, content: content, trigger: nil)
    }

    private let message: [AnyHashable: Any] = [
        "type": "message", "route": "/messages/x", "fromUserId": "bob", "conversationId": "alice_bob", "messageId": "m1",
        "fromInitials": "小明", "fromColor": "oklch(90% 0.06 140)",
    ]

    /// Waits until `handed` has something (the redraw runs in a task of its own), at most two seconds.
    private func settled(_ handed: Handed) async throws {
        for _ in 0..<200 where handed.all.isEmpty { try await Task.sleep(for: .milliseconds(10)) }
    }

    @Test func aPushThatIsNoChatMessageIsHandedBackAtOnceAsItCame() {
        let handed = Handed()
        // A bell row's push — a note on an anonymous card among them, which names no sender.
        NotificationService().didReceive(request(["type": "note", "route": "/card/walk", "notificationId": "n1"], title: "Resonance", body: "有人留了小紙條"),
                                         withContentHandler: handed.take)
        #expect(handed.all.count == 1)
        #expect(handed.all.first?.title == "Resonance")
        #expect(handed.all.first?.body == "有人留了小紙條")
    }

    @Test func aChatMessageIsHandedBackOnceWithItsWordsAndItsKeys() async throws {
        let handed = Handed()
        let service = NotificationService()
        service.didReceive(request(message, title: "小明", body: "明天一起去散步嗎？", thread: "alice_bob"), withContentHandler: handed.take)
        try await settled(handed)
        // The system's deadline after the redraw is done hands nothing a second time.
        service.serviceExtensionTimeWillExpire()
        #expect(handed.all.count == 1)
        let got = try #require(handed.all.first)
        #expect(got.title == "小明")
        #expect(got.body == "明天一起去散步嗎？")
        // What the app opens a tapped push by, and tells a conversation's pushes by, is still there.
        #expect(got.thread == "alice_bob")
        #expect(got.keys.isSuperset(of: ["type", "route", "fromUserId", "conversationId", "messageId"]))
    }

    @Test func theDeadlineHandsThePushBackAsItCameAndTheRedrawThenHandsNothing() async throws {
        let handed = Handed()
        let service = NotificationService()
        // A photo that never comes (nothing listens there): the redraw is still waiting when the system's patience ends.
        var slow = message
        slow["fromAvatarUrl"] = "http://127.0.0.1:9/avatars/a.webp"
        service.didReceive(request(slow, title: "小明", body: "hi", thread: "alice_bob"), withContentHandler: handed.take)
        service.serviceExtensionTimeWillExpire()
        #expect(handed.all.count == 1)
        #expect(handed.all.first?.title == "小明")
        try await Task.sleep(for: .milliseconds(300))
        #expect(handed.all.count == 1)
    }
}
