import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// The card box asks for my own shelves together (one GET /me/cardbox): opening
/// it brings the private and draft shelves with the published one; other
/// people's cards (resonated, linked, bookmarks) are asked for when shown.
@MainActor @Suite struct CardBoxShelvesTests {
    typealias Shelf = ReadingAPI.CardBoxShelf
    let own: Set<Shelf> = [.published, ._private, .draft]

    private func asked(_ s: Shelf, force: Bool = false, known: Set<Shelf> = [], unconfirmed: Set<Shelf> = []) -> Set<Shelf> {
        CardBoxScreen.asked(with: s, force: force, known: known, unconfirmed: unconfirmed)
    }

    @Test func openingTheBoxAsksForMyOwnShelvesInOneRequest() {
        #expect(asked(.published) == own)
        // A cold start drew the kept published shelf: asked again with the others.
        #expect(asked(.published, unconfirmed: [.published]) == own)
    }

    @Test func aShelfAlreadyHereIsNotAskedForAgain() {
        // The private shelf came with the published one: showing the draft shelf now asks for it alone.
        #expect(asked(.draft, known: [.published, ._private]) == [.draft])
        // Back after a while: what's on screen asks again with the own shelves waiting to.
        #expect(asked(._private, known: own, unconfirmed: [.published, ._private]) == [.published, ._private])
    }

    @Test func otherPeoplesCardsAreAskedForAlone() {
        #expect(asked(.resonated) == [.resonated])
        #expect(asked(.bookmarks, known: own, unconfirmed: own) == [.bookmarks])
    }

    @Test func pullingToRefreshAsksForAllMyShelvesAgain() {
        #expect(asked(.draft, force: true, known: own) == own)
        #expect(asked(.linked, force: true, known: own.union([.linked])) == [.linked])
    }

    /// 刪除 / 永久刪除 (the card left its shelf at once): once the server took it, the shelves keep what they
    /// showed, without it — no skeleton — and the trash it went into is read again; one leaving the trash
    /// for good leaves the trash as it was, less that card.
    @Test func aCardThatLeftItsShelfIsGoneFromEveryShelfItWasOn() {
        let a = ownCard("a", published: "2026-10-01T00:00:00Z", edited: nil, visibility: "public")
        let b = ownCard("b", published: "2026-10-02T00:00:00Z", edited: nil, visibility: "public")
        let t = ownCard("t", published: nil, edited: nil)
        let shelves: [Shelf: [FeedCard]] = [.published: [a, b], .draft: [], .trash: [t]]

        let trashed = CardBoxScreen.without("b", in: shelves)
        #expect(trashed[.published]?.map(\.id) == ["a"])
        #expect(trashed[.draft]?.isEmpty == true)
        #expect(trashed[.trash] == nil)

        let deleted = CardBoxScreen.without("t", in: shelves)
        #expect(deleted[.trash]?.isEmpty == true)
        #expect(deleted[.published]?.map(\.id) == ["a", "b"])
    }

    /// A card on an own shelf, as GET /me/cardbox answers it (`editedAt` on the owner's shelves only).
    private func ownCard(_ id: String, published: String?, edited: String?, visibility: String = "private") -> FeedCard {
        let json = """
        {"id":"\(id)","slug":null,"title":"Card \(id)","excerpt":"…","tags":[],
         "publishedAt":\(published.map { "\"\($0)\"" } ?? "null"),"author":null,"anonymous":false,"visibility":"\(visibility)",
         "imageUrl":null,"imageLabel":null,"accentHue":null,"readMinutes":1,"referenceCardId":null,"reason":null,
         "editedAt":\(edited.map { "\"\($0)\"" } ?? "null")}
        """
        return try! JSONDecoder().decode(FeedCard.self, from: Data(json.utf8))
    }

    /// Round 8 §1.1: 草稿 is the drafts and the published private cards together — no 私人卡 shelf —
    /// the most recently changed first (`editedAt`, else `publishedAt`), each once, at most 40.
    @Test func theDraftShelfHoldsDraftsAndPrivateCardsByTheirLastChange() throws {
        #expect(!CardBoxScreen.order.contains(._private))
        #expect(CardBoxScreen.order == [.published, .draft, .resonated, .linked, .bookmarks, .trash])
        #expect(CardBoxScreen.title(.draft) == L10n.Me.Tabs.draft)
        #expect(CardBoxScreen.empty(.draft) == L10n.Me.emptyDraft)
        let drafts = [ownCard("d1", published: nil, edited: "2026-10-20T08:00:00.000Z"),
                      ownCard("d2", published: nil, edited: "2026-10-02T08:00:00.000Z")]
        let privateCards = [ownCard("p1", published: "2026-09-01T08:00:00.000Z", edited: "2026-10-22T08:00:00.000Z"),
                            // From a server that sends no `editedAt`: by its publish date.
                            ownCard("p2", published: "2026-10-10T08:00:00.000Z", edited: nil)]
        let shelf = try #require(CardBoxScreen.draftShelf(private: privateCards, drafts: drafts))
        #expect(shelf.map(\.id) == ["p1", "d1", "p2", "d2"])
        // Not both lists known yet: no shelf to show (its skeleton), never half of one.
        #expect(CardBoxScreen.draftShelf(private: nil, drafts: drafts) == nil)
        #expect(CardBoxScreen.draftShelf(private: privateCards, drafts: nil) == nil)
        #expect(CardBoxScreen.draftShelf(private: [], drafts: [])?.isEmpty == true)
        // At most 40, the newest.
        let many = (0..<30).map { ownCard("d\($0)", published: nil, edited: "2026-10-01T08:00:\(String(format: "%02d", $0)).000Z") }
        let morePrivate = (0..<30).map { ownCard("p\($0)", published: "2026-09-01T08:00:00.000Z",
                                             edited: "2026-10-02T08:00:\(String(format: "%02d", $0)).000Z") }
        let cut = try #require(CardBoxScreen.draftShelf(private: morePrivate, drafts: many))
        #expect(cut.count == CardBoxScreen.draftShelfMax)
        #expect(cut.first?.id == "p29")
        #expect(cut.prefix(30).allSatisfy { $0.id.hasPrefix("p") })
        // The same card on both lists (a draft published meanwhile) is shown once.
        #expect(CardBoxScreen.draftShelf(private: [drafts[0]], drafts: drafts)?.map(\.id) == ["d1", "d2"])
    }

    /// The 私人卡 shelf asks for both of its lists, and a shelf choice of `private` opens it.
    @Test func theDraftShelfAsksForItsTwoListsAndPrivateOpensIt() {
        #expect(asked(.draft) == own)
        // Its private cards known already: the drafts alone.
        #expect(asked(.draft, known: [.published, ._private]) == [.draft])
        #expect(CardBoxScreen.shelf(forKey: "private") == .draft)
        #expect(CardBoxScreen.shelf(forKey: "draft") == .draft)
        #expect(CardBoxScreen.shelf(forKey: "trash") == .trash)
        #expect(CardBoxScreen.shelf(forKey: "nowhere") == nil)
    }

    /// Round 9 §1: a card only its author sees — never published, or published and kept private — is a
    /// 私人卡 (its page wears the lock and offers 編輯 where share would be); a card readers have isn't.
    /// Every card on the shelves opens its page now, a 私人卡 too.
    @Test func aCardOnlyItsAuthorSeesIsAPrivateCard() {
        #expect(CardScreen.isPrivate(ownCard("d", published: nil, edited: nil)))
        #expect(CardScreen.isPrivate(ownCard("d", published: nil, edited: nil, visibility: "public")))
        #expect(CardScreen.isPrivate(ownCard("p", published: "2026-10-01T08:00:00.000Z", edited: nil)))
        #expect(!CardScreen.isPrivate(ownCard("q", published: "2026-10-01T08:00:00.000Z", edited: nil, visibility: "public")))
        #expect(!CardScreen.isPrivate(ownCard("c", published: "2026-10-01T08:00:00.000Z", edited: nil, visibility: "connections")))
    }

    @Test func aRefreshThatFailedSpeaksOnlyOverTheShelfItWasFor() throws {
        // Pulled on the published shelf, then Bookmarks chosen while the request was on its way; it failed.
        #expect(CardBoxScreen.afterRefresh(of: .published, showing: true, failure: .offline, shown: .bookmarks) == nil)
        // Still on the shelf it was for: the line over it, and VoiceOver hears it.
        let stayed = try #require(CardBoxScreen.afterRefresh(of: .published, showing: true, failure: .offline, shown: .published))
        #expect(stayed == CardBoxScreen.ShelfFailure(shelf: .published, failure: .offline))
        // Kept for the shelf it was for: never said over another one.
        #expect(stayed?.over(.published) == .offline)
        #expect(stayed?.over(.bookmarks) == nil)
        // Answered, or nothing on screen to keep: no line.
        #expect(CardBoxScreen.afterRefresh(of: .draft, showing: true, failure: nil, shown: .draft) == .some(nil))
        #expect(CardBoxScreen.afterRefresh(of: .draft, showing: false, failure: .failed, shown: .draft) == .some(nil))
    }
}
