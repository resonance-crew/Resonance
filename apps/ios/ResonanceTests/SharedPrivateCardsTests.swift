import DesignSystem
import Foundation
import ResonanceKit
import SwiftUI
import Testing
@testable import Resonance

/// A 私人卡 shared in a conversation (api/v1/sharedCards): the thread's picker offers the viewer's
/// 私人卡 after their public cards; the message marks it 私人卡 on both sides; and the card's page,
/// for the person it was sent to, is only to read.
@MainActor @Suite struct SharedPrivateCardsTests {
    /// A card as GET /me/cardbox answers it (`editedAt` on the owner's shelves).
    private func card(_ id: String, title: String? = nil, published: String? = "2026-09-01T08:00:00.000Z",
                      edited: String? = nil, visibility: String = "public", anonymous: Bool = false) -> FeedCard {
        let titleJSON = String(decoding: try! JSONEncoder().encode(title ?? "Card \(id)"), as: UTF8.self)
        let json = """
        {"id":"\(id)","slug":null,"title":\(titleJSON),"excerpt":"…","tags":[],
         "publishedAt":\(published.map { "\"\($0)\"" } ?? "null"),
         "author":{"id":"me","handle":"me","initials":"ME","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,
                   "avatarSeed":"42","verified":false,"region":"TW"},
         "anonymous":\(anonymous),"visibility":"\(visibility)",
         "imageUrl":null,"imageLabel":null,"accentHue":null,"readMinutes":3,"referenceCardId":null,"reason":null,
         "editedAt":\(edited.map { "\"\($0)\"" } ?? "null")}
        """
        return try! JSONDecoder().decode(FeedCard.self, from: Data(json.utf8))
    }

    // MARK: The thread's picker

    @Test func theThreadOffersPublicCardsFirstThenPrivateCards() {
        let published = [card("pub1"), card("pub2", anonymous: true), card("kept-pub", visibility: "private"),
                         card("friends", visibility: "connections")]
        let privateCards = [card("kept-pub", edited: "2026-10-01T08:00:00.000Z", visibility: "private"),
                            card("kept-anon", edited: "2026-10-05T08:00:00.000Z", visibility: "private", anonymous: true)]
        let drafts = [card("draft-new", published: nil, edited: "2026-10-20T08:00:00.000Z", visibility: "private"),
                      card("draft-untitled", title: "  \n", published: nil, edited: "2026-10-21T08:00:00.000Z"),
                      card("draft-old", published: nil, edited: "2026-09-20T08:00:00.000Z"),
                      card("draft-anon", published: nil, edited: "2026-10-22T08:00:00.000Z", anonymous: true)]
        let offered = CardPickerContent.shareable(published: published, privateCards: privateCards, drafts: drafts)
        // The public cards as the editor's picker has them (an anonymous public one too: its link names no one),
        // then the 私人卡 as their shelf orders them — the latest changed first —, leaving out the anonymous ones
        // (they would come with their sender's name), the untitled and the connections-only card.
        #expect(offered.map(\.id) == ["pub1", "pub2", "draft-new", "kept-pub", "draft-old"])
        // A card listed already isn't listed twice.
        let again = CardPickerContent.shareable(published: [card("pub1")], privateCards: [], drafts: [card("pub1")])
        #expect(again.map(\.id) == ["pub1"])
        // No cards at all: nothing to pick (its empty line), never a failure.
        #expect(CardPickerContent.shareable(published: [], privateCards: [], drafts: []).isEmpty)
    }

    @Test func theEditorsPickerStaysPublicOnly() {
        let cards = [card("pub"), card("draft", published: nil), card("kept", visibility: "private")]
        #expect(CardPickerContent.pickable(cards).map(\.id) == ["pub"])
    }

    @Test func aPrivateCardsRowIsLedByItsLabel() {
        let now = ISO8601.date("2026-10-28T08:00:00.000Z")!
        let label = L10n.Messages.privateCard
        let kept = CardPickList<EmptyView, EmptyView>.meta(card("k", visibility: "private"), anonymousLabel: nil,
                                                           privateLabel: label, now: now)
        #expect(kept.hasPrefix("\(label) · "))
        // Never published: the label alone.
        #expect(CardPickList<EmptyView, EmptyView>.meta(card("d", published: nil), anonymousLabel: nil,
                                                        privateLabel: label, now: now) == label)
        // A public card's line is its date, as before; a list that marks nothing marks no 私人卡.
        let pub = CardPickList<EmptyView, EmptyView>.meta(card("p"), anonymousLabel: nil, privateLabel: label, now: now)
        #expect(!pub.contains(label) && !pub.isEmpty)
        #expect(!CardPickList<EmptyView, EmptyView>.meta(card("k", visibility: "private"), anonymousLabel: nil, now: now)
            .contains(label))
    }

    // MARK: The message

    @Test func aSharedPrivateCardSaysSoWhereItsSourceWouldStand() {
        #expect(SharedCardSection.source(card("p")) == L10n.Messages.cardSource)
        #expect(SharedCardSection.source(card("k", visibility: "private")) == L10n.Messages.privateCard)
        #expect(SharedCardSection.source(card("d", published: nil)) == L10n.Messages.privateCard)
        #expect(SharedCardSection.source(card("c", visibility: "connections")) == L10n.Messages.cardSource)
    }

    // MARK: The card's page

    @Test func someoneElsesPrivateCardIsOnlyToRead() {
        let kept = Fixture.card("k", visibility: "private")
        let shared = Fixture.detail(kept)
        #expect(CardScreen.isSharedPrivate(shared))
        // Not its owner's 私人卡 (no pen to the writer), and no share.
        #expect(!CardScreen.isPrivateCard(shared))
        #expect(!CardShareGate.offered(shared))
        #expect(CardScreen.sharedPrivatelyLine(shared) == L10n.Card.sharedPrivately(handle: "bob"))
        // Its owner's own 私人卡 is theirs to edit, not a shared one.
        #expect(!CardScreen.isSharedPrivate(Fixture.detail(kept, isOwner: true)))
        #expect(CardScreen.isPrivateCard(Fixture.detail(kept, isOwner: true)))
        // A card readers have keeps its response bar.
        #expect(!CardScreen.isSharedPrivate(Fixture.detail(Fixture.card("p"))))
        #expect(!CardScreen.isSharedPrivate(Fixture.detail(Fixture.card("c", visibility: "connections"))))
        // Never published: a 私人卡 too.
        let draft = Fixture.detail(card("d", published: nil, visibility: "public"))
        #expect(CardScreen.isSharedPrivate(draft))
    }
}
