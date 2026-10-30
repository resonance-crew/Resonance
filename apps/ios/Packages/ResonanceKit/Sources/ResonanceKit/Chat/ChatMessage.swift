import Foundation

/// Where a message of this person's own stands: `delivered` is a document the conversation
/// holds; the rest are still on their way. The twin of Android's `Delivery`.
public enum Delivery: Equatable, Sendable {
    /// A document of the conversation (read from Firestore).
    case delivered
    /// Waiting in the outbox, or being sent.
    case sending
    /// The server took it; the conversation's listener hasn't shown it yet (drawn as delivered,
    /// but it can't be replied to yet).
    case sent
    /// The server refused it, or the network did: it stays in the thread with a retry until the
    /// person retries or deletes it.
    case failed
}

/// What a reply carries of the message it answers (the server's `replyTo` snapshot, kept on the
/// reply): the quote is read from here, never from the original, which may be far up the thread
/// or gone. `text` is at most `maxText` code points; empty when the original was a card or a
/// picture alone (`image`: it carried one — a quote is words, so only that it did). An original
/// its sender unsent leaves `{ id, senderId, unsent: true }` (round 16 §3): the quote then says so
/// (`unsent`) and nothing of what it said.
public struct ReplyQuote: Equatable, Hashable, Sendable, Codable {
    public static let maxText = 140

    public let id: String
    public let senderId: String
    public let text: String
    public let cardRef: String?
    public let image: Bool
    /// The original was unsent: the quote reads 已收回的訊息 (`messages.unsentQuote`).
    public let unsent: Bool
    /// The original was a sticker (round 22): the quote shows its key pose and its name; `text` is its
    /// fallback words (〔貼圖：謝謝〕), for a sticker this build doesn't know.
    public let sticker: StickerRef?

    public init(id: String, senderId: String, text: String, cardRef: String? = nil, image: Bool = false, unsent: Bool = false,
                sticker: StickerRef? = nil) {
        self.id = id
        self.senderId = senderId
        self.text = unsent ? "" : text
        self.cardRef = unsent ? nil : cardRef
        self.image = unsent ? false : image
        self.unsent = unsent
        self.sticker = unsent ? nil : sticker
    }

    /// The quote a reply to `message` carries (the same cut the server makes).
    public static func of(_ message: ChatMessage) -> ReplyQuote {
        ReplyQuote(id: message.id, senderId: message.senderId, text: cut(message.text), cardRef: message.cardRef,
                   image: message.image != nil, unsent: message.isUnsent, sticker: message.sticker)
    }

    /// What the quote says: its words — or, with none, what the message was: a picture
    /// (`picture`, 一張圖片) or a card (`card`, 一張卡片); an unsent original, `unsentQuote`; a sticker,
    /// what `stickerName` calls it (its fallback words when it doesn't know it).
    public func summary(picture: String, card: String, unsentQuote: String = "",
                        stickerName: ((StickerRef) -> String?)? = nil) -> String {
        if unsent { return unsentQuote }
        if let sticker, let name = stickerName?(sticker) { return name }
        guard text.isEmpty else { return text }
        return image ? picture : card
    }

    /// At most `maxText` code points (Unicode scalars, so never half of a surrogate pair).
    public static func cut(_ text: String) -> String {
        let scalars = text.unicodeScalars
        guard scalars.count > maxText else { return text }
        var out = String.UnicodeScalarView()
        out.append(contentsOf: scalars.prefix(maxText))
        return String(out)
    }
}

/// A picture sent in a message (its document's `image: { id, width, height }`): read through the
/// API with the viewer's credentials (GET /api/v1/chat-images/{id}), never a plain address, and
/// only by the two people of its conversation. Its size as kept lets the bubble take its shape
/// before the picture arrives. For a message still on its way the id is its client id, which the
/// server makes the picture's id.
public struct ChatImage: Equatable, Hashable, Identifiable, Sendable {
    public let id: String
    public let width: Int
    public let height: Int

    public init(id: String, width: Int, height: Int) {
        self.id = id
        self.width = width
        self.height = height
    }

    /// The `image` field of a message document, or nil for none (or one without an id).
    public static func from(_ map: [String: Any]?) -> ChatImage? {
        guard let map, let id = map["id"] as? String, !id.isEmpty else { return nil }
        func side(_ key: String) -> Int { max(0, (map[key] as? NSNumber)?.intValue ?? 0) }
        return ChatImage(id: id, width: side("width"), height: side("height"))
    }
}

/// The unfurled page of the first link in a message, which the server writes a moment after the
/// message itself (so a message is drawn without it and again when it arrives). `link` is the
/// address as `ChatLinks.parse` accepted it — what a tap opens, with the ASCII host to show and
/// whether to ask first. `imageURL` is the server's site-relative `/api/link-image?…` path
/// resolved against the API's origin, and only ever a picture of that proxy.
public struct LinkPreview: Equatable, Sendable {
    public let link: ChatLinks.Parsed
    public let title: String
    public let description: String?
    public let siteName: String?
    public let imageURL: URL?

    public init(link: ChatLinks.Parsed, title: String, description: String? = nil, siteName: String? = nil, imageURL: URL? = nil) {
        self.link = link
        self.title = title
        self.description = description
        self.siteName = siteName
        self.imageURL = imageURL
    }

    /// The normalized http(s) address of the page.
    public var url: URL { link.url }
}

/// One message of a conversation as the thread draws it (a document of
/// `conversations/{pair}/messages`, or one of this person's own still on its way). The twin of
/// Android's `ChatMessage`.
///
/// `key` is the identity a list keeps a row by: the id, except that a message sent from here
/// keeps the key it had while it was sending (the client id), so the row doesn't jump when the
/// document replaces it. `id` is the document's id; for a message still on its way it is the
/// client id, which the server uses as the document id.
public struct ChatMessage: Equatable, Sendable {
    public let id: String
    public let senderId: String
    public let text: String
    public let sentAt: Date
    public let cardRef: String?
    public let noteRef: MessagingAPI.NoteRef?
    /// A note left on a card (`kind: 'note'`), which the server copies into the conversation: its
    /// `cardRef` is the card it was left on — the note's author's words to that card's author — and
    /// the thread draws that card above the words, the way a reply draws its quote. Any other kind
    /// the server may add one day reads as a plain message.
    public let isNote: Bool
    /// The message this one answers, as it read when the reply was sent.
    public var replyTo: ReplyQuote?
    /// The first link's page; the server writes it a moment after the message.
    public var preview: LinkPreview?
    /// A picture sent with it (a message carries a card or a picture, never both).
    public let image: ChatImage?
    /// A 小紙團 sticker (round 22): the message carries nothing else — its `text` is the sticker's
    /// fallback words, drawn only by a build that can't draw the sticker.
    public let sticker: StickerRef?
    /// One of several pictures sent together (round 22): the thread draws one sender's consecutive
    /// pictures of an album as one grid.
    public let album: AlbumRef?
    /// The two people's reactions to it (round 16 §4): each one's uid → the reaction's id as the
    /// server stores it (`heart`, `moved`, `laugh`, `hug`, `thumbs`). An id this build doesn't know
    /// is kept here and drawn as nothing (``knownReactions(_:)``).
    public var reactions: [String: String]
    /// Its sender unsent it (round 16 §3: the document keeps only `senderId`, `sentAt` and
    /// `unsentAt`): the thread draws one quiet line in its place, and nothing it said.
    public var isUnsent: Bool
    /// The card it shares (`cardRef`) is its sender's 私人卡, and this message is the recipient's pass to
    /// read it (the document's `privateShare: true`, written by the server). It goes when the sender stops
    /// sharing it (停止分享) — while the thread is open too, so it is part of what makes two messages the same.
    public var privateShare: Bool
    public var delivery: Delivery
    public var key: String

    public init(id: String, senderId: String, text: String, sentAt: Date, cardRef: String? = nil, noteRef: MessagingAPI.NoteRef? = nil,
                isNote: Bool = false, replyTo: ReplyQuote? = nil, preview: LinkPreview? = nil, image: ChatImage? = nil,
                sticker: StickerRef? = nil, album: AlbumRef? = nil,
                reactions: [String: String] = [:], isUnsent: Bool = false, privateShare: Bool = false,
                delivery: Delivery = .delivered, key: String? = nil) {
        self.id = id
        self.senderId = senderId
        self.isUnsent = isUnsent
        // An unsent message says nothing: whatever an older snapshot held is not drawn.
        self.text = isUnsent ? "" : text
        self.sentAt = sentAt
        self.cardRef = isUnsent ? nil : cardRef
        self.noteRef = isUnsent ? nil : noteRef
        self.isNote = isUnsent ? false : isNote
        self.replyTo = isUnsent ? nil : replyTo
        self.preview = isUnsent ? nil : preview
        self.image = isUnsent ? nil : image
        self.sticker = isUnsent ? nil : sticker
        self.album = isUnsent ? nil : album
        self.reactions = isUnsent ? [:] : reactions
        self.privateShare = !isUnsent && cardRef != nil && privateShare
        self.delivery = delivery
        self.key = key ?? id
    }

    /// The reactions to draw, in the stickers' order (`order`, the ids this build knows: heart, moved,
    /// laugh, hug, thumbs), each with the people who gave it — an id outside `order` is left out.
    public func knownReactions(_ order: [String]) -> [(id: String, by: [String])] {
        order.compactMap { id in
            let by = reactions.filter { $0.value == id }.map(\.key).sorted()
            return by.isEmpty ? nil : (id, by)
        }
    }

    /// The reaction `uid` gave it, if any (whether this build knows it or not).
    public func reaction(of uid: String) -> String? { reactions[uid] }

    /// It with `uid`'s reaction set to `id` (nil takes it back): what the thread draws at once while the
    /// server is asked, and puts back if it refuses.
    public func reacting(_ uid: String, with id: String?) -> ChatMessage {
        var next = self
        next.reactions[uid] = id
        return next
    }

    /// Still on its way, or failed: nothing is known of it by the server (yet).
    public var isPending: Bool { delivery != .delivered }
    /// A reply names a document of the conversation, so only delivered messages can be replied to (an
    /// unsent one has nothing left to answer).
    public var canReply: Bool { delivery == .delivered && !isUnsent }
    /// Reactions go on a message the conversation holds, still standing.
    public var canReact: Bool { delivery == .delivered && !isUnsent }

    /// How long after sending its sender can unsend it (the server's `UNSEND_WINDOW_MS`: 24 h).
    public static let unsendWindow: TimeInterval = 24 * 60 * 60

    /// Whether `viewer` can unsend it at `now` (round 16 §3): their own, delivered, a plain message (a
    /// note copied from a card stays), still standing, and sent within ``unsendWindow``.
    public func canUnsend(viewer: String, now: Date = Date()) -> Bool {
        senderId == viewer && delivery == .delivered && !isNote && !isUnsent && now.timeIntervalSince(sentAt) <= Self.unsendWindow
    }

    /// Whether `viewer` can stop sharing the 私人卡 it carries (停止分享, DELETE …/shared-cards/{cardId}): their
    /// own, delivered, still standing, sharing a card as its recipient's pass to read it — at any time, unlike
    /// unsending.
    public func canStopSharing(viewer: String) -> Bool {
        senderId == viewer && delivery == .delivered && !isUnsent && cardRef != nil && privateShare
    }

    /// Oldest first: the send time, then the id (messages sent in the same instant keep a stable order).
    public static func isOrderedBefore(_ a: ChatMessage, _ b: ChatMessage) -> Bool {
        a.sentAt != b.sentAt ? a.sentAt < b.sentAt : a.id < b.id
    }

    /// A message document's fields as Firestore returns them (maps and strings), with its id and
    /// its send time (read with the estimate for a server time still pending). `origin` is the
    /// API's — a preview's picture is a path of it. Missing or odd fields leave a message without
    /// that part; none of them fails it.
    public static func from(id: String, fields: [String: Any], sentAt: Date, origin: URL) -> ChatMessage {
        // Unsent (round 16 §3): the document keeps its sender, its time and `unsentAt`, nothing else.
        if let unsentAt = fields["unsentAt"], !(unsentAt is NSNull) {
            return ChatMessage(id: id, senderId: fields["senderId"] as? String ?? "", text: "", sentAt: sentAt, isUnsent: true)
        }
        let note = fields["noteRef"] as? [String: Any]
        let noteRef = (note?["cardId"] as? String).flatMap { card in
            (note?["noteId"] as? String).map { MessagingAPI.NoteRef(cardId: card, noteId: $0) }
        }
        let cardRef = (fields["cardRef"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        return ChatMessage(
            id: id,
            senderId: fields["senderId"] as? String ?? "",
            text: fields["text"] as? String ?? "",
            sentAt: sentAt,
            cardRef: cardRef,
            noteRef: noteRef,
            // A note without the card it was left on would be about nothing: drawn as plain words.
            isNote: fields["kind"] as? String == "note" && cardRef != nil,
            replyTo: quote(fields["replyTo"] as? [String: Any]),
            preview: preview(fields["preview"] as? [String: Any], origin: origin),
            image: ChatImage.from(fields["image"] as? [String: Any]),
            sticker: StickerRef.from(fields["sticker"] as? [String: Any]),
            // An album names pictures: without one a message is no member of it.
            album: fields["image"] is [String: Any] ? AlbumRef.from(fields["album"] as? [String: Any]) : nil,
            reactions: reactions(fields["reactions"] as? [String: Any]),
            // Only `true` is a pass: anything else (absent once its sender stopped sharing) is none.
            privateShare: fields["privateShare"] as? Bool == true
        )
    }

    /// The `reactions` map: uid → reaction id, strings only (anything else is left out).
    static func reactions(_ map: [String: Any]?) -> [String: String] {
        guard let map else { return [:] }
        var out: [String: String] = [:]
        for (uid, value) in map {
            if !uid.isEmpty, let id = value as? String, !id.isEmpty { out[uid] = id }
        }
        return out
    }

    private static func quote(_ map: [String: Any]?) -> ReplyQuote? {
        guard let map, let id = map["id"] as? String, !id.isEmpty else { return nil }
        return ReplyQuote(id: id, senderId: map["senderId"] as? String ?? "", text: ReplyQuote.cut(map["text"] as? String ?? ""),
                          cardRef: (map["cardRef"] as? String).flatMap { $0.isEmpty ? nil : $0 },
                          image: map["image"] as? Bool == true, unsent: map["unsent"] as? Bool == true,
                          sticker: StickerRef.from(map["sticker"] as? [String: Any]))
    }

    private static func preview(_ map: [String: Any]?, origin: URL) -> LinkPreview? {
        // The address is what a tap opens: only one the link rules accept (http(s), no userinfo, a real host).
        guard let map, let link = (map["url"] as? String).flatMap(ChatLinks.parse),
              let title = trimmed(map["title"]) else { return nil }
        return LinkPreview(link: link, title: title, description: trimmed(map["description"]), siteName: trimmed(map["siteName"]),
                           imageURL: imageURL(map["image"] as? String, origin: origin))
    }

    private static func trimmed(_ value: Any?) -> String? {
        guard let text = (value as? String)?.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text
    }

    /// The server writes the picture as a path of its own image proxy; anything else (another
    /// host, a plain address, a path elsewhere on the site, a path with spaces or control
    /// characters) is no picture of ours, and nothing is requested for it.
    static func imageURL(_ path: String?, origin: URL) -> URL? {
        guard let path, path.utf16.count <= 4096,
              !path.unicodeScalars.contains(where: { CharacterSet.whitespacesAndNewlines.contains($0) || CharacterSet.controlCharacters.contains($0) })
        else { return nil }
        return ChatLinks.previewImage(path, origin: origin)
    }
}
