import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Round 32 §P7 (the owner: 「App 冷启动（后台进程已被系统清掉）后点击推送通知 → 进入目标页并显示出消息的耗时优化（目前
/// iPad 实测约 2–3 秒）」). Measured on the simulator (LaunchTrace): the tapped push reached the delegate ~0.5 s after the
/// first frame, after the tabs had opened home and its feed; the thread then drew nothing until the ID token and the
/// network's answer. Now the scene's connection hands the tap over before the first frame, a conversation's push opens
/// the tabs on Messages (home is never mounted), and the thread draws what this device last read of it at once.
@MainActor @Suite struct ColdStartPushTests {
    private let chat: [AnyHashable: Any] = [
        "type": "message", "route": "/messages/bob", "fromUserId": "bob", "conversationId": "alice_bob", "messageId": "m1",
        "toUserId": "alice",
    ]

    /// The same tap handed over twice — at the scene's connection, then to `didReceive` — opens once; another push, or
    /// the same one tapped again later, opens again.
    @Test func theSameTapHandedOverTwiceOpensOnce() {
        let push = PushCenter()
        let at = Date(timeIntervalSince1970: 1_800_000_000)
        push.open(userInfo: chat, now: at)
        #expect(push.opened?.route == "/messages/bob")
        push.opened = nil
        push.open(userInfo: chat, now: at.addingTimeInterval(0.6))
        #expect(push.opened == nil)
        var other = chat
        other["messageId"] = "m2"
        push.open(userInfo: other, now: at.addingTimeInterval(1))
        #expect(push.opened?.route == "/messages/bob")
        push.opened = nil
        push.open(userInfo: other, now: at.addingTimeInterval(1 + PushCenter.sameTap + 1))
        #expect(push.opened != nil)
    }

    /// A conversation's push opens the tabs on Messages; a card's, the notifications' or none on home, as before; a
    /// message pushed to another account opens nothing (home).
    @Test func aConversationsPushOpensTheTabsOnMessages() {
        func opened(_ route: String, to: String? = nil) -> PushCenter.Opened {
            PushCenter.Opened(route: route, notificationId: nil, fromUserId: "bob",
                              chat: to.map { ChatPush(conversationId: "alice_bob", fromUserId: "bob", toUserId: $0, route: route) })
        }
        #expect(MainTabView.firstTab(opened("/messages/bob", to: "alice"), signedIn: "alice") == .messages)
        #expect(MainTabView.firstTab(opened("/messages/bob?note=n1&card=c1"), signedIn: "alice") == .messages)
        #expect(MainTabView.firstTab(opened("/messages/bob", to: "carol"), signedIn: "alice") == .feed)
        #expect(MainTabView.firstTab(opened("/card/rich-story"), signedIn: "alice") == .feed)
        #expect(MainTabView.firstTab(opened(""), signedIn: "alice") == .feed)
        #expect(MainTabView.firstTab(nil, signedIn: "alice") == .feed)
    }

    /// The thread kept from the last read is drawn only while nothing better is held, for the screen still listening —
    /// and once messages are held, they show in place of the skeleton.
    @Test func theKeptThreadIsDrawnBeforeTheNetworkAndNeverOverIt() {
        #expect(ThreadModel.drawsKept(run: 1, listening: 1, closed: false, ready: false, held: false))
        #expect(!ThreadModel.drawsKept(run: 1, listening: 1, closed: false, ready: true, held: false))
        #expect(!ThreadModel.drawsKept(run: 1, listening: 1, closed: false, ready: false, held: true))
        #expect(!ThreadModel.drawsKept(run: 1, listening: 2, closed: false, ready: false, held: false))
        #expect(!ThreadModel.drawsKept(run: 1, listening: 1, closed: true, ready: false, held: false))
        #expect(ThreadScreen.showsSkeleton(ready: true, threadReady: false, held: false))
        #expect(!ThreadScreen.showsSkeleton(ready: true, threadReady: false, held: true))
        #expect(ThreadScreen.showsSkeleton(ready: false, threadReady: false, held: true))
        #expect(!ThreadScreen.showsSkeleton(ready: true, threadReady: true, held: false))
    }

    /// Wired where the launch goes: the scene's connection opens the push; the thread draws its kept window before
    /// asking, and keeps the newest window the server sends (and forgets a conversation that is gone).
    @Test func theLaunchHandsTheTapOverAndTheThreadKeepsItsWindow() throws {
        let here = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
        let push = try String(contentsOf: here.appending(path: "../Resonance/Services/PushCenter.swift").standardized, encoding: .utf8)
        let connect = try #require(push.range(of: "configurationForConnecting connectingSceneSession")).upperBound
        #expect(String(push[connect...].prefix(500)).contains("PushCenter.shared.open(userInfo: response.notification.request.content.userInfo)"))
        let thread = try String(contentsOf: here.appending(path: "../Resonance/Features/Messages/ThreadModel.swift").standardized, encoding: .utf8)
        #expect(thread.contains("drawKept(pairId)\n        pullThread()"))
        #expect(thread.contains("session.kept.save(window.messages, as: .thread(pair), uid: uid)"))
        #expect(thread.contains("session.kept.remove(.thread(pair), uid: uid)"))
    }
}
