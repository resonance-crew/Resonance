import Foundation
import Testing
@testable import ResonanceKit

/// A message document read as the thread draws it: the quote, the preview and its picture, old
/// messages without either (the same cases as Android's ChatMessageTest).
@Suite struct ChatMessageTests {
    let origin = URL(string: "http://127.0.0.1:3300")!
    let at = Date(timeIntervalSince1970: 1)
    func read(_ fields: [String: Any]) -> ChatMessage { ChatMessage.from(id: "m1", fields: fields, sentAt: at, origin: origin) }
    func preview(_ fields: [String: Any]) -> LinkPreview? { read(["preview": fields]).preview }

    @Test func anOldMessageHasNeitherAQuoteNorAPreview() {
        let m = read(["senderId": "alice", "text": "hi"])
        #expect(m == ChatMessage(id: "m1", senderId: "alice", text: "hi", sentAt: at))
        #expect(m.replyTo == nil && m.preview == nil)
        #expect(m.key == "m1")
        #expect(m.canReply && !m.isPending)
    }

    @Test func aSharedCardAndANoteComeThrough() {
        let m = read(["senderId": "bob", "text": "", "cardRef": "walk", "noteRef": ["cardId": "walk", "noteId": "n1"]])
        #expect(m.cardRef == "walk")
        #expect(m.noteRef == MessagingAPI.NoteRef(cardId: "walk", noteId: "n1"))
        // An empty card reference is none, and half a note is no note.
        #expect(read(["cardRef": ""]).cardRef == nil)
        #expect(read(["noteRef": ["cardId": "walk"]]).noteRef == nil)
    }

    @Test func aNoteLeftOnACardIsMarkedAndAnyOtherKindIsAPlainMessage() {
        let note = read(["senderId": "bob", "text": "我也是", "cardRef": "walk", "kind": "note"])
        #expect(note.isNote)
        #expect(note.cardRef == "walk" && note.noteRef == nil)
        #expect(!read(["senderId": "bob", "text": "hi"]).isNote)
        // A kind the server may add one day, or a note that lost its card, is drawn as words.
        #expect(!read(["text": "hi", "cardRef": "walk", "kind": "poll"]).isNote)
        #expect(!read(["text": "hi", "kind": "note"]).isNote)
        #expect(!read(["text": "hi", "cardRef": "", "kind": "note"]).isNote)
        #expect(!read(["text": "hi", "cardRef": "walk", "kind": 7]).isNote)
    }

    @Test func aReplyKeepsTheQuoteTheServerSnapshotted() {
        let m = read(["senderId": "bob", "text": "agreed",
                      "replyTo": ["id": "m0", "senderId": "alice", "text": "shall we?", "cardRef": "walk"]])
        #expect(m.replyTo == ReplyQuote(id: "m0", senderId: "alice", text: "shall we?", cardRef: "walk"))
        // A quote of a card alone has no text.
        #expect(read(["replyTo": ["id": "m0", "senderId": "alice", "text": ""]]).replyTo == ReplyQuote(id: "m0", senderId: "alice", text: ""))
        // Without an id there is nothing to quote.
        #expect(read(["replyTo": ["senderId": "alice", "text": "x"]]).replyTo == nil)
    }

    /// Round 16 §4: each person's reaction by uid; anything not a string is left out, and an id this
    /// build doesn't know is kept but never drawn (the stickers' order decides what is).
    @Test func reactionsAreReadByPersonAndUnknownOnesAreNotDrawn() {
        let m = read(["senderId": "bob", "text": "hi", "reactions": ["alice": "moved", "bob": "moved", "carol": 7, "dora": "wave"]])
        #expect(m.reactions == ["alice": "moved", "bob": "moved", "dora": "wave"])
        let order = ["heart", "moved", "laugh", "hug", "thumbs"]
        let drawn = m.knownReactions(order)
        #expect(drawn.map(\.id) == ["moved"])
        #expect(drawn.first?.by == ["alice", "bob"])
        #expect(m.reaction(of: "alice") == "moved")
        // Changed at once while the server is asked, and put back when it refuses.
        let mine = m.reacting("alice", with: "heart")
        #expect(mine.knownReactions(order).map(\.id) == ["heart", "moved"])
        #expect(mine.reacting("alice", with: nil).reaction(of: "alice") == nil)
        #expect(read(["text": "hi"]).reactions.isEmpty)
    }

    /// Round 16 §3: an unsent message keeps its sender and its time and says nothing, even if an older
    /// snapshot of it still held words; it can't be replied to, reacted to or unsent again.
    @Test func anUnsentMessageSaysNothing() {
        let m = read(["senderId": "bob", "text": "oops", "cardRef": "walk", "unsentAt": Date(), "reactions": ["alice": "heart"]])
        #expect(m.isUnsent)
        #expect(m.senderId == "bob" && m.sentAt == at)
        #expect(m.text.isEmpty && m.cardRef == nil && m.image == nil && m.reactions.isEmpty)
        #expect(!m.canReply && !m.canReact && !m.canUnsend(viewer: "bob", now: at))
        #expect(!read(["senderId": "bob", "text": "hi", "unsentAt": NSNull()]).isUnsent)
    }

    /// A quote of a message since unsent is `{ id, senderId, unsent: true }`: it says so, and nothing else.
    @Test func aQuoteOfAnUnsentMessageSaysItWasUnsent() throws {
        let quote = try #require(read(["text": "ok", "replyTo": ["id": "m0", "senderId": "alice", "unsent": true]]).replyTo)
        #expect(quote.unsent)
        #expect(quote.summary(picture: "一張圖片", card: "一張卡片", unsentQuote: "已收回的訊息") == "已收回的訊息")
        #expect(ReplyQuote(id: "m0", senderId: "a", text: "x", unsent: true).text.isEmpty)
    }

    /// A 私人卡 shared in a message: `privateShare: true` is the recipient's pass, read only beside a card; it
    /// goes when its sender stops sharing (the document loses the field), and the two then differ.
    @Test func aPrivateSharesPassComesThroughAndItsGoingIsAChange() {
        let shared = read(["senderId": "alice", "text": "", "cardRef": "kept", "privateShare": true])
        #expect(shared.privateShare)
        let stopped = read(["senderId": "alice", "text": "", "cardRef": "kept"])
        #expect(!stopped.privateShare)
        #expect(shared != stopped)
        // Only `true` beside a card is a pass; an unsent message carries none.
        #expect(!read(["senderId": "alice", "cardRef": "kept", "privateShare": "true"]).privateShare)
        #expect(!read(["senderId": "alice", "cardRef": "kept", "privateShare": false]).privateShare)
        #expect(!read(["senderId": "alice", "text": "hi", "privateShare": true]).privateShare)
        #expect(!read(["senderId": "alice", "cardRef": "kept", "privateShare": true, "unsentAt": at]).privateShare)
    }

    /// 停止分享 is the sender's, for a delivered message still sharing a 私人卡 — at any age, unlike unsending.
    @Test func onlyTheSenderStopsSharingAPrivateCardAtAnyTime() {
        let sent = Date(timeIntervalSince1970: 1_000_000)
        let shared = ChatMessage(id: "m1", senderId: "alice", text: "", sentAt: sent, cardRef: "kept", privateShare: true)
        #expect(shared.canStopSharing(viewer: "alice"))
        #expect(!shared.canStopSharing(viewer: "bob"))
        // Long past unsend's day: still the sender's to stop.
        #expect(!shared.canUnsend(viewer: "alice", now: sent.addingTimeInterval(48 * 3600)))
        #expect(shared.canStopSharing(viewer: "alice"))
        // A card that is no pass (public, or stopped already), one not delivered, or an unsent one: nothing to stop.
        #expect(!ChatMessage(id: "m2", senderId: "alice", text: "", sentAt: sent, cardRef: "pub").canStopSharing(viewer: "alice"))
        #expect(!ChatMessage(id: "m3", senderId: "alice", text: "", sentAt: sent, cardRef: "kept", privateShare: true,
                             delivery: .sending).canStopSharing(viewer: "alice"))
        #expect(!ChatMessage(id: "m4", senderId: "alice", text: "", sentAt: sent, cardRef: "kept", isUnsent: true,
                             privateShare: true).canStopSharing(viewer: "alice"))
    }

    /// Unsending is for the sender's own delivered plain message within 24 hours.
    @Test func onlyTheSendersOwnPlainMessageOfTheLastDayCanBeUnsent() {
        let sent = Date(timeIntervalSince1970: 1_000_000)
        let mine = ChatMessage(id: "m1", senderId: "alice", text: "hi", sentAt: sent)
        #expect(mine.canUnsend(viewer: "alice", now: sent.addingTimeInterval(23 * 3600)))
        #expect(!mine.canUnsend(viewer: "alice", now: sent.addingTimeInterval(24 * 3600 + 1)))
        #expect(!mine.canUnsend(viewer: "bob", now: sent))
        let note = ChatMessage(id: "n1", senderId: "alice", text: "hi", sentAt: sent, cardRef: "walk", isNote: true)
        #expect(!note.canUnsend(viewer: "alice", now: sent))
        let failed = ChatMessage(id: "c1", senderId: "alice", text: "hi", sentAt: sent, delivery: .failed)
        #expect(!failed.canUnsend(viewer: "alice", now: sent))
    }

    /// A picture sent in a message: its id and size as kept (round 7 §4.1) — what the bubble takes its
    /// shape from before the picture arrives; a field without an id is no picture.
    @Test func aPictureComesWithItsSize() throws {
        let m = read(["senderId": "bob", "text": "", "image": ["id": "p1", "width": NSNumber(value: 1536), "height": NSNumber(value: 2048)]])
        #expect(m.image == ChatImage(id: "p1", width: 1536, height: 2048))
        #expect(m.cardRef == nil)
        #expect(read(["text": "hi"]).image == nil)
        #expect(read(["image": ["width": 10, "height": 10]]).image == nil)
        #expect(read(["image": ["id": ""]]).image == nil)
        // A size missing or odd reads as 0: the bubble then takes a square.
        #expect(read(["image": ["id": "p2"]]).image == ChatImage(id: "p2", width: 0, height: 0))
        #expect(read(["image": ["id": "p3", "width": -4, "height": "x"]]).image == ChatImage(id: "p3", width: 0, height: 0))
    }

    /// A reply to a picture says so: the server's `replyTo.image`, and the quote a reply made here carries.
    @Test func aQuoteOfAPictureSaysItWasOne() throws {
        let m = read(["senderId": "bob", "text": "好看", "replyTo": ["id": "m0", "senderId": "alice", "text": "", "image": true]])
        #expect(m.replyTo == ReplyQuote(id: "m0", senderId: "alice", text: "", image: true))
        #expect(m.replyTo?.summary(picture: "一張圖片", card: "一張卡片") == "一張圖片")
        // Words come first; a quote of a card alone says it was a card.
        #expect(ReplyQuote(id: "m0", senderId: "a", text: "看這張", image: true).summary(picture: "一張圖片", card: "一張卡片") == "看這張")
        #expect(ReplyQuote(id: "m0", senderId: "a", text: "", cardRef: "walk").summary(picture: "一張圖片", card: "一張卡片") == "一張卡片")
        let picture = ChatMessage(id: "m0", senderId: "alice", text: "", sentAt: at, image: ChatImage(id: "p1", width: 4, height: 3))
        #expect(ReplyQuote.of(picture).image)
        #expect(!ReplyQuote.of(read(["senderId": "alice", "text": "hi"])).image)
    }

    @Test func aQuoteIsCutAtOneHundredFortyCodePoints() throws {
        let long = String(repeating: "🙂", count: 200)
        let quote = try #require(read(["replyTo": ["id": "m0", "senderId": "alice", "text": long]]).replyTo)
        #expect(quote.text.unicodeScalars.count == 140)
        #expect(quote.text == String(repeating: "🙂", count: 140))
        #expect(ReplyQuote.cut("short") == "short")
    }

    @Test func aPreviewComesWithItsPictureResolvedAgainstTheApiOrigin() throws {
        let p = try #require(preview([
            "url": "https://example.com/a", "title": " Example page ", "description": "About it", "siteName": "Example",
            "image": "/api/link-image?u=https%3A%2F%2Fexample.com%2Fi.png&s=abc",
        ]))
        #expect(p.url.absoluteString == "https://example.com/a")
        #expect(p.link.host == "example.com" && !p.link.suspicious)
        #expect(p.title == "Example page")
        #expect(p.description == "About it")
        #expect(p.siteName == "Example")
        #expect(p.imageURL?.absoluteString == "http://127.0.0.1:3300/api/link-image?u=https%3A%2F%2Fexample.com%2Fi.png&s=abc")
    }

    @Test func aPreviewNeedsATitleAndALinkWeWouldOpen() throws {
        #expect(preview(["url": "https://example.com/", "title": "  "]) == nil)
        #expect(preview(["url": "https://example.com/"]) == nil)
        #expect(preview(["url": "javascript:alert(1)", "title": "x"]) == nil)
        #expect(preview(["url": "https://user@example.com/", "title": "x"]) == nil)
        #expect(preview(["title": "x"]) == nil)
        let bare = try #require(preview(["url": "https://example.com", "title": "x"]))
        #expect(bare.url.absoluteString == "https://example.com/")
        #expect(bare.description == nil && bare.imageURL == nil)
        // A lookalike host opens only after asking.
        #expect(preview(["url": "https://xn--pple-43d.com/", "title": "x"])?.link.suspicious == true)
    }

    @Test func onlyOurImageProxyMakesAPicture() {
        func image(_ path: Any?) -> URL? { preview(["url": "https://example.com/", "title": "x", "image": path as Any])?.imageURL }
        #expect(image("https://tracker.example.net/pixel.gif") == nil)
        #expect(image("//tracker.example.net/pixel.gif") == nil)
        #expect(image("/other/path.png") == nil)
        #expect(image("/api/link-image") == nil)
        #expect(image("/api/link-image?u=a b") == nil)
        #expect(image("/api/link-image?u=a\nb") == nil)
        #expect(image(42) == nil)
        #expect(image(nil) == nil)
        #expect(image("/api/link-image?u=x&s=y")?.absoluteString == "http://127.0.0.1:3300/api/link-image?u=x&s=y")
        #expect(ChatMessage.imageURL("/api/link-image?u=x", origin: URL(string: "https://resonance.channel/")!)?.absoluteString
            == "https://resonance.channel/api/link-image?u=x")
    }

    @Test func aMessageOnItsWayCantBeRepliedTo() {
        for delivery in [Delivery.sending, .sent, .failed] {
            let m = ChatMessage(id: "c1", senderId: "alice", text: "hi", sentAt: at, delivery: delivery)
            #expect(m.isPending == (delivery != .delivered))
            #expect(!m.canReply)
        }
    }

    @Test func aReplyToAMessageQuotesItsFirstWordsAndItsCard() {
        let original = ChatMessage(id: "m0", senderId: "alice", text: String(repeating: "x", count: 300), sentAt: at, cardRef: "walk")
        #expect(ReplyQuote.of(original) == ReplyQuote(id: "m0", senderId: "alice", text: String(repeating: "x", count: 140), cardRef: "walk"))
    }

    @Test func messagesSentInTheSameInstantKeepAnOrderById() {
        let a = ChatMessage(id: "a", senderId: "x", text: "", sentAt: at)
        let b = ChatMessage(id: "b", senderId: "x", text: "", sentAt: at)
        let later = ChatMessage(id: "0", senderId: "x", text: "", sentAt: at.addingTimeInterval(1))
        #expect(ChatMessage.isOrderedBefore(a, b) && !ChatMessage.isOrderedBefore(b, a))
        #expect(ChatMessage.isOrderedBefore(b, later))
    }
}
