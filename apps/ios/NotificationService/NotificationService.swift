import DesignSystem
import Intents
import UserNotifications

/// Redraws a chat message's push before it shows (the server marks those `mutable-content`): as a
/// message from a person — a communication notification — so the sender's face stands where the
/// app's icon did, the icon at its corner, and the system knows who wrote (``ChatSender``). The
/// face is their photo, read from our storage (kept by the URL cache: a photo's address never
/// changes), else their initials on their colour.
///
/// Whatever goes wrong — no sender in the push, the photo too slow, the system out of patience
/// (`serviceExtensionTimeWillExpire`) — the push shows as the server sent it, once.
final class NotificationService: UNNotificationServiceExtension {
    private let delivery = Delivery()

    override func didReceive(_ request: UNNotificationRequest, withContentHandler contentHandler: @escaping (UNNotificationContent) -> Void) {
        delivery.begin(request.content, contentHandler)
        guard let sender = ChatSender(userInfo: request.content.userInfo, title: request.content.title) else { return delivery.finish() }
        let body = request.content.body
        Task { [delivery] in
            let photo = await Self.photo(sender.photo)
            let face = await Self.face(sender, photo: photo)
            let intent = sender.intent(body: body, face: face)
            // Told to the system as a message that came in, under its conversation (what a block or a sign-out deletes).
            let interaction = INInteraction(intent: intent, response: nil)
            interaction.direction = .incoming
            interaction.groupIdentifier = sender.conversationId
            try? await interaction.donate()
            delivery.finish(redrawnFrom: intent)
        }
    }

    override func serviceExtensionTimeWillExpire() {
        delivery.finish()
    }

    /// The sender's photo, when the push names one and it comes in time.
    private static func photo(_ url: URL?) async -> Data? {
        guard let url else { return nil }
        var request = URLRequest(url: url, cachePolicy: .returnCacheDataElseLoad, timeoutInterval: photoSeconds)
        request.setValue("image/*", forHTTPHeaderField: "Accept")
        guard let (data, response) = try? await URLSession.shared.data(for: request),
              (response as? HTTPURLResponse).map({ (200..<300).contains($0.statusCode) }) ?? true,
              data.count <= photoBytes else { return nil }
        return data
    }

    @MainActor
    private static func face(_ sender: ChatSender, photo: Data?) -> Data {
        fonts
        return sender.picture(photo: photo.flatMap { ChatSender.decode($0) })
    }

    /// The app's own typefaces, for the initials: they ship in the app's bundle, which this
    /// extension sits inside (`Resonance.app/PlugIns/…`, on the Mac `Resonance.app/Contents/PlugIns/…`).
    @MainActor
    private static let fonts: Void = {
        var url = Bundle.main.bundleURL
        while url.pathExtension != "app", url.pathComponents.count > 1 { url.deleteLastPathComponent() }
        if let app = Bundle(url: url) { AppFonts.register(bundle: app) }
    }()

    /// How long the photo may take before the face is the initials instead (the system allows the whole redraw about 30 s).
    private static let photoSeconds: TimeInterval = 8
    /// An avatar is a small picture; anything larger than this is not drawn.
    private static let photoBytes = 4 << 20
}

/// The push and the system's handler, used once: by the redraw when it is done, or by the
/// system's deadline — whichever is first (they run on different threads).
private final class Delivery: @unchecked Sendable {
    private let lock = NSLock()
    private var content: UNNotificationContent?
    private var handler: ((UNNotificationContent) -> Void)?

    func begin(_ content: UNNotificationContent, _ handler: @escaping (UNNotificationContent) -> Void) {
        lock.withLock {
            self.content = content
            self.handler = handler
        }
    }

    /// Hands the system the push redrawn from `intent` — or, without one or when the system refuses it, as it came.
    func finish(redrawnFrom intent: INSendMessageIntent? = nil) {
        let (content, handler) = lock.withLock {
            defer { self.handler = nil }
            return (self.content, self.handler)
        }
        guard let content, let handler else { return }
        handler(intent.flatMap { try? content.updating(from: $0) } ?? content)
    }
}
