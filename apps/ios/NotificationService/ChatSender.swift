import DesignSystem
import ImageIO
import Intents
import UIKit

/// Who a chat message's push is from, as the server names them beside the alert (FCM's data, at
/// the top of the payload): `type: "message"` with `conversationId` and `fromUserId`, the sender's
/// pen name as the alert's title, and their avatar as far as their profile has one —
/// `fromAvatarUrl` (a picture on our own storage), `fromInitials`, `fromColor` (a CSS `oklch(…)`).
/// The twin of Android's `ChatPush` face (`ChatAvatar`).
///
/// With it the notification service redraws the push as a message from a person
/// (`INSendMessageIntent`): their face where the app's icon stood, the icon at its corner. Any
/// other push — a bell row's, tonight's card, a note on an anonymous card, which names no
/// sender — is no `ChatSender` and shows as the server sent it.
struct ChatSender: Equatable, Sendable {
    let conversationId: String
    let userId: String
    let name: String
    let photo: URL?
    let initials: String
    /// Their colour as stored (a CSS `oklch(…)`), when the push says.
    let color: String?

    init?(userInfo: [AnyHashable: Any], title: String) {
        func text(_ key: String) -> String? {
            (userInfo[key] as? String).map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }.flatMap { $0.isEmpty ? nil : $0 }
        }
        let name = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard text("type") == "message", let conversationId = text("conversationId"), let userId = text("fromUserId"), !name.isEmpty else { return nil }
        self.conversationId = conversationId
        self.userId = userId
        self.name = name
        photo = text("fromAvatarUrl").flatMap(URL.init(string:)).flatMap { ["https", "http"].contains($0.scheme ?? "") ? $0 : nil }
        initials = text("fromInitials") ?? Self.initials(of: name)
        color = text("fromColor")
    }

    /// What an avatar without a photo shows, from a pen name, as the server makes it for a profile: its first two letters, upper case.
    static func initials(of name: String) -> String {
        String(name.trimmingCharacters(in: .whitespacesAndNewlines).prefix(2)).uppercased()
    }

    /// The message as Intents knows one: from this person, in this conversation, saying `body`.
    /// `face` (``picture(photo:side:)``) is their picture, on the person and on the intent's sender.
    func intent(body: String, face: Data?) -> INSendMessageIntent {
        let image = face.map(INImage.init(imageData:))
        let person = INPerson(personHandle: INPersonHandle(value: userId, type: .unknown), nameComponents: nil, displayName: name,
                              image: image, contactIdentifier: nil, customIdentifier: userId)
        let intent = INSendMessageIntent(recipients: nil, outgoingMessageType: .outgoingMessageText, content: body, speakableGroupName: nil,
                                         conversationIdentifier: conversationId, serviceName: nil, sender: person, attachments: nil)
        if let image { intent.setImage(image, forParameterNamed: \.sender) }
        return intent
    }

    // MARK: The face

    /// How wide the face is drawn, in pixels: the system shows it about 40 pt wide, cut round.
    static let side = 192

    /// The sender's face as a square PNG — the system cuts it round: their photo's middle square
    /// on their colour (a transparent photo sits on it, as in the app), else their initials in ink
    /// on it. Always light terracotta's ink and fallback colour, whatever the app wears, as
    /// Android's: the notification is the system's, and the face is the same sticker everywhere.
    @MainActor
    func picture(photo: CGImage?, side: Int = ChatSender.side) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        format.opaque = true
        let box = CGRect(x: 0, y: 0, width: side, height: side)
        return UIGraphicsImageRenderer(size: box.size, format: format).pngData { context in
            fill.setFill()
            context.fill(box)
            if let photo {
                // Its middle square, filling the face.
                let w = CGFloat(photo.width), h = CGFloat(photo.height)
                let scale = CGFloat(side) / min(w, h)
                UIImage(cgImage: photo).draw(in: CGRect(x: (CGFloat(side) - w * scale) / 2, y: (CGFloat(side) - h * scale) / 2, width: w * scale, height: h * scale))
            } else {
                let font = AppFonts.uiFont(.body, size: CGFloat(side) * HandDrawnAvatar.initialsScale(initials), weight: .bold)
                let ink = Palette.resolved(.text, accent: .terracotta, scheme: .light)
                let line = NSAttributedString(string: initials, attributes: [.font: font, .foregroundColor: ink])
                let size = line.size()
                line.draw(at: CGPoint(x: (CGFloat(side) - size.width) / 2, y: (CGFloat(side) - size.height) / 2))
            }
        }
    }

    /// Their colour as the light scheme draws it, else the avatar's own terracotta.
    var fill: UIColor {
        guard let color, let c = OKLCHColor.avatarFill(color, .light) else { return Palette.resolved(.terracottaLight, accent: .terracotta, scheme: .light) }
        return UIColor(OKLCHColor.color(c.L, c.C, c.H, alpha: 1))
    }

    /// A downloaded photo's pixels, no larger than the face needs (three times its side on the
    /// long edge, so a wide picture's middle square still fills it), turned as its EXIF says.
    static func decode(_ data: Data, side: Int = ChatSender.side) -> CGImage? {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { return nil }
        let options: [CFString: Any] = [
            kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true,
            kCGImageSourceThumbnailMaxPixelSize: side * 3,
        ]
        return CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary)
    }
}
