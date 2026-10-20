import FirebaseFirestore
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// A card as the trash shelf (or the owner's card page) has it: in the trash since `trashedAt`,
/// deleted for good at `purgeAt`, restoring to `restoresTo`.
@MainActor private func trashed(_ id: String, published: Bool = true, anonymous: Bool = false, restoresTo: String? = "public",
                     trashedAt: String = "2026-10-01T00:00:00.000Z", purgeAt: String? = "2026-10-31T00:00:00.000Z") -> FeedCard {
    let author = anonymous ? "null" : #"{"id":"alice","handle":"alice","initials":"AL","accentColor":"oklch(90% 0.05 60)","avatarUrl":null,"avatarSeed":"42","verified":false,"region":"TW"}"#
    let json = """
    {"id":"\(id)","slug":null,"title":"Card \(id)","excerpt":"…","tags":[],
     "publishedAt":\(published ? "\"2026-09-01T08:00:00.000Z\"" : "null"),"author":\(author),"anonymous":\(anonymous),
     "visibility":"private","imageUrl":null,"imageLabel":null,"accentHue":140,"readMinutes":2,"referenceCardId":null,
     "reason":null,"trashedAt":"\(trashedAt)","purgeAt":\(purgeAt.map { "\"\($0)\"" } ?? "null"),
     "restoresTo":\(restoresTo.map { "\"\($0)\"" } ?? "null")}
    """
    return try! JSONDecoder().decode(FeedCard.self, from: Data(json.utf8))
}

/// 刪除 on the owner's ⋯ (trash.spec §0): no question for a draft, a private card, a card that
/// answers nothing, a hidden resonance or one answering an anonymous card — the toast's 復原 is the
/// way back; the plain question for a published, public, named resonance whose original is named (or
/// can't be read); the original looked up first when its byline isn't known.
@MainActor @Suite struct TrashDecisionTests {
    @Test func mostCardsGoToTheTrashAtOnce() {
        func decide(published: Bool = true, visibility: String = "public", anonymous: Bool = false, answering: String? = nil,
                    answeringAnonymous: Bool? = false) -> TrashDecision {
            TrashDecision.of(published: published, visibility: visibility, anonymous: anonymous, answering: answering,
                             answeringAnonymous: answeringAnonymous)
        }
        // A published public card that answers nothing.
        #expect(decide() == .now)
        // A draft, even one answering a named card: it reached no one.
        #expect(decide(published: false, answering: "original") == .now)
        // Hidden resonances: private, for connections only, anonymous.
        #expect(decide(visibility: "private", answering: "original") == .now)
        #expect(decide(visibility: "connections", answering: "original") == .now)
        #expect(decide(anonymous: true, answering: "original") == .now)
        // A public named resonance to an anonymous original never connected anyone.
        #expect(decide(answering: "original", answeringAnonymous: true) == .now)
    }

    @Test func aResonanceThatMayHoldAConnectionAsksFirst() {
        #expect(TrashDecision.of(published: true, visibility: "public", anonymous: false, answering: "original",
                                 answeringAnonymous: false) == .ask)
        // The original's byline unknown: looked up first.
        #expect(TrashDecision.of(published: true, visibility: "public", anonymous: false, answering: "original",
                                 answeringAnonymous: nil) == .lookUp)
        // Looked up: anonymous goes at once; named — or not readable (a connection can outlive the original going private) — asks.
        #expect(TrashDecision.afterLookUp(originalAnonymous: true) == .now)
        #expect(TrashDecision.afterLookUp(originalAnonymous: false) == .ask)
        #expect(TrashDecision.afterLookUp(originalAnonymous: nil) == .ask)
    }
}

/// The card box's 垃圾桶 (trash.spec §4, §6): always the strip's last shelf, asked for alone when
/// chosen; each card says where it came from (a restore never re-publishes in silence) and when it
/// goes; while an anonymous card is there, the shelf says its notes went with it.
@MainActor @Suite struct TrashShelfTests {
    @Test func theTrashIsAlwaysTheLastShelf() {
        #expect(CardBoxScreen.order.last == .trash)
        #expect(Set(CardBoxScreen.order) == Set(ReadingAPI.CardBoxShelf.allCases))
        #expect(CardBoxScreen.title(.trash) == L10n.Me.Tabs.trash)
        #expect(CardBoxScreen.empty(.trash) == L10n.Me.emptyTrash)
        // Not one of my own shelves read together: it is asked for alone, when shown.
        #expect(!CardBoxScreen.owned.contains(.trash))
        #expect(CardBoxScreen.asked(with: .trash, force: false, known: [], unconfirmed: []) == [.trash])
    }

    @Test func eachCardSaysWhereItCameFromAndWhenItGoes() {
        let now = ISO8601.date("2026-10-08T00:00:00.000Z")!
        #expect(TrashCaption.text(trashed("a", restoresTo: "public"), now: now)
                == "\(L10n.Me.TrashFrom.public) · \(L10n.Me.trashDaysLeft(count: 23))")
        #expect(TrashCaption.from(trashed("b", restoresTo: "connections")) == L10n.Me.TrashFrom.connections)
        #expect(TrashCaption.from(trashed("c", restoresTo: "private")) == L10n.Me.TrashFrom.private)
        // A draft is a draft, whatever it would restore to.
        #expect(TrashCaption.from(trashed("d", published: false, restoresTo: "public")) == L10n.Me.TrashFrom.draft)
        // Under a day left: 「一天內永久刪除」; a part of a day counts as a whole one before that.
        let lastDay = ISO8601.date("2026-10-30T12:00:00.000Z")!
        #expect(TrashCaption.days(purgeAt: trashed("e").purgeDate, now: lastDay) == L10n.Me.trashLastDay)
        let partly = ISO8601.date("2026-10-29T12:00:00.000Z")!
        #expect(TrashCaption.days(purgeAt: trashed("e").purgeDate, now: partly) == L10n.Me.trashDaysLeft(count: 2))
        // No purge date from the server: 30 days after it went in.
        #expect(trashed("f", purgeAt: nil).purgeDate == ISO8601.date("2026-10-31T00:00:00.000Z"))
    }

    @Test func theShelfSaysAnAnonymousCardsNotesWentWithIt() {
        #expect(!TrashCaption.holdsAnonymous([trashed("a"), trashed("b", published: false, anonymous: true)]))
        #expect(TrashCaption.holdsAnonymous([trashed("a"), trashed("c", anonymous: true)]))
    }
}

/// The owner's card page while the card is in the trash (trash.spec §5.4, §6): the banner first —
/// for its owner only — with how long it has and that only they can see it (an anonymous card's notes
/// gone), and no share, ⋯ or lists around it.
@MainActor @Suite struct TrashedCardPageTests {
    @Test func onlyTheOwnersCardInTheTrashHasTheBanner() {
        let card = trashed("a")
        #expect(TrashedCardBanner.shows(Fixture.detail(card, isOwner: true)))
        #expect(!TrashedCardBanner.shows(Fixture.detail(card, isOwner: false)))
        #expect(!TrashedCardBanner.shows(Fixture.detail(Fixture.card("b"), isOwner: true)))
    }

    @Test func theBannerSaysWhenItGoesAndThatOnlyTheOwnerSeesIt() {
        let now = ISO8601.date("2026-10-08T00:00:00.000Z")!
        #expect(TrashedCardBanner.caption(trashed("a"), now: now)
                == "\(L10n.Me.trashDaysLeft(count: 23)) · \(L10n.Card.Trashed.onlyYou)")
    }
}

/// The thought map leaves a card in the trash out (its node and arrows stay stored, so a restore
/// puts it back in place).
@MainActor @Suite struct ThoughtMapTrashTests {
    @Test func aCardInTheTrashIsNotOnTheMap() {
        let data: [String: Any] = ["authorId": "alice", "thoughtCore": "A walk", "story": "Rain.", "visibility": "public",
                                   "publishedAt": Timestamp(date: Date(timeIntervalSince1970: 1_790_000_000))]
        #expect(ThoughtMapService.card(id: "c", data: data)?.title == "A walk")
        var inTrash = data
        inTrash["trashedAt"] = Timestamp(date: Date(timeIntervalSince1970: 1_800_000_000))
        inTrash["visibility"] = "private"
        #expect(ThoughtMapService.card(id: "c", data: inTrash) == nil)
    }
}
