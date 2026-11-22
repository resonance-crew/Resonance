import DesignSystem
import Intents
import Testing
import UIKit

/// The notification service's part (NotificationService/ChatSender.swift, compiled into these
/// tests as source): who a chat message's push is from, the message Intents is told of, and the
/// face the system draws in the app icon's place.
@MainActor
@Suite struct ChatSenderTests {
    /// What the server puts beside the alert of a message push the system shows (pushChat.ts: the sender's face rides along).
    let info: [AnyHashable: Any] = [
        "type": "message", "route": "/messages/%E5%B0%8F%E6%98%8E", "fromUserId": "bob", "conversationId": "alice_bob", "messageId": "m1",
        "fromAvatarUrl": "https://img.resonance.channel/avatars/2026-10/a.webp", "fromInitials": "小明", "fromColor": "oklch(90% 0.06 140)",
        "aps": ["alert": ["title": "小明", "body": "明天一起去散步嗎？"], "thread-id": "alice_bob", "mutable-content": 1],
    ]

    private func with(_ key: String, _ value: Any?) -> [AnyHashable: Any] {
        var copy = info
        copy[key] = value
        return copy
    }

    @Test func readsTheSenderTheServerNames() throws {
        let sender = try #require(ChatSender(userInfo: info, title: " 小明 "))
        #expect(sender.conversationId == "alice_bob")
        #expect(sender.userId == "bob")
        #expect(sender.name == "小明")
        #expect(sender.photo?.absoluteString == "https://img.resonance.channel/avatars/2026-10/a.webp")
        #expect(sender.initials == "小明")
        #expect(sender.color == "oklch(90% 0.06 140)")

        // An older server names no face: the initials are the pen name's first two letters, as a profile's are.
        let bare = try #require(ChatSender(userInfo: with("fromAvatarUrl", nil).filter { !["fromInitials", "fromColor"].contains($0.key as? String) }, title: "bob the builder"))
        #expect(bare.photo == nil && bare.color == nil)
        #expect(bare.initials == "BO")
        // A picture that is no web address is no photo.
        #expect(ChatSender(userInfo: with("fromAvatarUrl", "file:///var/mobile/x.png"), title: "小明")?.photo == nil)
    }

    @Test func onlyAMessageFromANamedPersonIsRedrawn() {
        // A bell row's push, tonight's card, a note on an anonymous card (no `fromUserId`): shown as the server sent them.
        #expect(ChatSender(userInfo: with("type", "resonance"), title: "小明") == nil)
        #expect(ChatSender(userInfo: with("type", "pick"), title: "小明") == nil)
        #expect(ChatSender(userInfo: with("fromUserId", nil), title: "小明") == nil)
        #expect(ChatSender(userInfo: with("fromUserId", " "), title: "小明") == nil)
        #expect(ChatSender(userInfo: with("conversationId", nil), title: "小明") == nil)
        #expect(ChatSender(userInfo: with("conversationId", 42), title: "小明") == nil)
        #expect(ChatSender(userInfo: info, title: "  ") == nil)
    }

    @Test func theIntentIsAMessageFromThatPersonInThatConversation() throws {
        let sender = try #require(ChatSender(userInfo: info, title: "小明"))
        let face = sender.picture(photo: nil)
        let intent = sender.intent(body: "明天一起去散步嗎？", face: face)
        #expect(intent.content == "明天一起去散步嗎？")
        #expect(intent.conversationIdentifier == "alice_bob")
        #expect(intent.sender?.displayName == "小明")
        // By their id, not their pen name (which may change): what a block deletes by, and the system matches people by.
        #expect(intent.sender?.customIdentifier == "bob")
        #expect(intent.sender?.personHandle?.value == "bob")
        #expect(intent.sender?.image != nil)
        #expect(intent.image(forParameterNamed: \.sender) != nil)
        // One to one: no group's name, nobody else.
        #expect(intent.speakableGroupName == nil)
        #expect(intent.recipients == nil)
        // Without a face (it could not be drawn) the message still names its sender.
        #expect(sender.intent(body: "hi", face: nil).sender?.image == nil)
    }

    /// A pixel of a PNG, as 8-bit sRGB.
    private func pixel(_ png: Data, _ x: Int, _ y: Int) throws -> (r: Int, g: Int, b: Int, a: Int) {
        let image = try #require(UIImage(data: png)?.cgImage)
        var out = [UInt8](repeating: 0, count: 4)
        let space = try #require(CGColorSpace(name: CGColorSpace.sRGB))
        let context = try #require(CGContext(data: &out, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: space,
                                             bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue))
        context.draw(image, in: CGRect(x: -x, y: y - image.height + 1, width: image.width, height: image.height))
        return (Int(out[0]), Int(out[1]), Int(out[2]), Int(out[3]))
    }

    private func rgb(_ color: UIColor) -> (r: Int, g: Int, b: Int) {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        let srgb = color.cgColor.converted(to: CGColorSpace(name: CGColorSpace.sRGB)!, intent: .defaultIntent, options: nil)!
        (r, g, b, a) = (srgb.components![0], srgb.components![1], srgb.components![2], srgb.alpha)
        func byte(_ x: CGFloat) -> Int { Int((min(1, max(0, x)) * 255).rounded()) }
        return (byte(r), byte(g), byte(b))
    }

    private func near(_ got: (r: Int, g: Int, b: Int, a: Int), _ want: (r: Int, g: Int, b: Int), slack: Int = 6) -> Bool {
        abs(got.r - want.r) <= slack && abs(got.g - want.g) <= slack && abs(got.b - want.b) <= slack
    }

    @Test func withoutAPhotoTheFaceIsTheirInitialsOnTheirColourToEveryCorner() throws {
        let sender = try #require(ChatSender(userInfo: info, title: "小明"))
        let png = sender.picture(photo: nil)
        let image = try #require(UIImage(data: png)?.cgImage)
        #expect(image.width == 192 && image.height == 192)
        // Square and opaque: the system cuts it round, and no corner is left clear for it to plate.
        let fill = rgb(sender.fill)
        for (x, y) in [(0, 0), (191, 0), (0, 191), (191, 191), (96, 8)] {
            let p = try pixel(png, x, y)
            #expect(p.a == 255)
            #expect(near(p, fill), "the colour at \(x),\(y)")
        }
        // Their stored pastel, as the light scheme draws it.
        let stored = try #require(OKLCHColor.avatarFill("oklch(90% 0.06 140)", .light))
        #expect(near((fill.r, fill.g, fill.b, 255), rgb(UIColor(OKLCHColor.color(stored.L, stored.C, stored.H))), slack: 1))
        // The initials are inked somewhere across the middle.
        let inked = try (40..<152).contains { x in try !near(pixel(png, x, 96), fill, slack: 24) }
        #expect(inked)

        // No colour on the profile (an older server): the avatar's own terracotta, in light — whatever the app wears.
        let plain = try #require(ChatSender(userInfo: with("fromColor", nil), title: "小明"))
        #expect(near(try pixel(plain.picture(photo: nil), 2, 2), rgb(Palette.resolved(.terracottaLight, accent: .terracotta, scheme: .light)), slack: 1))
        #expect(near(try pixel(try #require(ChatSender(userInfo: with("fromColor", "url(javascript:x)"), title: "小明")).picture(photo: nil), 2, 2),
                     rgb(Palette.resolved(.terracottaLight, accent: .terracotta, scheme: .light)), slack: 1))
    }

    @Test func aPhotosMiddleSquareFillsTheFace() throws {
        // A wide photo: blue in its middle square, red at both ends — as the storage would serve it, PNG here.
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        let wide = UIGraphicsImageRenderer(size: CGSize(width: 300, height: 100), format: format).pngData { context in
            UIColor(red: 1, green: 0, blue: 0, alpha: 1).setFill()
            context.fill(CGRect(x: 0, y: 0, width: 300, height: 100))
            UIColor(red: 0, green: 0, blue: 1, alpha: 1).setFill()
            context.fill(CGRect(x: 100, y: 0, width: 100, height: 100))
        }
        let photo = try #require(ChatSender.decode(wide))
        // Read no larger than the face needs.
        #expect(max(photo.width, photo.height) <= ChatSender.side * 3)
        let sender = try #require(ChatSender(userInfo: info, title: "小明"))
        let png = sender.picture(photo: photo)
        for (x, y) in [(96, 96), (3, 3), (188, 3), (3, 188), (188, 188)] {
            #expect(near(try pixel(png, x, y), (0, 0, 255)), "the photo at \(x),\(y)")
        }
        // What isn't a picture is no photo (the face is then the initials).
        #expect(ChatSender.decode(Data("<html>".utf8)) == nil)
    }
}
