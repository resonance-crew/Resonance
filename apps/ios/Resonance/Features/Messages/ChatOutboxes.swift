import Foundation
import ResonanceKit

/// One `Outbox` per conversation, kept for as long as the person is signed in: a message sent
/// from a thread goes on being sent when the thread is covered by a profile or left, and a failure
/// waits there to be retried when they come back. Emptied when the account signs out or another
/// signs in. The twin of Android's ChatOutboxes.
///
/// A message with a picture is two calls in its turn (round 7 §4.2): the picture is uploaded under
/// the message's own client id, then the message names it. A picture the server has already kept is
/// not uploaded again when the message is retried (and one that was would be the same picture: the
/// client id finds it).
@MainActor
final class ChatOutboxes {
    private var boxes: [String: Outbox] = [:]
    private let messaging: () -> MessagingAPI
    /// The first message a person sends is the moment to ask for notifications (see `PushCenter.reachedOut`).
    private let sent: () -> Void
    /// Pictures the server has kept, by the client id of the message they go with.
    private var uploaded: [String: ChatImage] = [:]

    init(messaging: @escaping () -> MessagingAPI, sent: @escaping () -> Void) {
        self.messaging = messaging
        self.sent = sent
    }

    /// The outbox of the conversation `pairId` with `to`.
    func of(_ pairId: String, to: String) -> Outbox {
        if let box = boxes[pairId] { return box }
        let messaging = messaging, sent = sent
        let box = Outbox { [weak self] m in
            guard let self else { throw CancellationError() }
            var image: ChatImage?
            if let picture = m.picture { image = try await upload(picture, of: m, to: to, with: messaging()) }
            let answer = try await messaging().sendMessage(to: to, text: m.text, cardRef: m.cardRef, noteRef: m.noteRef,
                                                           replyTo: m.replyTo?.id, clientId: m.clientId, image: image?.id,
                                                           sticker: m.sticker, album: m.album)
            uploaded[m.clientId] = nil
            sent()
            return answer.id
        }
        boxes[pairId] = box
        return box
    }

    /// The message's picture, kept by the server under the message's client id (once).
    private func upload(_ picture: Outbox.Picture, of m: Outbox.Outgoing, to: String, with messaging: MessagingAPI) async throws -> ChatImage {
        if let kept = uploaded[m.clientId] { return kept }
        let kept = try await messaging.uploadChatImage(picture.data, contentType: picture.contentType, filename: picture.filename,
                                                       to: to, clientId: m.clientId)
        uploaded[m.clientId] = kept
        return kept
    }

    /// The conversation was deleted: what was waiting to go to it goes too.
    func forget(_ pairId: String) {
        boxes.removeValue(forKey: pairId)?.clear()
    }

    func clear() {
        boxes.values.forEach { $0.clear() }
        boxes = [:]
        uploaded = [:]
    }
}
