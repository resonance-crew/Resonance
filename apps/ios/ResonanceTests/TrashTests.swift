import DesignSystem
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

/// The trash's moves when the card is already gone (emptied on another device, purged after its 30
/// days): deleting it for good is what was asked for, and a restore that couldn't happen still has
/// what showed the card read again — never the same failure at every try with the card still listed.
private let goneCard = APIFailure(code: "not_found", message: "Card not found.", status: 404)

@MainActor @Suite struct TrashMovesTests {
    private func host(restore: @escaping (String) async throws -> RestoredCard = { _ in throw goneCard },
                      delete: @escaping (String) async throws -> Void = { _ in }, toasts: ToastCenter) -> TrashMoves.Host {
        TrashMoves.Host(restoreCard: restore, deleteCard: delete, toasts: toasts)
    }

    private func toasts() -> ToastCenter {
        ToastCenter(sleep: { _ in try await Task.sleep(for: .seconds(60)) }, assistive: { false }, announce: { _ in })
    }

    @Test func deletingACardAlreadyGoneIsDeletedAndTheListsReadAgain() async throws {
        let writer = WriteLauncher()
        let toasts = toasts()
        let result = try await TrashMoves.deleteForever("c1", host: host(delete: { _ in throw goneCard }, toasts: toasts), writer: writer)
        #expect(result == .deleted)
        #expect(writer.changes == 1)
        #expect(writer.lastChange?.cardId == "c1")
        #expect(toasts.current?.message == L10n.Me.Actions.deletedForever)
    }

    @Test func aCardRestoredMeanwhileStaysAndAnyOtherFailureIsTheQuestions() async {
        let writer = WriteLauncher()
        let toasts = toasts()
        let restored = APIFailure(code: "conflict", message: "This card is not in the trash.", status: 409)
        let kept = try? await TrashMoves.deleteForever("c1", host: host(delete: { _ in throw restored }, toasts: toasts), writer: writer)
        #expect(kept == .notInTrash)
        #expect(writer.changes == 1)
        await #expect(throws: APIFailure.self) {
            try await TrashMoves.deleteForever("c1", host: host(delete: { _ in throw APIFailure.unexpected(status: 502) }, toasts: toasts),
                                               writer: writer)
        }
        // A refusal the question says: nothing moved, nothing to read again.
        #expect(writer.changes == 1)
    }

    @Test func aRestoreThatFailsStillHasWhatShowedTheCardReadAgain() async {
        let writer = WriteLauncher()
        let toasts = toasts()
        let came = await TrashMoves.restore("c1", answering: "original", host: host(toasts: toasts), writer: writer)
        #expect(!came)
        #expect(toasts.current?.message == L10n.Me.Actions.undoFailed)
        #expect(writer.changes == 1)
        #expect(writer.lastChange == .init(cardId: "c1", referenceCardId: "original"))
    }
}

/// 清空垃圾桶's question (trash.spec §5.3) lives with the card box, not the shelf: the shelves all read
/// again after an emptying, and a failure is said in the question, which stays to try once more.
@MainActor @Suite struct EmptyTrashQuestionTests {
    struct Refused: Error {}

    @Test func aFailedEmptyingKeepsAskingWithItsErrorAndTheShelvesReadAgain() async {
        let question = EmptyTrashQuestion()
        question.ask()
        var reads = 0
        await question.confirm(empty: { throw Refused() }, changed: { reads += 1 })
        #expect(question.asking)
        #expect(question.failed)
        #expect(!question.busy)
        #expect(reads == 1)
        // Tried again, it goes.
        await question.confirm(empty: {}, changed: { reads += 1 })
        #expect(!question.asking)
        #expect(!question.failed)
        #expect(reads == 2)
        // Asked again later: no old error.
        question.ask()
        #expect(question.asking && !question.failed)
    }
}

/// A card box shelf takes only the answer of the latest read that asked for it: 刪除 and its 復原 a
/// second later each read the shelves again, and the first answer landing last must not put the
/// shelf back as it was before the undo.
@MainActor @Suite struct ShelfReadsTests {
    @Test func anAnswerANewerReadTookOverIsDropped() {
        let reads = ShelfReads()
        let first = reads.begin([.published, ._private, .draft])
        let second = reads.begin([.published])
        #expect(!reads.current(.published, first))
        #expect(reads.current(.published, second))
        // What only the first asked for is still the first's.
        #expect(reads.current(._private, first))
        #expect(!reads.current(.trash, first))
    }

    @Test func aChangeLeavesNoReadOnItsWayCurrent() {
        let reads = ShelfReads()
        let before = reads.begin([.trash])
        reads.supersedeAll()
        #expect(!reads.current(.trash, before))
        let after = reads.begin([.trash])
        #expect(reads.current(.trash, after))
    }
}

/// The thought map keeps the place of a card that went to the trash (its node out of view, never in
/// the tray), and puts it back where it was — its region too — when the card comes back.
@MainActor @Suite struct ThoughtMapParkingTests {
    @Test func aTrashedCardsPlaceIsKeptAndARestoreBringsItBack() {
        var nodes = ["a": MapNode(cardId: "a", x: 10, y: 20, groupId: nil), "b": MapNode(cardId: "b", x: 300, y: 40, groupId: "g1")]
        var order = ["a", "b"]
        var parked: [String: MapNode] = [:]
        // b went to the trash: out of view, its place kept.
        ThoughtMapStore.parkNodes(&nodes, order: &order, parked: &parked) { $0 == "a" }
        #expect(order == ["a"])
        #expect(nodes["b"] == nil)
        #expect(Set(parked.keys) == ["b"])
        // Restored: back where it was, in its region.
        ThoughtMapStore.parkNodes(&nodes, order: &order, parked: &parked) { _ in true }
        #expect(order == ["a", "b"])
        #expect(nodes["b"] == MapNode(cardId: "b", x: 300, y: 40, groupId: "g1"))
        #expect(parked.isEmpty)
    }
}
