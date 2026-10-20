import FirebaseFirestore
import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// A draft store that records every write with its values and answers each as the test says
/// (at once by default), and answers whether a card is in the trash.
@MainActor final class RecordingDraftStore: DraftStore {
    enum Kind: Equatable { case create, update, edit }
    struct Write {
        let kind: Kind
        let id: String
        let values: DraftValues
    }

    private(set) var writes: [Write] = []
    /// What the next writes are answered with (success when empty).
    var answers: [Result<Void, Error>] = []
    /// Whether the card reads as being in the trash.
    var trashed = false
    private(set) var trashReads = 0
    private var made = 0

    func newDraftId() -> String {
        made += 1
        return "draft-\(made)"
    }

    func create(_ v: DraftValues, id: String, locale: String, referenceCardId: String?) -> IssuedWrite {
        record(.create, id, v)
    }

    func update(_ id: String, _ v: DraftValues) -> IssuedWrite {
        record(.update, id, v)
    }

    func saveEdit(_ id: String, _ v: DraftValues) -> IssuedWrite {
        record(.edit, id, v)
    }

    func discardEdit(_ id: String) async throws {}

    func isTrashed(_ id: String) async throws -> Bool {
        trashReads += 1
        return trashed
    }

    private func record(_ kind: Kind, _ id: String, _ v: DraftValues) -> IssuedWrite {
        writes.append(Write(kind: kind, id: id, values: v))
        let answer = answers.isEmpty ? .success(()) : answers.removeFirst()
        return IssuedWrite(answer: Task { try answer.get() })
    }
}

/// What the writer asked of the server in a test (`WriterCalls` in its place).
@MainActor final class ServerCalls {
    var published: [String] = []
    var applied: [String] = []
    var restored: [String] = []
    var insights: [(String, String)] = []
    var insightAnswer: String? = "被理解之前，先被看見"
    var publishError: Error?
    var applyError: Error?
    /// Whether the card still had a pending edit when it was applied (false: applied or dropped elsewhere).
    var applyFound = true
    var restoreAlone = false
    /// Holds a publish until the test lets it go.
    var publishGate: Gate<Void>?

    var calls: WriterCalls {
        WriterCalls(publish: { [self] id in
            published.append(id)
            if let publishGate { await publishGate.wait() }
            if let publishError { throw publishError }
            return "a-walk"
        }, applyEdit: { [self] id in
            applied.append(id)
            if let applyError { throw applyError }
            return WriterCalls.AppliedEdit(applied: applyFound, slug: "a-walk")
        }, insight: { [self] title, story in
            insights.append((title, story))
            return insightAnswer
        }, restore: { [self] id in
            restored.append(id)
            return restoreAlone
        })
    }
}

private func writing() -> WritingAPI {
    let configuration = APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in nil })
    return WritingAPI(client: ResonanceClient.make(configuration), configuration: configuration)
}

@MainActor private func card(published: Bool = false, pending: Bool = false, title: String = "A walk", story: String = "Out in the rain.",
                  visibility: String = "public", anonymous: Bool = false, reference: String? = nil,
                  live: (String, Bool)? = nil) -> DraftService.OpenedCard {
    var opened = DraftService.OpenedCard(
        id: "card-1", values: DraftValues(title: title, story: story, visibility: visibility, anonymous: anonymous),
        isPublished: published, slug: published ? "a-walk" : nil, referenceCardId: reference, hasPendingEdit: pending)
    opened.liveVisibility = live?.0 ?? visibility
    opened.liveAnonymous = live?.1 ?? anonymous
    return opened
}

private let refusedByRules = NSError(domain: FirestoreErrorDomain, code: FirestoreErrorCode.permissionDenied.rawValue)
private let inTheTrash = APIFailure(code: "conflict", message: "This card is in the trash.", status: 409)

/// The writer's two steps (writer.spec §1.6, §3): 下一步 asks for a title, keeps a new draft before
/// the publish step opens (and stays writing when that save is refused), opens the step at once for a
/// kept one; the step's back is back to writing, never while a publish is on its way.
@MainActor @Suite struct WriterStepTests {
    @Test func nothingWrittenNothingToGoOnWithAndALiveCardAlwaysCan() {
        let server = ServerCalls()
        let empty = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls)
        #expect(!empty.canGoNext)
        empty.values.story = "Out in the rain."
        #expect(empty.canGoNext)
        let live = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls,
                              opened: card(published: true, title: "", story: ""))
        #expect(live.canGoNext)
    }

    @Test func withoutATitleTheWriterStaysAndIsAskedForOne() async {
        let store = RecordingDraftStore()
        let server = ServerCalls()
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls)
        model.values.story = "A story without a title."
        #expect(await model.goNext() == false)
        #expect(model.step == .write)
        #expect(model.titleError)
        // An untitled draft never costs the mirror a call.
        #expect(server.insights.isEmpty)
        // Typing a title clears the question.
        model.values.title = "A walk"
        #expect(!model.titleError)
    }

    @Test func aNewDraftIsKeptBeforeTheStepOpens() async {
        let store = StuckDraftStore()
        let server = ServerCalls()
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls)
        model.values.title = "A walk"
        let going = Task { await model.goNext() }
        #expect(await eventually { store.writes == [.create("draft-1", "A walk")] })
        // The server hasn't taken it yet: still writing, 下一步 at work (its loader after a moment).
        #expect(model.step == .write)
        #expect(model.nextBusy)
        #expect(await eventually { model.nextLoading })
        store.answer()
        #expect(await going.value)
        #expect(model.step == .publish)
        #expect(!model.nextBusy)
        #expect(!model.nextLoading)
    }

    @Test func aRefusedFirstSaveKeepsTheWriterWritingAndSaysSo() async {
        let store = RecordingDraftStore()
        store.answers = [.failure(refusedByRules)]
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls)
        model.values.title = "A walk"
        #expect(await model.goNext() == false)
        #expect(model.step == .write)
        #expect(model.nextSaveError == L10n.Native.saveError)
        #expect(model.draftId == nil)
        // Tried again, it goes.
        #expect(await model.goNext())
        #expect(model.step == .publish)
        #expect(model.nextSaveError == nil)
    }

    @Test func aKeptDraftOpensTheStepAtOnceSavingOnItsWay() async {
        let store = StuckDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card())
        model.values.story += " And then it stopped."
        // Not answered, and the step opens all the same.
        #expect(await model.goNext())
        #expect(model.step == .publish)
        #expect(store.writes == [.update("card-1", "A walk")])
    }

    @Test func backFromTheStepIsWritingAndFromWritingThePagesWayOut() async {
        let server = ServerCalls()
        let model = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls, opened: card())
        #expect(model.stepBack() == false)
        #expect(await model.goNext())
        #expect(model.stepBack())
        #expect(model.step == .write)
        // While a publish is on its way the step holds.
        #expect(await model.goNext())
        let gate = Gate<Void>()
        server.publishGate = gate
        let publishing = Task { await model.publish() }
        #expect(await eventually { model.pending })
        #expect(model.stepBack())
        #expect(model.step == .publish)
        await gate.open(())
        #expect(await publishing.value == "a-walk")
        #expect(!model.pending)
    }

    @Test func theTitleIsOneLineAReturnGoesOnToTheStory() {
        let model = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls)
        #expect(model.typeTitle("A walk") == false)
        // Return typed after the title: on to the story, the title as it was.
        #expect(model.typeTitle("A walk\n") == true)
        #expect(model.values.title == "A walk")
        // A pasted line break is a space.
        #expect(model.typeTitle("A walk\nin the rain") == false)
        #expect(model.values.title == "A walk in the rain")
        // Never past 60, and the count shows from 50 on.
        model.typeTitle(String(repeating: "雨", count: 70))
        #expect(model.values.title.count == WriteModel.titleMax)
        #expect(model.showsTitleCount)
        model.typeTitle(String(repeating: "雨", count: 49))
        #expect(!model.showsTitleCount)
    }

    @Test func aNewCardsTitleTakesItsTypeFromTheInterfaceLanguage() {
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, locale: "en").script == .latin)
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, locale: "zh-TW").script == .cjk)
        // A draft opened again is read as it is, from there.
        let english = card(title: "The rain stopped just before dusk",
                           story: "and the street outside the bakery shone like a river of glass, every window lit.")
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: english, locale: "zh-TW").script == .latin)
    }
}

/// The publish step (writer.spec §2): the mirror is asked once per text, never for a live card's
/// revision; who can see it and the byline are the draft's own values, written as they change — one
/// change, so no write is ever anonymous and for connections only — and they survive going back to
/// writing; the resonance line says whether the original's author will know.
@MainActor @Suite struct PublishStepTests {
    @Test func theMirrorIsAskedOncePerTextAndAgainOnlyForNewWords() async {
        let server = ServerCalls()
        let model = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls, opened: card())
        #expect(await model.goNext())
        #expect(await eventually { model.insight == .shown("被理解之前，先被看見") })
        #expect(server.insights.count == 1)
        // Back to writing and on again with the same words: the answer kept, nothing spent.
        model.stepBack()
        #expect(await model.goNext())
        #expect(model.insight == .shown("被理解之前，先被看見"))
        #expect(server.insights.count == 1)
        // New words: asked again.
        model.stepBack()
        model.values.story += " The river kept going."
        #expect(await model.goNext())
        #expect(await eventually { server.insights.count == 2 })
    }

    @Test func noAnswerCollapsesTheLineAndALiveCardIsNeverAsked() async {
        let server = ServerCalls()
        server.insightAnswer = nil
        let draft = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls, opened: card())
        #expect(await draft.goNext())
        #expect(await eventually { draft.insight == WriteModel.Insight.none })
        let live = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls, opened: card(published: true))
        #expect(await live.goNext())
        #expect(live.insight == nil)
        #expect(server.insights.count == 1)
    }

    @Test func theAudienceChosenInTheStepIsSavedAndKeptGoingBack() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect(await model.goNext())
        model.choose(visibility: "private")
        model.store()
        #expect(store.writes.last?.values.visibility == "private")
        model.stepBack()
        #expect(model.values.visibility == "private")
        #expect(!model.needsSave)
    }

    @Test func anonymousOnAConnectionsDraftGoesPublicInTheSameWrite() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card(visibility: "connections"))
        model.setAnonymous(true)
        #expect(model.values.anonymous)
        #expect(model.values.visibility == "public")
        model.store()
        #expect(store.writes.count == 1)
        #expect(store.writes.allSatisfy { !($0.values.anonymous && $0.values.visibility == "connections") })
        // Only-me stays only-me under either byline.
        model.choose(visibility: "private")
        model.setAnonymous(false)
        #expect(model.values.visibility == "private")
        // A connections card not made anonymous keeps its audience: neither side chosen.
        let kept = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card(visibility: "connections"))
        #expect(kept.values.visibility == "connections")
    }

    @Test func theResonanceLineFollowsTheChoice() {
        let draft = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(reference: "original"))
        #expect(draft.resonanceLine == L10n.Write.PublishPanel.resonanceReaches)
        draft.choose(visibility: "private")
        #expect(draft.resonanceLine == L10n.Write.PublishPanel.resonanceQuiet)
        draft.choose(visibility: "public")
        draft.setAnonymous(true)
        #expect(draft.resonanceLine == L10n.Write.PublishPanel.resonanceQuiet)
        // Not a resonance: no line.
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card()).resonanceLine == nil)
        // A live resonance hidden from its original: said only when this save makes it public and named.
        let hidden = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                opened: card(published: true, visibility: "private", reference: "original"))
        #expect(hidden.resonanceLine == nil)
        hidden.choose(visibility: "public")
        #expect(hidden.resonanceLine == L10n.Write.PublishPanel.resonanceReaches)
        // One that reaches already (public, named, as readers have it now): nothing new to say.
        let reaching = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                  opened: card(published: true, reference: "original"))
        #expect(reaching.resonanceLine == nil)
        // Its pending edit hid it, yet readers still see it public: saving it public again says nothing new.
        let edited = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                opened: card(published: true, pending: true, visibility: "private", reference: "original",
                                             live: ("public", false)))
        edited.choose(visibility: "public")
        #expect(edited.resonanceLine == nil)
    }

    @Test func publishingSendsTheDraftAsItIsAndALiveCardSavesItsRevision() async {
        let store = RecordingDraftStore()
        let server = ServerCalls()
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card())
        model.choose(visibility: "private")
        #expect(await model.publish() == "a-walk")
        #expect(server.published == ["card-1"])
        #expect(store.writes.last?.values.visibility == "private")
        let live = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card(published: true))
        live.values.story += " Revised."
        #expect(await live.applyEdit() == "a-walk")
        #expect(server.applied == ["card-1"])
        #expect(store.writes.last?.kind == .edit)
        #expect(!live.hasPendingEdit)
    }

    @Test func aPublishThatDidntGoSaysWhyInTheWritersWords() async {
        let server = ServerCalls()
        server.publishError = APIFailure.unexpected(status: 502)
        let model = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls, opened: card())
        #expect(await model.goNext())
        #expect(await model.publish() == nil)
        #expect(model.publishError == L10n.Write.PublishPanel.failed)
        #expect(model.step == .publish)
        #expect(!model.trashed)
        server.publishError = APIFailure(code: "rate_limited", message: "Too many.", status: 429)
        #expect(await model.publish() == nil)
        #expect(model.publishError == L10n.Write.PublishPanel.rateLimited)
    }

    @Test func aDraftKeptAnonymousForConnectionsGoesOutPublic() async {
        // Kept so by a build before letters (or the web's draft beside their anonymous switch): the rules let a draft hold it.
        let store = RecordingDraftStore()
        let server = ServerCalls()
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls,
                               opened: card(visibility: "connections", anonymous: true))
        // The step opens on an audience it can show: 公開 chosen.
        #expect(await model.goNext())
        #expect(model.values.visibility == "public")
        #expect(await model.publish() == "a-walk")
        #expect(server.published == ["card-1"])
        // What the server publishes was never anonymous and for connections only.
        #expect(store.writes.last?.values.visibility == "public")
        #expect(store.writes.last?.values.anonymous == true)
        #expect(store.writes.allSatisfy { !($0.values.anonymous && $0.values.visibility == "connections") })
        // A live card already that way keeps both (the server lets it).
        let live = WriteModel(drafts: store, writing: writing(), calls: server.calls,
                              opened: card(published: true, visibility: "connections", anonymous: true))
        #expect(await live.goNext())
        #expect(live.values.visibility == "connections")
    }

    @Test func savingChangesWritesTheBufferFirstEvenUnchanged() async {
        // A revision kept in its buffer, nothing typed since: 儲存修改 writes it again before applying.
        let store = RecordingDraftStore()
        let server = ServerCalls()
        let live = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card(published: true, pending: true))
        #expect(!live.needsSave)
        #expect(await live.applyEdit() == "a-walk")
        #expect(store.writes.map(\.kind) == [.edit])
        #expect(server.applied == ["card-1"])
    }

    @Test func changesWhoseBufferWentElsewhereAreNotSaidToBeSaved() async {
        // The buffer was applied or dropped on another device meanwhile: the server finds nothing to apply.
        let store = RecordingDraftStore()
        let server = ServerCalls()
        server.applyFound = false
        let live = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card(published: true, pending: true))
        #expect(await live.goNext())
        #expect(await live.applyEdit() == nil)
        #expect(live.publishError == L10n.Native.saveError)
        #expect(live.step == .publish)
        // The words on screen are owed a save: leaving asks and writes them, a retry writes them again.
        #expect(live.needsSave)
        #expect(live.leaveQuestion == .revision)
        server.applyFound = true
        #expect(await live.applyEdit() == "a-walk")
        #expect(store.writes.map(\.kind) == [.edit, .edit])
        #expect(live.publishError == nil)
    }

    @Test func theWayOutBesideTheVerb() {
        #expect(PublishStep.showsSecondary(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card())))
        let live = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(published: true))
        #expect(!PublishStep.showsSecondary(live))
        #expect(PublishStep.showsSecondary(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                                      opened: card(published: true, pending: true))))
        #expect(PublishStep.title(updating: false) == L10n.Write.PublishPanel.title)
        #expect(PublishStep.title(updating: true) == L10n.Write.PublishPanel.updateTitle)
        #expect(PublishStep.verbEnabled(live))
    }

    @Test func thePreviewIsTheCardAsAListWillShowIt() {
        let model = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                               opened: card(title: "被看見，比被喜歡更難得", story: "## 那天下午\n\n**雨**停了。"))
        model.values.tags = ["記憶", "家人", "雨", "河", "第五個"]
        let named = model.preview(me: Fixture.me("ahzhen"))
        #expect(named.title == "被看見，比被喜歡更難得")
        #expect(named.excerpt == "那天下午 雨停了。")
        #expect(named.authorName == "ahzhen")
        #expect(named.tags == ["記憶", "家人", "雨", "河"])
        model.setAnonymous(true)
        let anonymous = model.preview(me: Fixture.me("ahzhen"))
        #expect(anonymous.authorName == L10n.Write.PublishPanel.anonymousName)
        #expect(anonymous.authorInitials == "·")
        #expect(anonymous.authorImageURL == nil)
    }
}

/// A card moved to the trash while the writer has it open (trash.spec §5.5, the critique's writer
/// case): a refused save, or a publish answered 409, is looked into — in the trash, the writer goes
/// back to writing, says so with 還原, writes nothing more and keeps what is typed; restored, it
/// writes what was typed meanwhile. A refusal the trash doesn't explain is the usual error.
@MainActor @Suite struct WriterTrashTests {
    @Test func aSaveRefusedBecauseTheCardIsInTheTrashSaysSo() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect(await model.goNext())
        store.trashed = true
        store.answers = [.failure(refusedByRules)]
        model.values.story += " Typed elsewhere's trash."
        model.store()
        #expect(await eventually { model.trashed })
        #expect(model.step == .write)
        #expect(model.saveStatus == nil)
        #expect(!model.canGoNext)
        // Nothing more is written into it; what is typed stays.
        let writes = store.writes.count
        model.values.story += " More."
        model.store()
        #expect(store.writes.count == writes)
        #expect(model.values.story.hasSuffix(" More."))
    }

    @Test func leavingACardInTheTrashNeverSaysTheWritingIsKept() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect(model.leaveQuestion == .draft)
        store.trashed = true
        store.answers = [.failure(refusedByRules)]
        model.values.story += " Typed after it went to the trash."
        model.store()
        #expect(await eventually { model.trashed })
        // What was typed is held nowhere: the question says the card saves only once restored.
        #expect(model.leaveQuestion == .trashed)
        #expect(WriteScreen.leaveMessage(model.leaveQuestion) == L10n.Write.Trashed.status)
        #expect(WriteScreen.leaveMessage(.draft) == L10n.Write.leaveBody)
        #expect(WriteScreen.leaveMessage(.revision) == L10n.Write.leaveBodyRevision)
        // A live card's revision alike.
        let live = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card(published: true, pending: true))
        #expect(live.leaveQuestion == .revision)
        store.answers = [.failure(refusedByRules)]
        live.values.story += " More."
        live.store()
        #expect(await eventually { live.trashed })
        #expect(live.leaveQuestion == .trashed)
        // Nothing typed since its last save took: everything on screen is in the card, and leaving asks nothing.
        let server = ServerCalls()
        server.publishError = inTheTrash
        let saved = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card())
        #expect(await saved.goNext())
        _ = await saved.publish()
        #expect(saved.trashed)
        #expect(!saved.needsSave)
        #expect(saved.leaveQuestion == nil)
    }

    @Test func aRefusedSaveThatIsNotTheTrashIsLeftForTheNextTry() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card())
        store.answers = [.failure(refusedByRules)]
        model.values.story += " Refused."
        model.store()
        #expect(await eventually { store.trashReads == 1 })
        #expect(!model.trashed)
        #expect(model.needsSave)
    }

    @Test func aPublishAnsweredInTheTrashReturnsToWriting() async {
        let store = RecordingDraftStore()
        let server = ServerCalls()
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card())
        #expect(await model.goNext())
        server.publishError = inTheTrash
        store.trashed = true
        #expect(await model.publish() == nil)
        #expect(model.trashed)
        #expect(model.step == .write)
        #expect(model.publishError == nil)
        // Read without the card (offline): the server's 409 is answer enough.
        let unread = WriteModel(drafts: nil, writing: writing(), calls: server.calls, opened: card())
        #expect(await unread.goNext())
        #expect(await unread.publish() == nil)
        #expect(unread.trashed)
    }

    @Test func savingChangesAnsweredInTheTrashReturnsToWriting() async {
        let store = RecordingDraftStore()
        store.trashed = true
        let server = ServerCalls()
        server.applyError = inTheTrash
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card(published: true))
        #expect(await model.goNext())
        #expect(await model.applyEdit() == nil)
        #expect(model.trashed)
        #expect(model.step == .write)
    }

    @Test func restoringWritesWhatWasTypedMeanwhile() async {
        let store = RecordingDraftStore()
        let server = ServerCalls()
        server.publishError = inTheTrash
        store.trashed = true
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card())
        #expect(await model.goNext())
        _ = await model.publish()
        #expect(model.trashed)
        model.values.story += " Written while it was in the trash."
        let before = store.writes.count
        await model.restore()
        #expect(server.restored == ["card-1"])
        #expect(!model.trashed)
        #expect(!model.restoredAlone)
        #expect(store.writes.count == before + 1)
        #expect(store.writes.last?.values.story.hasSuffix("in the trash.") == true)
        #expect(model.canGoNext)
    }

    @Test func aResonanceThatCameBackAloneSaysSo() async {
        let store = RecordingDraftStore()
        let server = ServerCalls()
        server.publishError = inTheTrash
        server.restoreAlone = true
        store.trashed = true
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card(reference: "original"))
        _ = await model.goNext()
        _ = await model.publish()
        await model.restore()
        #expect(model.restoredAlone)
    }

    @Test func anOpenedCardSaysWhetherItIsInTheTrash() {
        let now = Date(timeIntervalSince1970: 1_800_000_000)
        let base: [String: Any] = ["authorId": "alice", "thoughtCore": "A walk", "story": "Rain.", "visibility": "private",
                                   "anonymous": false, "publishedAt": Timestamp(date: now.addingTimeInterval(-86_400 * 40))]
        #expect(DraftService.opened(id: "c", data: base, buffered: nil, now: now)?.trashedAt == nil)
        var trashed = base
        trashed["trashedAt"] = Timestamp(date: now.addingTimeInterval(-86_400 * 3))
        #expect(DraftService.opened(id: "c", data: trashed, buffered: nil, now: now)?.trashedAt != nil)
        // Past its 30 days it is gone to its owner too.
        trashed["trashedAt"] = Timestamp(date: now.addingTimeInterval(-86_400 * 31))
        #expect(DraftService.opened(id: "c", data: trashed, buffered: nil, now: now) == nil)
        // A live card's audience is what readers have now, whatever its pending edit says.
        var live = base
        live["visibility"] = "public"
        let opened = DraftService.opened(id: "c", data: live, buffered: ["thoughtCore": "A walk", "story": "Rain.", "visibility": "private"],
                                         now: now)
        #expect(opened?.values.visibility == "private")
        #expect(opened?.liveVisibility == "public")
        #expect(opened?.hasPendingEdit == true)
    }
}

/// How long a story takes to read (lib/readTime): CJK by the character, the rest by the word.
@Suite struct ReadTimeTests {
    private let zh = "那天傍晚，雨終於停了。我沿著河堤慢慢走，路燈一盞一盞亮起來，水面浮著碎碎的光。"
    private let en = "The rain stopped just before dusk, and the street outside the bakery shone like a river of glass."

    private func zh(_ n: Int) -> String { String(String(repeating: zh, count: n / zh.count + 1).prefix(n)) }
    private func en(_ n: Int) -> String {
        let words = en.split(separator: " ")
        return (0..<n).map { String(words[$0 % words.count]) }.joined(separator: " ")
    }

    @Test func chineseByTheCharacterEnglishByTheWord() {
        #expect(ReadTime.minutes("") == 1)
        #expect(ReadTime.minutes(zh(320)) == 1)
        #expect(ReadTime.minutes(zh(479)) == 1)
        #expect(ReadTime.minutes(zh(480)) == 2)
        #expect(ReadTime.minutes(zh(1600)) == 5)
        #expect(ReadTime.minutes(en(344)) == 1)
        #expect(ReadTime.minutes(en(345)) == 2)
        #expect(ReadTime.minutes(en(1150)) == 5)
    }
}

/// The caret's line is kept between the bar and the keyboard's format bar (writer.spec §1.5): the
/// page scrolls only when the line, 16 above and below it, leaves what is shown, and then just enough.
@MainActor @Suite struct CaretFollowTests {
    // The page shows 366 between a 120 top inset and the keyboard, scrolled to its top.
    private let atTop = CaretFollow.Viewport(offset: -120, insetTop: 120, height: 366)

    @Test func aCaretInViewMovesNothing() {
        #expect(CaretFollow.offset(caret: .init(top: 100, bottom: 125), islandTop: 73, viewport: atTop) == nil)
    }

    @Test func aCaretUnderTheKeyboardBringsItsLineJustAboveIt() {
        // Its line's foot at 73 + 1148, 16 under it, at the foot of what is shown: 1237 − 366.
        #expect(CaretFollow.offset(caret: .init(top: 1123, bottom: 1148), islandTop: 73, viewport: atTop) == CGFloat(871))
    }

    @Test func aCaretAboveWhatIsShownBringsItsLineJustUnderTheBar() {
        let down = CaretFollow.Viewport(offset: 751, insetTop: 120, height: 366)
        // Its line's top at 73 + 200, 16 over it, at the top of what is shown.
        #expect(CaretFollow.offset(caret: .init(top: 200, bottom: 225), islandTop: 73, viewport: down) == CGFloat(257))
        // Never above the page's top.
        #expect(CaretFollow.offset(caret: .init(top: 0, bottom: 25), islandTop: 0, viewport: down) == CGFloat(0))
        // Nothing shown yet (laid out with no height): nothing to follow.
        #expect(CaretFollow.offset(caret: .init(top: 2000, bottom: 2025), islandTop: 0, viewport: .init(offset: 0, insetTop: 0, height: 0)) == nil)
    }
}
