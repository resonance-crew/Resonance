import DesignSystem
import FirebaseFirestore
import Foundation
import ResonanceKit
import Testing
import UIKit
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

    /// Drafts deleted (a card begun and emptied again).
    private(set) var deleted: [String] = []

    func deleteDraft(_ id: String) async throws { deleted.append(id) }

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

    /// A phone's preview band is home's first card under the bar (no rule of its own, started at the
    /// bar's line) only with nothing above it: not while the mirror's line is on its way or shown, not
    /// under 更新這張卡片's hint, never in the split's pane (its heading) or as a wider window's card.
    @Test func aPhonesBandLeadsUnderTheBarOnlyWithNothingAboveIt() async {
        let quiet = ServerCalls()
        quiet.insightAnswer = nil
        let draft = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: quiet.calls, opened: card())
        #expect(await draft.goNext())
        // The mirror's line is on its way above the band.
        #expect(draft.insight == .loading)
        #expect(!PublishStep.bandUnderBar(draft, showsBar: true, compact: true))
        #expect(PublishStep.topPadding(draft, showsBar: true, compact: true) == 16)
        // Nothing to say: the line collapses, and the band is the first thing under the bar.
        #expect(await eventually { draft.insight == WriteModel.Insight.none })
        #expect(PublishStep.bandUnderBar(draft, showsBar: true, compact: true))
        #expect(PublishStep.topPadding(draft, showsBar: true, compact: true) == 0)
        // The split's pane heads the step with its own row; a wider window draws a bordered card.
        #expect(!PublishStep.bandUnderBar(draft, showsBar: false, compact: true))
        #expect(PublishStep.topPadding(draft, showsBar: false, compact: true) == WriteWorkspace.paneTop)
        #expect(!PublishStep.bandUnderBar(draft, showsBar: true, compact: false))
        #expect(PublishStep.topPadding(draft, showsBar: true, compact: false) == 16)

        // A mirror line shown stays above the band, which keeps its rule.
        let mirrored = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect(await mirrored.goNext())
        #expect(await eventually { mirrored.insight == .shown("被理解之前，先被看見") })
        #expect(!PublishStep.bandUnderBar(mirrored, showsBar: true, compact: true))
        #expect(PublishStep.topPadding(mirrored, showsBar: true, compact: true) == 16)

        // A live card's step says 更新這張卡片's hint above the band.
        let live = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: quiet.calls, opened: card(published: true))
        #expect(await live.goNext())
        #expect(!PublishStep.bandUnderBar(live, showsBar: true, compact: true))
        #expect(PublishStep.topPadding(live, showsBar: true, compact: true) == 16)
    }

    @Test func theAudienceChosenInTheStepIsSavedAndKeptGoingBack() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect(await model.goNext())
        model.choose(.private)
        model.store()
        #expect(store.writes.last?.values.visibility == "private")
        model.stepBack()
        #expect(model.values.visibility == "private")
        #expect(!model.needsSave)
    }

    /// 誰可以看見 is one choice of three (round 7 §1.1): each writes both fields in one change, so no
    /// write is ever anonymous and for connections only; a card kept for connections shows none chosen.
    @Test func anonymousOnAConnectionsDraftGoesPublicInTheSameWrite() async {
        let store = RecordingDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card(visibility: "connections"))
        #expect(model.audience == nil)
        model.choose(.anonymous)
        #expect(model.values.anonymous)
        #expect(model.values.visibility == "public")
        #expect(model.audience == .anonymous)
        model.store()
        #expect(store.writes.count == 1)
        #expect(store.writes.allSatisfy { !($0.values.anonymous && $0.values.visibility == "connections") })
        model.choose(.public)
        #expect(model.values.visibility == "public" && !model.values.anonymous)
        #expect(model.audience == .public)
        // A connections card left alone keeps its audience: none chosen.
        let kept = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card(visibility: "connections"))
        #expect(kept.values.visibility == "connections")
        #expect(kept.audience == nil)
    }

    /// 只有自己 names a draft — nothing of 匿名公開 tried on the way is left — and keeps a live card's
    /// byline: an anonymous card made private, then public again from its ⋯, comes back anonymous.
    @Test func onlyMeNamesADraftAndKeepsALiveCardsByline() {
        let draft = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card())
        draft.choose(.anonymous)
        draft.choose(.private)
        #expect(draft.values.visibility == "private")
        #expect(!draft.values.anonymous)
        #expect(draft.audience == .private)
        // An anonymous draft opened again: 只有自己 still names it.
        let anonymousDraft = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(anonymous: true))
        anonymousDraft.choose(.private)
        #expect(!anonymousDraft.values.anonymous)

        let anonymousLive = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                       opened: card(published: true, anonymous: true))
        #expect(anonymousLive.audience == .anonymous)
        anonymousLive.choose(.private)
        #expect(anonymousLive.values.visibility == "private")
        #expect(anonymousLive.values.anonymous)
        #expect(anonymousLive.audience == .private)
        // Tried under the pen name on the way: 只有自己 still keeps the byline the card had.
        anonymousLive.choose(.public)
        anonymousLive.choose(.private)
        #expect(anonymousLive.values.anonymous)

        let namedLive = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(published: true))
        namedLive.choose(.anonymous)
        namedLive.choose(.private)
        #expect(!namedLive.values.anonymous)
        // A private anonymous card reads as 只有自己.
        let privateAnonymous = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                          opened: card(published: true, visibility: "private", anonymous: true))
        #expect(privateAnonymous.audience == .private)
    }

    /// The step's title and its one button (round 8 §2.3), row by row: an unpublished card publishes
    /// (發布 · 匿名發布) or is saved (儲存草稿 · 儲存); a card readers have is updated (更新這張卡片 · 儲存修改)
    /// or moved to the drafts (轉為草稿); a published 草稿 is published again (發布這張卡片 · 發布) or saved.
    /// The 更新 hint only while readers have it and keep it.
    @Test func theTitleAndTheOneButtonFollowTheCardAndItsType() {
        let draft = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect((draft.stepTitle, draft.verbTitle) == (L10n.Write.PublishPanel.title, L10n.Write.PublishPanel.publish))
        draft.choose(.anonymous)
        #expect((draft.stepTitle, draft.verbTitle) == (L10n.Write.PublishPanel.title, L10n.Write.PublishPanel.publishAnonymously))
        draft.choose(.private)
        #expect((draft.stepTitle, draft.verbTitle) == (L10n.Write.PublishPanel.saveTitle, L10n.Write.PublishPanel.save))
        #expect(!draft.showsUpdateHint)

        // For connections (none chosen): it reads as publishing.
        let connections = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(visibility: "connections"))
        #expect((connections.stepTitle, connections.verbTitle) == (L10n.Write.PublishPanel.title, L10n.Write.PublishPanel.publish))

        // A card readers have: 更新這張卡片 whatever is chosen — 儲存修改, or 轉為草稿 for 草稿.
        let live = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(published: true))
        #expect(live.readersSee)
        #expect((live.stepTitle, live.verbTitle) == (L10n.Write.PublishPanel.updateTitle, L10n.Write.PublishPanel.update))
        #expect(live.showsUpdateHint)
        live.choose(.anonymous)
        #expect(live.verbTitle == L10n.Write.PublishPanel.update)
        #expect(live.showsUpdateHint)
        live.choose(.private)
        #expect((live.stepTitle, live.verbTitle) == (L10n.Write.PublishPanel.updateTitle, L10n.Write.PublishPanel.makeDraft))
        #expect(!live.showsUpdateHint)
        // Kept to its author with nothing above it, a phone's band leads under the bar.
        #expect(PublishStep.bandUnderBar(live, showsBar: true, compact: true))

        // A published 草稿 (private): a 草稿 to its author — shared again it is published, kept it is saved.
        let kept = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                              opened: card(published: true, visibility: "private"))
        #expect(!kept.readersSee)
        #expect((kept.stepTitle, kept.verbTitle) == (L10n.Write.PublishPanel.saveTitle, L10n.Write.PublishPanel.save))
        #expect(!kept.showsUpdateHint)
        kept.choose(.public)
        #expect((kept.stepTitle, kept.verbTitle) == (L10n.Write.PublishPanel.title, L10n.Write.PublishPanel.publish))
        #expect(!kept.showsUpdateHint)
        kept.choose(.anonymous)
        #expect((kept.stepTitle, kept.verbTitle) == (L10n.Write.PublishPanel.title, L10n.Write.PublishPanel.publishAnonymously))
    }

    /// The page's title, short at every size (round 8 §2.1): 新卡片, 編輯草稿 for a 草稿 (a draft, or a
    /// published card kept private), 編輯卡片 for a card readers have.
    @Test func thePagesTitleSaysWhatTheCardIs() {
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls).title == L10n.Write.title)
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card()).title == L10n.Write.editTitle)
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                           opened: card(published: true, visibility: "private")).title == L10n.Write.editTitle)
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(published: true)).title
            == L10n.Write.editPublishedTitle)
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                           opened: card(published: true, visibility: "connections")).title == L10n.Write.editPublishedTitle)
        // Its pending edit made it private, yet readers have it now: 編輯卡片.
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                           opened: card(published: true, pending: true, visibility: "private", live: ("public", false))).title
            == L10n.Write.editPublishedTitle)
        // One in the trash, as its restore would leave it.
        var trashed = card(published: true, visibility: "private")
        trashed.trashedAt = Date()
        trashed.restoresTo = "public"
        #expect(WriteModel.pageTitle(trashed) == L10n.Write.editPublishedTitle)
        trashed.restoresTo = "private"
        #expect(WriteModel.pageTitle(trashed) == L10n.Write.editTitle)
    }

    /// What each row does (round 8 §2.3, round 9 §1): an unpublished 私人卡 is written — never published —
    /// and its page opens; shared, it is published and its page opens; a published card's revision is
    /// applied and its page opens, whatever it is now (a 私人卡's page is its owner's to read).
    @Test func theOneButtonPublishesSavesOrApplies() async {
        let store = RecordingDraftStore()
        let server = ServerCalls()
        let draft = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card())
        draft.choose(.private)
        #expect(await draft.submit() == .card("card-1"))
        #expect(server.published.isEmpty)
        #expect(store.writes.last?.values.visibility == "private")
        #expect(store.writes.last?.values.anonymous == false)
        draft.choose(.public)
        #expect(await draft.submit() == .card("a-walk"))
        #expect(server.published == ["card-1"])

        let live = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card(published: true))
        live.choose(.private)
        #expect(await live.submit() == .card("a-walk"))
        #expect(server.applied == ["card-1"])
        #expect(store.writes.last?.kind == .edit)
        #expect(store.writes.last?.values.visibility == "private")

        let kept = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card(published: true, visibility: "private"))
        kept.choose(.public)
        #expect(await kept.submit() == .card("a-walk"))
        #expect(server.applied == ["card-1", "card-1"])
        #expect(server.published == ["card-1"])
        let stillKept = WriteModel(drafts: store, writing: writing(), calls: server.calls,
                                   opened: card(published: true, visibility: "private"))
        #expect(await stillKept.submit() == .card("a-walk"))
        #expect(server.applied.count == 3)
    }

    /// No empty 私人卡 (round 9 §1): nothing is made before something is written, and a card begun on
    /// this visit and emptied again goes as the writer leaves; a card opened from the box never does.
    @Test func aCardBegunAndEmptiedLeavesNothingBehind() async {
        let store = RecordingDraftStore()
        let fresh = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls)
        #expect(await fresh.dropIfEmpty() == false)
        fresh.store()
        #expect(store.writes.isEmpty, "nothing written, nothing made")
        fresh.values.title = "Gone soon"
        _ = await fresh.saveNow()
        #expect(store.writes.first?.kind == .create)
        fresh.values.title = ""
        #expect(await fresh.dropIfEmpty())
        #expect(store.deleted == ["draft-1"])
        #expect(fresh.draftId == nil)

        // Written and kept: nothing deleted.
        let kept = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls)
        kept.values.title = "Stays"
        _ = await kept.saveNow()
        #expect(await kept.dropIfEmpty() == false)
        // Opened from the box with nothing on it: not this writer's to delete.
        let opened = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card(title: "", story: ""))
        #expect(await opened.dropIfEmpty() == false)
        #expect(store.deleted == ["draft-1"])
    }

    /// A 私人卡's 儲存 that the server refused stays, saying 沒儲存成功; one still on its way (offline)
    /// leaves all the same — it is on the device, its page not on the server yet.
    @Test func keepingADraftThatWasRefusedStaysAndSaysSo() async {
        let store = RecordingDraftStore()
        store.answers = [.failure(NSError(domain: "test", code: 1))]
        let draft = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card())
        draft.choose(.private)
        #expect(await draft.submit() == nil)
        #expect(draft.publishError == L10n.Write.PublishPanel.saveFailed)
        // Tried again, it goes — to its page.
        #expect(await draft.submit() == .card("card-1"))
        #expect(draft.publishError == nil)

        let stuck = StuckDraftStore()
        let offline = WriteModel(drafts: stuck, writing: writing(), calls: ServerCalls().calls, opened: card())
        offline.choose(.private)
        #expect(await offline.submit() == .leave)
    }

    /// Failure lines (round 8 §2.3): 沒發布成功 for a publish — a draft shared, a published 草稿 made
    /// public again — and 沒儲存成功 for every other row.
    @Test func aFailureSaysPublishOrSaveByTheRow() async {
        let server = ServerCalls()
        server.publishError = APIFailure.unexpected(status: 502)
        server.applyError = APIFailure.unexpected(status: 502)
        let draft = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls, opened: card())
        #expect(await draft.submit() == nil)
        #expect(draft.publishError == L10n.Write.PublishPanel.failed)

        let live = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls, opened: card(published: true))
        #expect(await live.submit() == nil)
        #expect(live.publishError == L10n.Write.PublishPanel.saveFailed)
        live.choose(.private)
        #expect(await live.submit() == nil)
        #expect(live.publishError == L10n.Write.PublishPanel.saveFailed)

        let kept = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: server.calls,
                              opened: card(published: true, visibility: "private"))
        #expect(await kept.submit() == nil)
        #expect(kept.publishError == L10n.Write.PublishPanel.saveFailed)
        kept.choose(.public)
        #expect(await kept.submit() == nil)
        #expect(kept.publishError == L10n.Write.PublishPanel.failed)
    }

    /// The cover is changed on the picture: one menu of another picture, a drawn one (waiting for a
    /// story) and none, in the danger tone.
    @Test func theCoversMenuOffersAnotherADrawnOneAndNone() {
        var picked = 0, drawn = 0, removed = 0
        let items = PublishStep.coverItems(canGenerate: false, pick: { picked += 1 }, generate: { drawn += 1 }, remove: { removed += 1 })
        #expect(items.map(\.title) == [L10n.Write.mediaReplace, L10n.Write.mediaGenerate, L10n.Write.mediaRemove])
        #expect(items.map(\.icon) == [.image, .sparkle, .trash])
        #expect(items.map(\.disabled) == [false, true, false])
        #expect(items.map(\.danger) == [false, false, true])
        items.forEach { $0.action() }
        #expect((picked, drawn, removed) == (1, 1, 1))
        #expect(PublishStep.coverItems(canGenerate: true, pick: {}, generate: {}, remove: {})[1].disabled == false)
    }

    @Test func theResonanceLineFollowsTheChoice() {
        let draft = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(reference: "original"))
        #expect(draft.resonanceLine == L10n.Write.PublishPanel.resonanceReaches)
        draft.choose(.private)
        #expect(draft.resonanceLine == L10n.Write.PublishPanel.resonanceQuiet)
        draft.choose(.anonymous)
        #expect(draft.resonanceLine == L10n.Write.PublishPanel.resonanceQuiet)
        // Not a resonance: no line.
        #expect(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card()).resonanceLine == nil)
        // A live resonance hidden from its original: said only when this save makes it public and named.
        let hidden = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                opened: card(published: true, visibility: "private", reference: "original"))
        #expect(hidden.resonanceLine == nil)
        hidden.choose(.public)
        #expect(hidden.resonanceLine == L10n.Write.PublishPanel.resonanceReaches)
        // One that reaches already (public, named, as readers have it now): nothing new to say.
        let reaching = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                  opened: card(published: true, reference: "original"))
        #expect(reaching.resonanceLine == nil)
        // Its pending edit hid it, yet readers still see it public: saving it public again says nothing new.
        let edited = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                opened: card(published: true, pending: true, visibility: "private", reference: "original",
                                             live: ("public", false)))
        edited.choose(.public)
        #expect(edited.resonanceLine == nil)
    }

    @Test func publishingSendsTheDraftAsItIsAndALiveCardSavesItsRevision() async {
        let store = RecordingDraftStore()
        let server = ServerCalls()
        let model = WriteModel(drafts: store, writing: writing(), calls: server.calls, opened: card())
        model.choose(.anonymous)
        #expect(await model.publish() == "a-walk")
        #expect(server.published == ["card-1"])
        #expect(store.writes.last?.values.visibility == "public")
        #expect(store.writes.last?.values.anonymous == true)
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
        #expect(live.publishError == L10n.Write.PublishPanel.saveFailed)
        #expect(live.step == .publish)
        // The words on screen are owed a save: leaving asks and writes them, a retry writes them again.
        #expect(live.needsSave)
        #expect(live.leaveQuestion == .revision)
        server.applyFound = true
        #expect(await live.applyEdit() == "a-walk")
        #expect(store.writes.map(\.kind) == [.edit, .edit])
        #expect(live.publishError == nil)
    }

    /// One button (round 8 §2.3): the only second one left is 捨棄修改, for a published card while it
    /// has a revision to drop — a draft's choices are its one button.
    @Test func theOnlySecondButtonIsDiscardingARevision() {
        let draft = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect(!PublishStep.showsSecondary(draft))
        draft.choose(.private)
        #expect(!PublishStep.showsSecondary(draft))
        let live = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card(published: true))
        #expect(!PublishStep.showsSecondary(live))
        #expect(PublishStep.showsSecondary(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                                      opened: card(published: true, pending: true))))
        #expect(PublishStep.showsSecondary(WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls,
                                                      opened: card(published: true, pending: true, visibility: "private"))))
        #expect(PublishStep.verbEnabled(live))
    }

    /// The gap a pull opens over a phone's leading band wears the band's own paper (round 8 §6.3): by the
    /// cover's hue — and with no cover, the card's own family from its id (round 9 §8).
    @Test func thePullGapWearsTheBandsPaper() {
        let model = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect(PublishStep.bandPalette(model).index == CardPalette.family(id: model.draftId ?? ""))
        model.values.accentHue = 215
        #expect(PublishStep.bandPalette(model).hue == CardPalette(accentHue: 215, position: 0).hue)
        #expect(PublishStep.bandPalette(model).hue == 215)
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
        model.choose(.anonymous)
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
        // The bar says nothing of its save state: the page's own line says it is in the trash.
        #expect(model.saveState == nil)
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

/// The save state the writer's bar says after its title (round 8 §2.1): nothing until the card's
/// first write in this visit; 儲存中⋯ only once a write has run 400 ms (a quick one goes straight to
/// its next word); 已儲存 after a draft's write, 修改已暫存 after a live card's — from the start when
/// it opens with a revision buffered —, 未儲存 when the last write was refused, until one goes through.
@MainActor @Suite struct WriterSaveStateTests {
    @Test func nothingIsSaidBeforeTheFirstWriteThenSavingOnlyOnceItRunsLong() async {
        let store = StuckDraftStore()
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls)
        #expect(model.saveState == nil)
        model.values.title = "A walk"
        model.store()
        // Under 400 ms: still nothing (no flicker).
        #expect(model.saveState == nil)
        #expect(await eventually { model.saveState == .saving })
        store.answer()
        #expect(await eventually { model.saveState == .saved })
        #expect(model.saveState?.label == L10n.Write.Status.saved)
        #expect(WriteModel.SaveState.saving.label == L10n.Write.Status.saving)
    }

    @Test func aQuickWriteGoesStraightToItsNextWord() async {
        let model = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: ServerCalls().calls, opened: card())
        #expect(model.saveState == nil)
        model.values.story += " More."
        model.store()
        #expect(await eventually { model.saveState == .saved })
        // Long past the 400 ms: the word never turned to 儲存中⋯.
        try? await Task.sleep(for: .milliseconds(500))
        #expect(model.saveState == .saved)
        #expect(!model.savingShown)
        // A pointer resting on it reads the time too (the web's tooltip): 已儲存 · 14:32.
        #expect(model.saveStateHelp?.hasPrefix(L10n.Write.Status.saved + " · ") == true)
        #expect(model.saveStateHelp != L10n.Write.Status.saved)
    }

    @Test func aLiveCardSaysItsRevisionIsKeptPrivately() async {
        let buffered = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: ServerCalls().calls,
                                  opened: card(published: true, pending: true))
        #expect(buffered.saveState == .savedLive)
        #expect(buffered.saveState?.label == L10n.Write.Status.savedLive)
        // Nothing written in this visit yet: the word alone, no time.
        #expect(buffered.saveStateHelp == L10n.Write.Status.savedLive)
        let live = WriteModel(drafts: RecordingDraftStore(), writing: writing(), calls: ServerCalls().calls, opened: card(published: true))
        #expect(live.saveState == nil)
        live.values.story += " Revised."
        live.store()
        #expect(await eventually { live.saveState == .savedLive })
    }

    @Test func aRefusedWriteSaysNotSavedUntilOneGoesThrough() async {
        let store = RecordingDraftStore()
        store.answers = [.failure(NSError(domain: "test", code: 1))]
        let model = WriteModel(drafts: store, writing: writing(), calls: ServerCalls().calls, opened: card())
        model.values.story += " Refused."
        model.store()
        #expect(await eventually { model.saveState == .failed })
        #expect(model.saveState?.label == L10n.Write.Status.failed)
        // The next pause tries again (what was refused is owed a write), and a write that goes through replaces it.
        #expect(model.needsSave)
        model.store()
        #expect(await eventually { model.saveState == .saved })
    }
}

/// Pictures say what went wrong where the picture is (round 8 §3): a cover's trouble on the
/// picture itself, until the next cover action; a story picture's in the writing step's toast —
/// never in the cover's place — 讀不出這張圖片 for one that can't be read, 圖片上傳失敗 for one the
/// upload refused.
@MainActor @Suite struct WriterPictureTests {
    private let photo: UIImage = UIGraphicsImageRenderer(size: CGSize(width: 8, height: 8)).image { context in
        UIColor.orange.setFill()
        context.fill(CGRect(x: 0, y: 0, width: 8, height: 8))
    }

    @Test func aStoryPicturesTroubleIsSaidInTheToastNeverInTheCoversPlace() async {
        let model = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card())
        var told: [String] = []
        model.tell = { told.append($0) }
        model.upload = { _, _ in throw URLError(.notConnectedToInternet) }
        await model.insertImage(photo, filename: "photo.jpg")
        #expect(told == [L10n.Write.Editor.imageUploadError])
        // One that can't be read says so too (it used to say nothing).
        await model.insertImage(nil, filename: "photo.jpg")
        #expect(told == [L10n.Write.Editor.imageUploadError, L10n.Write.Editor.imageUnsupported])
        #expect(model.mediaError == nil)
        #expect(!model.uploadingInline)
        // Uploaded, it goes into the story and nothing is said.
        model.upload = { _, _ in URL(string: "https://img.example.test/a.webp")! }
        await model.insertImage(photo, filename: "photo.jpg")
        #expect(told.count == 2)
    }

    @Test func aCoversTroubleStaysOnThePictureUntilTheNextCoverAction() async {
        let model = WriteModel(drafts: nil, writing: writing(), calls: ServerCalls().calls, opened: card())
        var told: [String] = []
        model.tell = { told.append($0) }
        model.upload = { _, _ in throw URLError(.timedOut) }
        await model.setCover(photo, filename: "cover.jpg")
        #expect(model.mediaError == L10n.Write.mediaUploadError)
        #expect(model.values.imageURL == nil)
        // Picking another clears it, as generating or removing does.
        model.clearCoverError()
        #expect(model.mediaError == nil)
        await model.setCover(nil, filename: "cover.jpg")
        #expect(model.mediaError == L10n.Write.Editor.imageUnsupported)
        model.removeCover()
        #expect(model.mediaError == nil)
        // A cover's trouble is never the toast's.
        #expect(told.isEmpty)
        model.upload = { _, _ in URL(string: "https://img.example.test/cover.webp")! }
        await model.setCover(photo, filename: "cover.jpg")
        #expect(model.values.imageURL?.absoluteString == "https://img.example.test/cover.webp")
        #expect(model.mediaError == nil)
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
