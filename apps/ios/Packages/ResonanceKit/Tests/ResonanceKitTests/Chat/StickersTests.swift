import Foundation
import Testing
@testable import ResonanceKit

/// Round 22: the sticker catalog as the web writes it, the references a message carries, the albums of
/// pictures sent together (how they group in the thread and share their grid), and a sticker's quote.
@Suite struct StickersTests {
    /// The catalog the app bundles, read from the repository (public/stickers/catalog.json).
    static var repoCatalog: StickerCatalog? {
        let here = URL(fileURLWithPath: #filePath)
        // …/apps/ios/Packages/ResonanceKit/Tests/ResonanceKitTests/Chat/StickersTests.swift → the repository root.
        var root = here
        for _ in 0..<8 { root.deleteLastPathComponent() }
        let file = root.appending(path: "public/stickers/catalog.json")
        return (try? Data(contentsOf: file)).flatMap(StickerCatalog.decode)
    }

    @Test func theBundledCatalogHasFivePacksEachLedByItsCharacter() throws {
        let catalog = try #require(Self.repoCatalog)
        #expect(catalog.packs.map(\.id) == ["tuck", "twine", "nod", "pip", "hush"])
        #expect(catalog.all.count == 29)
        // Every id is one the contract takes, and each pack's icon lives in the pack's folder.
        #expect(catalog.all.allSatisfy { $0.isWellFormed })
        #expect(catalog.packs.allSatisfy { $0.icon == "\($0.id)/icon.webp" })
        let thanks = StickerRef(pack: "twine", id: "thanks")
        #expect(catalog.name(thanks, .zhTW) == "謝謝")
        #expect(catalog.name(thanks, .en) == "Thanks")
        #expect(catalog.packs[0].name(.zhTW) == "摺摺")
        #expect(catalog.name(StickerRef(pack: "later", id: "wave"), .en) == nil)
    }

    @Test func aStickerFieldIsReadOnlyWhenItsIdsAreOnesTheContractTakes() {
        #expect(StickerRef.from(["pack": "pip", "id": "hi"]) == StickerRef(pack: "pip", id: "hi"))
        #expect(StickerRef.from(["pack": "Pip", "id": "hi"]) == nil)
        #expect(StickerRef.from(["pack": "pip", "id": "../x"]) == nil)
        #expect(StickerRef.from(["pack": "pip"]) == nil)
        #expect(StickerRef.from(nil) == nil)
        #expect(StickerRef(pack: "pip", id: "hi").path() == "stickers/pip/hi.webp")
        #expect(StickerRef(pack: "pip", id: "hi").path(thumb: true) == "stickers/pip/hi.thumb.webp")
    }

    @Test func anAlbumFieldIsReadWithinTheContractsBounds() {
        #expect(AlbumRef.from(["id": "a1", "index": 0, "count": 3]) == AlbumRef(id: "a1", index: 0, count: 3))
        #expect(AlbumRef.from(["id": "a1", "index": 3, "count": 3]) == nil)
        #expect(AlbumRef.from(["id": "a1", "index": 0, "count": 1]) == nil)
        #expect(AlbumRef.from(["id": "a1", "index": 0, "count": 11]) == nil)
        #expect(AlbumRef.from(["id": "", "index": 0, "count": 2]) == nil)
    }

    @Test func aStickerMessageIsReadWithItsFallbackWordsAndAnAlbumOnlyBesideAPicture() {
        let origin = URL(string: "https://resonance.channel")!
        let sticker = ChatMessage.from(id: "m1", fields: ["senderId": "bob", "text": "〔貼圖：謝謝〕",
                                                          "sticker": ["pack": "twine", "id": "thanks"]], sentAt: Date(), origin: origin)
        #expect(sticker.sticker == StickerRef(pack: "twine", id: "thanks"))
        #expect(sticker.text == "〔貼圖：謝謝〕")
        let picture = ChatMessage.from(id: "m2", fields: ["senderId": "bob", "text": "",
                                                          "image": ["id": "i1", "width": 10, "height": 10],
                                                          "album": ["id": "al", "index": 1, "count": 2]], sentAt: Date(), origin: origin)
        #expect(picture.album == AlbumRef(id: "al", index: 1, count: 2))
        let noPicture = ChatMessage.from(id: "m3", fields: ["senderId": "bob", "text": "hi", "album": ["id": "al", "index": 0, "count": 2]],
                                         sentAt: Date(), origin: origin)
        #expect(noPicture.album == nil)
        // Unsent: nothing of what it was stays.
        let unsent = ChatMessage(id: "m4", senderId: "bob", text: "x", sentAt: Date(), sticker: StickerRef(pack: "pip", id: "hi"), isUnsent: true)
        #expect(unsent.sticker == nil)
    }

    @Test func aReplyToAStickerQuotesItByNameElseItsFallbackWords() {
        let message = ChatMessage(id: "m1", senderId: "bob", text: "〔貼圖：謝謝〕", sentAt: Date(), sticker: StickerRef(pack: "twine", id: "thanks"))
        let quote = ReplyQuote.of(message)
        #expect(quote.sticker == StickerRef(pack: "twine", id: "thanks"))
        #expect(quote.summary(picture: "圖", card: "卡", stickerName: { _ in "謝謝" }) == "謝謝")
        #expect(quote.summary(picture: "圖", card: "卡", stickerName: { _ in nil }) == "〔貼圖：謝謝〕")
        let read = ChatMessage.from(id: "r", fields: ["senderId": "a", "text": "ok",
                                                      "replyTo": ["id": "m1", "senderId": "bob", "text": "〔貼圖：謝謝〕",
                                                                  "sticker": ["pack": "twine", "id": "thanks"]]],
                                    sentAt: Date(), origin: URL(string: "https://x.test")!)
        #expect(read.replyTo?.sticker == StickerRef(pack: "twine", id: "thanks"))
        // A quote keeps through a draft (Codable).
        let data = try? JSONEncoder().encode(quote)
        #expect(data.flatMap { try? JSONDecoder().decode(ReplyQuote.self, from: $0) } == quote)
    }

    @Test func recentsKeepTheNewestEightEachOnce() {
        var recents: [StickerRef] = []
        for i in 0..<10 { recents = StickerRecents.adding(StickerRef(pack: "pip", id: "s\(i)"), to: recents) }
        #expect(recents.count == 8)
        #expect(recents.first?.id == "s9")
        recents = StickerRecents.adding(StickerRef(pack: "pip", id: "s5"), to: recents)
        #expect(recents.first?.id == "s5")
        #expect(recents.filter { $0.id == "s5" }.count == 1)
    }

    @Test func anAlbumSharesItsGridInRowsOfThreeNeverAPictureAloneAtTheFoot() {
        #expect(AlbumGrid.rows(count: 2) == [2])
        #expect(AlbumGrid.rows(count: 3) == [1, 2])
        #expect(AlbumGrid.rows(count: 4) == [2, 2])
        #expect(AlbumGrid.rows(count: 5) == [3, 2])
        #expect(AlbumGrid.rows(count: 6) == [3, 3])
        #expect(AlbumGrid.rows(count: 7) == [3, 2, 2])
        #expect(AlbumGrid.rows(count: 8) == [3, 3, 2])
        #expect(AlbumGrid.rows(count: 9) == [3, 3, 3])
        #expect(AlbumGrid.rows(count: 10) == [3, 3, 2, 2])
        for count in 2...10 { #expect(AlbumGrid.rows(count: count).reduce(0, +) == count) }
        #expect(AlbumGrid.height(count: 2, width: 202, gap: 2) == 100)
        #expect(AlbumGrid.height(count: 3, width: 300, gap: 2) == 200 + 2 + 149)
    }

    @Test func oneSendersConsecutivePicturesOfAnAlbumAreOneRow() {
        let t = Date(timeIntervalSince1970: 1_800_000_000)
        func pic(_ id: String, _ sender: String, album: String?, _ index: Int, count: Int = 3, at s: Double,
                 delivery: Delivery = .delivered, unsent: Bool = false) -> ChatMessage {
            ChatMessage(id: id, senderId: sender, text: index == 0 ? "caption" : "", sentAt: t.addingTimeInterval(s),
                        image: ChatImage(id: id, width: 4, height: 3), album: album.map { AlbumRef(id: $0, index: index, count: count) },
                        isUnsent: unsent, delivery: delivery)
        }
        let rows = ThreadRows.build([
            ChatMessage(id: "t", senderId: "bob", text: "look", sentAt: t),
            pic("p0", "bob", album: "A", 0, at: 1), pic("p1", "bob", album: "A", 1, at: 2), pic("p2", "bob", album: "A", 2, at: 3),
            pic("q0", "bob", album: "B", 0, count: 2, at: 4), pic("q1", "bob", album: "B", 1, count: 2, at: 5, delivery: .failed),
            pic("x", "alice", album: nil, 0, at: 6),
        ])
        #expect(rows.map(\.id) == ["t", "p0", "q0", "q1", "x"])
        #expect(rows[1].album?.map(\.id) == ["p0", "p1", "p2"])
        #expect(rows[1].holds("p2") && !rows[1].holds("q0"))
        // The second album's failed picture stands alone (with its retry); its first is a picture of one.
        #expect(rows[2].album == nil && rows[3].album == nil)
        // The album sits in its run as one message: bob's text, the grid, then the lone pictures.
        #expect(rows.map(\.position) == [.first, .middle, .middle, .last, .single])
        // Another sender's picture under the same album id is never part of it; an unsent one leaves it smaller.
        let other = ThreadRows.build([pic("p0", "bob", album: "A", 0, at: 1), pic("p1", "alice", album: "A", 1, at: 2),
                                      pic("p2", "bob", album: "A", 2, at: 3)])
        #expect(other.allSatisfy { $0.album == nil })
        let smaller = ThreadRows.build([pic("p0", "bob", album: "A", 0, at: 1), pic("p1", "bob", album: "A", 1, at: 2, unsent: true),
                                        pic("p2", "bob", album: "A", 2, at: 3)])
        #expect(smaller.map(\.album?.count) == [nil, nil, nil])
        // Arriving out of order, the grid keeps the album's order.
        let shuffled = ThreadRows.build([pic("p1", "bob", album: "A", 1, at: 1), pic("p0", "bob", album: "A", 0, at: 2)])
        #expect(shuffled.first?.album?.map(\.id) == ["p0", "p1"])
    }

    @Test func anOutgoingStickerOrAlbumPictureIsDrawnAsItWillBeKept() {
        let sticker = Outbox.Outgoing(clientId: "c1", senderId: "me", text: "", sticker: StickerRef(pack: "pip", id: "hi"))
        #expect(sticker.message.sticker == StickerRef(pack: "pip", id: "hi"))
        let picture = Outbox.Picture(data: Data([1]), contentType: "image/jpeg", width: 4, height: 3)
        let member = Outbox.Outgoing(clientId: "c2", senderId: "me", text: "", picture: picture, album: AlbumRef(id: "al", index: 1, count: 2))
        #expect(member.message.album == AlbumRef(id: "al", index: 1, count: 2))
        // An album names pictures: without one there is none.
        #expect(Outbox.Outgoing(clientId: "c3", senderId: "me", text: "x", album: AlbumRef(id: "al", index: 0, count: 2)).album == nil)
    }
}
