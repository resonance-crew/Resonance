import DesignSystem
import FirebaseFirestore
import Foundation
import Observation
import ResonanceAPI
import ResonanceKit
import UIKit

/// The writer's two steps (writer.spec): writing — the bare title and the story — then the publish
/// step in the same place, 發布這張卡片 (更新這張卡片 for a live card).
enum WriterStep: Equatable {
    case write, publish
}

/// What the writer asks of the server beyond its drafts, so a test can answer in its place:
/// publishing, putting a live card's revision in front of readers, the publish step's mirror, and
/// taking the card out of the trash.
struct WriterCalls {
    /// Publishes the draft (POST …/publish): where the card lives now (its slug, or its id).
    var publish: (String) async throws -> String
    /// Applies the pending edit (POST …/edits/apply): whether there was one to apply, and where the card
    /// lives (its slug, when the answer has it).
    var applyEdit: (String) async throws -> AppliedEdit
    /// The mirror moment for a title and story (/api/cards/insight), or nil.
    var insight: (String, String) async throws -> String?
    /// Out of the trash (POST …/restore): whether it came back on its own, no longer answering its original.
    var restore: (String) async throws -> Bool
    /// A card went out: the moment to ask whether notifications may show (`PushCenter.reachedOut`).
    var reachedOut: () -> Void

    /// What POST …/edits/apply came to: `applied` false when the card had no pending edit by then —
    /// applied or dropped elsewhere (the web, another device) since the writer last wrote it.
    struct AppliedEdit: Equatable {
        var applied: Bool
        var slug: String?
    }

    init(publish: @escaping (String) async throws -> String, applyEdit: @escaping (String) async throws -> AppliedEdit,
         insight: @escaping (String, String) async throws -> String?, restore: @escaping (String) async throws -> Bool,
         reachedOut: @escaping () -> Void = {}) {
        self.publish = publish
        self.applyEdit = applyEdit
        self.insight = insight
        self.restore = restore
        self.reachedOut = reachedOut
    }

    init(_ writing: WritingAPI) {
        self.init(publish: { id in
            let result = try await writing.publish(id)
            return result.slug ?? result.id
        }, applyEdit: { id in
            let result = try await writing.applyEdit(id)
            return AppliedEdit(applied: result.applied, slug: result.slug)
        }, insight: { title, story in
            try await writing.insight(title: title, story: story)
        }, restore: { id in
            try await writing.restoreCard(id).droppedResonance
        }, reachedOut: { PushCenter.shared.reachedOut() })
    }
}

/// The writing screen's state and its work (CardEditor): the draft's values,
/// autosave a moment after typing stops, the two steps and what moves between
/// them, AI tags, the cover photo, publishing. Opened on a published card it
/// revises instead: autosave buffers the working copy privately and the
/// publish step's one button applies it. Everything chosen in the publish step
/// (tags, the cover, the card's type) is the draft's own value and autosaves
/// like the words — going back to writing keeps it.
///
/// A card is shared (公開 · 匿名公開) or a 草稿 (round 8 §1): only its author sees it, finished or
/// not — a card never published, and a published card kept private, alike. Saving a 草稿 never
/// publishes it.
@MainActor @Observable
final class WriteModel {
    var values = DraftValues() {
        didSet {
            if values != oldValue { scheduleSave() }
            if values.title != oldValue.title {
                editor.setTitle(values.title)
                titleError = false
            }
        }
    }
    private(set) var draftId: String?
    private(set) var savedAt: Date?
    /// Something was written this visit (a draft or revision saved, published,
    /// applied or dropped): what the screens behind the writer read again for.
    private(set) var wrote = false
    /// Revising a published card (fixed for the model's lifetime, as on the web).
    let isPublished: Bool
    /// Readers have the card now: published and not kept private — a published private card is a
    /// 草稿 to everyone but its author (round 8 §1). Fixed for the model's lifetime: whatever this visit
    /// makes of it, the writer leaves once it is applied.
    let readersSee: Bool
    /// A revision is waiting in the buffer — only its author can see it.
    private(set) var hasPendingEdit: Bool
    /// The published card's slug (its page lives at slug ?? id).
    let slug: String?
    /// A live resonance that reaches its original already (published, public and named, as readers
    /// have it now): saving its revision tells no one anything new.
    let liveReaches: Bool
    /// The byline the card was opened with: what 草稿 keeps on a live card.
    private let openedAnonymous: Bool
    var tagDraft = ""
    private(set) var suggestingTags = false
    var tagError: String?
    private(set) var uploadingCover = false
    private(set) var uploadingInline = false
    private(set) var generating = false
    /// The illustration's in-progress pass while it renders.
    private(set) var partialPreview: UIImage?
    /// Why the last try at a cover didn't work (round 8 §3): said on the picture itself — under the
    /// empty picture's two pills, or on a paper chip over the cover that stays — until the next cover
    /// action. A picture in the story says its own trouble in the writing step (`tell`), never here.
    var mediaError: String?
    /// Says something in the app's toast (the screen hands over the shell's): why a picture in the
    /// story didn't go in, wherever the story is scrolled.
    @ObservationIgnored var tell: (String) -> Void = { _ in }

    /// Uploading or illustrating — the image surface waits either way.
    var mediaBusy: Bool { uploadingCover || generating }
    /// A picture is on its way, the cover's or the story's: the step's verb waits for it.
    var publishWaitsForMedia: Bool { mediaBusy || uploadingInline }
    /// The web's canGenerate: there is a story to draw from.
    var canGenerate: Bool { !values.story.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !mediaBusy }

    /// The card this one resonates with, if any (a response card).
    let referenceCardId: String?
    let editor: StoryEditorBridge

    // MARK: The steps

    /// Which step is on screen.
    var step: WriterStep = .write {
        didSet {
            guard step != oldValue else { return }
            if step == .publish { askInsight() } else { dropInsight() }
        }
    }
    /// ✓ found no title: the title asks for one (先寫下一句話標題) until it is typed in.
    var titleError = false
    /// ✓ is waiting on a new draft's first save (its glyph turns into the pen loop after a moment).
    private(set) var nextBusy = false
    private(set) var nextLoading = false
    /// ✓'s save didn't go through (沒存成，再試一次, over the title).
    var nextSaveError: String?
    /// The step's button, or 捨棄修改, is on its way: the step waits.
    private(set) var pending = false
    /// What `pending` is for: its button shows the loader, the other rests (`leave`: 捨棄修改).
    enum BusyVerb: Equatable { case publish, leave }
    private(set) var busyVerb: BusyVerb = .publish
    /// Why the last publish, save or discard didn't go through (above the step's foot).
    var publishError: String?

    // MARK: The trash

    /// The card went to the trash while open here (on another device, the web): nothing is written
    /// into it until it is restored; what is typed stays.
    private(set) var trashed = false
    private(set) var restoring = false
    var restoreError: String?
    /// A restored resonance came back on its own (no longer answering its original): said once.
    var restoredAlone = false

    // MARK: How the story is set

    /// The title's type: the story's script as the island sets it (an empty draft in the interface
    /// language's, changing only once the writing clearly leans the other way).
    private(set) var script: StoryScript

    @ObservationIgnored private let drafts: (any DraftStore)?
    @ObservationIgnored private let writing: WritingAPI
    @ObservationIgnored let calls: WriterCalls
    @ObservationIgnored private var saveTask: Task<Void, Never>?
    /// The server's answers to the writes handed over, awaited one after another (Firestore sends
    /// the writes themselves in the order they were made).
    @ObservationIgnored private var chain: Task<Void, Never>?
    /// What the last write the server confirmed stored ("Saved at …", and what publishing relies on).
    @ObservationIgnored private var lastSaved: DraftValues?
    /// What the last write handed to Firestore stores — on the device from that moment; an
    /// unchanged working copy isn't written again.
    @ObservationIgnored private var lastStored: DraftValues?
    /// Writes handed over that the server hasn't answered yet.
    @ObservationIgnored private var inFlight = 0
    /// Shows 儲存中⋯ once the write on its way has taken `savingShownAfter`.
    @ObservationIgnored private var savingClock: Task<Void, Never>?
    /// A write has been on its way for longer than `savingShownAfter` (the bar's 儲存中⋯).
    private(set) var savingShown = false
    /// The last write the server answered was refused: 未儲存 until one goes through (the next pause
    /// in the typing tries again).
    private(set) var saveFailed = false

    /// CardEditor's AUTOSAVE_DELAY_MS (leaving or going to the background saves at once).
    static let autosaveDelay: Duration = .milliseconds(1500)
    static let titleMax = 60
    /// From this many characters on, the title says how many it has (CharCount n / 60).
    static let titleCountFrom = 50
    /// How long ✓ waits on a new draft's first save before its glyph turns into the loader.
    static let nextLoaderDelay: Duration = .milliseconds(300)
    /// How long ✓ waits for the server to take a new draft (the draft is on the device either
    /// way: past this the step opens, and publishing waits for the network as it always has).
    static let nextWait: Duration = .seconds(3)
    /// How long a write runs before the bar says 儲存中⋯ (a quick one goes straight to its next word:
    /// no flicker) — the web's SAVING_SHOWN_MS.
    static let savingShownAfter: Duration = .milliseconds(400)
    /// How long 儲存 (a 草稿 kept a draft) waits for the server before the writer leaves all the same —
    /// the draft is on the device from the moment it is written, and goes up when the network lets it.
    static let keepWait: Duration = .seconds(2)

    init(drafts: (any DraftStore)?, writing: WritingAPI, calls: WriterCalls? = nil, referenceCardId: String? = nil,
         opened: DraftService.OpenedCard? = nil, locale: String = Strings.shared.language.rawValue,
         editor bridge: StoryEditorBridge? = nil) {
        self.drafts = drafts
        self.writing = writing
        self.calls = calls ?? WriterCalls(writing)
        upload = { data, filename in try await writing.upload(data, filename: filename) }
        self.referenceCardId = opened?.referenceCardId ?? referenceCardId
        isPublished = opened?.isPublished ?? false
        readersSee = opened?.readersSee ?? false
        hasPendingEdit = opened?.hasPendingEdit ?? false
        slug = opened?.slug
        liveReaches = (opened?.isPublished ?? false) && opened?.referenceCardId != nil
            && WriteModel.reaches(visibility: opened?.liveVisibility ?? "private", anonymous: opened?.liveAnonymous ?? true)
        openedAnonymous = opened?.values.anonymous ?? false
        title = Self.pageTitle(opened)
        script = ScriptRule.writerScript(current: ScriptRule.localeScript(locale), title: opened?.values.title ?? "",
                                         story: opened?.values.story ?? "")
        editor = bridge ?? StoryEditorBridge(placeholder: L10n.Write.storyPlaceholder, layout: .canvas, locale: locale)
        if let opened {
            draftId = opened.id
            values = opened.values
            lastSaved = opened.values
            lastStored = opened.values
            editor.setTitle(opened.values.title)
            editor.setMarkdown(opened.values.story)
        }
        editor.onChange = { [weak self] markdown in self?.values.story = markdown }
    }

    /// The card's page: slug, or id (a draft or a card without one).
    var routeKey: String? { slug ?? draftId }

    /// Whether going back would put something away: words, tags or a cover in a
    /// draft, or a published card's revision — kept in its buffer or still being
    /// typed. The writer asks first.
    var holdsWriting: Bool {
        isPublished ? hasPendingEdit || needsSave : !values.isEmpty
    }

    /// Typed since the last write stored anything (autosave is still a moment away).
    var needsSave: Bool {
        !(values.isEmpty && draftId == nil) && values != lastStored
    }

    /// What going back asks before the page goes, or nil to go at once.
    enum LeaveQuestion: Equatable {
        /// 「寫下的內容已經存成草稿…」: a draft, kept on the way out.
        case draft
        /// 「你的修改已經存起來了…」: a live card's revision, kept in its buffer.
        case revision
        /// The card is in the trash, where nothing is written until it is restored: what was typed
        /// since the last save it took would go with the page (「這張卡片在垃圾桶裡，還原後才會儲存」).
        case trashed
    }

    /// Whether — and how — leaving asks first: never saying writing is kept that the trash refuses.
    /// A card in the trash asks only for words it holds nowhere; everything else, as `holdsWriting`.
    var leaveQuestion: LeaveQuestion? {
        if trashed { return needsSave ? .trashed : nil }
        guard holdsWriting else { return nil }
        return isPublished ? .revision : .draft
    }

    /// What this visit changed, for the screens behind the writer; nil when it wrote nothing.
    var change: WriteLauncher.Change? {
        wrote ? WriteLauncher.Change(cardId: draftId, referenceCardId: referenceCardId) : nil
    }

    /// The island told how it sets the story now: the title follows.
    func scriptChanged(_ next: StoryScript) {
        if next != script { script = next }
    }

    // MARK: Autosave

    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(for: Self.autosaveDelay)
            guard !Task.isCancelled else { return }
            await self?.saveNow()
        }
    }

    /// Writes the draft now (creating it the first time there is something to
    /// keep) and waits for the server to confirm it; returns its id.
    @discardableResult
    func saveNow() async -> String? {
        store()
        await chain?.value
        return draftId
    }

    /// Hands the draft as it is now to Firestore — which keeps it on the device from this moment and
    /// sends it after any write before it — without waiting for the server (leaving, going to the
    /// background). Nothing new to keep, nothing is written (unless `force`d: 儲存修改 writes the
    /// buffer it applies); nor while the card is in the trash, where the rules refuse it (what is
    /// typed waits on screen for the restore).
    func store(force: Bool = false) {
        saveTask?.cancel()
        guard let drafts, force || needsSave, !trashed else { return }
        let v = values
        let write: IssuedWrite
        var created: String?
        if isPublished, let id = draftId {
            // A live card: the revision waits privately in its buffer.
            write = drafts.saveEdit(id, v)
            hasPendingEdit = true
        } else if let id = draftId {
            write = drafts.update(id, v)
        } else {
            let id = drafts.newDraftId()
            write = drafts.create(v, id: id, locale: Strings.shared.language.rawValue, referenceCardId: referenceCardId)
            draftId = id
            created = id
        }
        lastStored = v
        wrote = true
        began()
        let previous = chain
        chain = Task { [weak self] in
            await previous?.value
            do {
                try await write.acknowledged()
                self?.confirmed(v)
            } catch {
                await self?.refused(v, created: created, error: error)
            }
            self?.answered()
        }
    }

    /// A write is handed over: 儲存中⋯ once it has run `savingShownAfter` unanswered.
    private func began() {
        inFlight += 1
        guard savingClock == nil, !savingShown else { return }
        savingClock = Task { [weak self] in
            try? await Task.sleep(for: Self.savingShownAfter)
            guard !Task.isCancelled, let self else { return }
            savingClock = nil
            if inFlight > 0 { savingShown = true }
        }
    }

    /// A write handed over is answered (taken or refused); the last of them ends 儲存中⋯.
    private func answered() {
        inFlight = max(0, inFlight - 1)
        guard inFlight == 0 else { return }
        savingClock?.cancel()
        savingClock = nil
        savingShown = false
    }

    /// Waits at most `limit` for the server to confirm what was handed over (leaving: the draft is
    /// kept either way, and goes up when the network lets it). True when it did.
    func settled(within limit: Duration) async -> Bool {
        guard let chain else { return true }
        return await firstAnswer(within: limit) { await chain.value } != nil
    }

    private func confirmed(_ v: DraftValues) {
        lastSaved = v
        savedAt = Date()
        saveFailed = false
    }

    /// The server refused a write (kept in memory; the next edit, or leaving, tries again): what it
    /// held counts as unwritten — a draft it was to create has no document — and the bar says 未儲存.
    /// A refusal the card being in the trash would explain is looked into: if it is there, the
    /// writer says so.
    private func refused(_ v: DraftValues, created: String?, error: Error) async {
        if let created, draftId == created {
            draftId = nil
            lastSaved = nil
        }
        if lastStored == v { lastStored = lastSaved }
        saveFailed = true
        if created == nil { _ = await confirmTrashed(error) }
    }

    /// The save state as the writer's bar says it (round 8 §2.1).
    enum SaveState: Equatable {
        /// 儲存中⋯: a write on its way past `savingShownAfter`.
        case saving
        /// 已儲存: a draft's write went through.
        case saved
        /// 修改已暫存: a live card's revision is in its buffer (only its author sees it yet).
        case savedLive
        /// 未儲存: the last write was refused; the next pause tries again.
        case failed

        var label: String {
            switch self {
            case .saving: L10n.Write.Status.saving
            case .saved: L10n.Write.Status.saved
            case .savedLive: L10n.Write.Status.savedLive
            case .failed: L10n.Write.Status.failed
            }
        }
    }

    /// What the bar says after its title: nothing until the card's first write in this visit (a live
    /// card opened with a revision buffered says 修改已暫存 from the start), then the last write's
    /// word — 儲存中⋯ only while one runs long, so a quick write goes straight to the next word. A
    /// card in the trash says nothing here (its own line in the page does).
    var saveState: SaveState? {
        if trashed { return nil }
        if savingShown { return .saving }
        if saveFailed { return .failed }
        if isPublished { return savedAt != nil || hasPendingEdit ? .savedLive : nil }
        return savedAt != nil ? .saved : nil
    }

    /// What a pointer resting on the save state reads (the web's tooltip): the word with the last
    /// write's time, 已儲存 · 14:32 — the word alone before any write has gone through in this visit.
    var saveStateHelp: String? {
        guard let state = saveState else { return nil }
        guard state == .saved || state == .savedLive, let savedAt else { return state.label }
        let time = savedAt.formatted(Date.FormatStyle(date: .omitted, time: .shortened, locale: Strings.shared.locale))
        return L10n.Write.Status.at(status: state.label, time: time)
    }

    /// The page title, short at every size (round 8 §2.1): 新卡片 for a new card (kept after its first
    /// save in this visit), 編輯草稿 for a 草稿 (a draft, or a published card kept private), 編輯卡片
    /// for a card readers have.
    let title: String

    static func pageTitle(_ opened: DraftService.OpenedCard?) -> String {
        guard let opened else { return L10n.Write.title }
        return opened.readersSee ? L10n.Write.editPublishedTitle : L10n.Write.editTitle
    }

    // MARK: Step 1: the title, ✓

    /// Whether ✓ can be pressed: a draft once something is written on it (a live card always),
    /// and never while its card is in the trash (it isn't shown then).
    var canGoNext: Bool { (isPublished || !values.isEmpty) && !trashed }

    /// The title, as typed or pasted: one line — a typed Return means "on to the story" (answered
    /// true), a pasted line break is a space — and at most 60 characters.
    @discardableResult
    func typeTitle(_ text: String) -> Bool {
        let before = values.title
        guard text.contains(where: \.isNewline) else {
            values.title = String(text.prefix(Self.titleMax))
            return false
        }
        let joined = text.split(omittingEmptySubsequences: false, whereSeparator: \.isNewline).joined(separator: " ")
        // Return typed at the end (or anywhere): the title is what it was, without the break.
        if text.filter({ !$0.isNewline }) == before {
            values.title = before
            return true
        }
        values.title = String(joined.prefix(Self.titleMax))
        return false
    }

    /// Whether the title says how many characters it has (from 50 on, unless it is asking for one).
    var showsTitleCount: Bool { values.title.count >= Self.titleCountFrom && !titleError }

    /// ✓: a title is asked for first; a new draft is handed over (and the server's answer waited
    /// on a moment, so a refusal keeps the writer here) before the step opens; a kept one saves on
    /// its way. Answers whether the publish step opened.
    @discardableResult
    func goNext() async -> Bool {
        guard !nextBusy, !pending, !trashed else { return false }
        guard !values.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            titleError = true
            step = .write
            return false
        }
        nextSaveError = nil
        settleAudience()
        if draftId == nil {
            nextBusy = true
            let loader = Task { [weak self] in
                try? await Task.sleep(for: Self.nextLoaderDelay)
                guard !Task.isCancelled else { return }
                self?.nextLoading = true
            }
            defer {
                loader.cancel()
                nextLoading = false
                nextBusy = false
            }
            store()
            _ = await settled(within: Self.nextWait)
            guard draftId != nil else {
                nextSaveError = L10n.Native.saveError
                return false
            }
        } else {
            store()
        }
        guard !trashed else { return false }
        step = .publish
        return true
    }

    /// Back from the publish step (the bar's 繼續寫, the edge swipe): to writing — never while a
    /// publish is on its way. False while writing: nothing to step back to, the page's way out answers.
    @discardableResult
    func stepBack() -> Bool {
        guard step == .publish else { return false }
        if !pending { step = .write }
        return true
    }

    // MARK: Step 2: the card's type

    /// Who may read a card published with these choices: an anonymous card is public or its
    /// author's alone — never for connections, which would tell them who wrote it (the server
    /// refuses the pair), so a connections card made anonymous goes public.
    nonisolated static func visibility(_ visibility: String, anonymous: Bool) -> String {
        anonymous && visibility == "connections" ? "public" : visibility
    }

    /// Whether a card in this audience reaches the card it answers: public and under its author's name.
    nonisolated static func reaches(visibility: String, anonymous: Bool) -> Bool {
        visibility == "public" && !anonymous
    }

    /// 卡片類型, the step's one choice of what the card is (round 8 §2.2): shared under the author's
    /// pen name, shared with no name on it, or a 草稿 — the author's alone, finished or not. Anonymity
    /// is for being read by others, so it is a way of being shared, not a switch beside it.
    enum Audience: String, Equatable, CaseIterable {
        /// 公開: everyone, under the author's pen name.
        case `public`
        /// 匿名公開: everyone, under 匿名.
        case anonymous
        /// 草稿: the author alone (`private`).
        case `private`
    }

    /// The segment chosen: public and named, public and anonymous, or private under either byline —
    /// none for a card kept for connections only (older ones), which keeps its audience until one is.
    var audience: Audience? {
        switch values.visibility {
        case "public": values.anonymous ? .anonymous : .public
        case "private": .private
        default: nil
        }
    }

    /// A segment chosen: both fields in one change, so no write is ever anonymous and for connections
    /// only. 草稿 on a live card keeps the byline the card had (an anonymous card made a 草稿 and later
    /// shared again comes back anonymous, never suddenly under its author's name); a draft was never
    /// public, so 草稿 simply names it — nothing of 匿名公開 tried on the way is left.
    func choose(_ audience: Audience) {
        var next = values
        switch audience {
        case .public:
            next.visibility = "public"
            next.anonymous = false
        case .anonymous:
            next.visibility = "public"
            next.anonymous = true
        case .private:
            next.visibility = "private"
            next.anonymous = isPublished ? openedAnonymous : false
        }
        values = next
    }

    /// 草稿 is chosen: the step keeps the card its author's — saving it, never publishing it — and the
    /// writer leaves once it is kept, back where it came from (round 8 §2.3). A card kept for
    /// connections (none chosen) reads as shared.
    var keepsDraft: Bool { audience == .private }

    /// The step's one button (round 8 §2.3): for a card readers have, 儲存修改 — or 轉為草稿 while 草稿 is
    /// chosen; for a 草稿 (never published, or published and kept private), 發布 · 匿名發布 by the
    /// choice, or 儲存 to keep it one.
    var verbTitle: String {
        if readersSee { return keepsDraft ? L10n.Write.PublishPanel.makeDraft : L10n.Write.PublishPanel.update }
        switch audience {
        case .anonymous?: return L10n.Write.PublishPanel.publishAnonymously
        case .private?: return L10n.Write.PublishPanel.save
        case .public?, nil: return L10n.Write.PublishPanel.publish
        }
    }

    /// The step's heading (round 8 §2.3): 更新這張卡片 for a card readers have (whatever is chosen); else
    /// 儲存草稿 while 草稿 is chosen, 發布這張卡片 otherwise.
    var stepTitle: String {
        if readersSee { return L10n.Write.PublishPanel.updateTitle }
        return keepsDraft ? L10n.Write.PublishPanel.saveTitle : L10n.Write.PublishPanel.title
    }

    /// 更新這張卡片's hint (「按下之後，讀者看到的就會是這個版本…」) is about readers: said for a card they
    /// have now, while the choice keeps it theirs.
    var showsUpdateHint: Bool { readersSee && !keepsDraft }

    /// The button publishes — to readers, for the first time: a draft shared, or a published 草稿 made
    /// public again. What its failure says: 沒發布成功 for these, 沒儲存成功 for every other.
    var publishes: Bool { !readersSee && !keepsDraft }

    /// A card about to be first published keeps no audience the server refuses: a draft stored
    /// anonymous and for connections only (the rules let a draft hold the pair, and the builds before
    /// letters kept a web draft's audience beside their anonymous switch) goes public, as making it
    /// anonymous here would have — so the step shows 公開 chosen and 發布 is never a 400 whatever
    /// is retried. A live card already that way keeps both (the server lets it).
    private func settleAudience() {
        guard !isPublished else { return }
        let audience = Self.visibility(values.visibility, anonymous: values.anonymous)
        if audience != values.visibility { values.visibility = audience }
    }

    /// The line under the choices of a resonance: before it is first published, whether it will
    /// reach its original's author; a live one's, only when this save makes a hidden one public and
    /// named (it reaches its original then, as making it public would). Nil for every other card.
    var resonanceLine: String? {
        guard referenceCardId != nil else { return nil }
        let reaches = Self.reaches(visibility: values.visibility, anonymous: values.anonymous)
        if isPublished { return !liveReaches && reaches ? L10n.Write.PublishPanel.resonanceReaches : nil }
        return reaches ? L10n.Write.PublishPanel.resonanceReaches : L10n.Write.PublishPanel.resonanceQuiet
    }

    // MARK: Step 2: the mirror

    /// The mirror line's state: on its way, an answer to show, or nothing (the line collapses).
    enum Insight: Equatable {
        case loading
        case shown(String)
        case none
    }

    private(set) var insight: Insight?
    /// What the mirror answered for a text, kept for the writer's visit: coming back to the step with
    /// the same words asks nothing again.
    @ObservationIgnored private var reflection: (key: String, value: String?)?
    @ObservationIgnored private var insightTask: Task<Void, Never>?
    /// How many times the mirror was asked (a test's count of the `insight` budget spent).
    @ObservationIgnored private(set) var insightAsks = 0

    /// The step opened: the mirror is asked once per distinct title and story — never for a live
    /// card's revision (it belongs to first publication), never for an untitled draft.
    private func askInsight() {
        guard !isPublished else { return }
        let title = values.title, story = values.story
        guard !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return }
        let key = title + "\u{0}" + story
        if let reflection, reflection.key == key {
            insight = reflection.value.map(Insight.shown) ?? Insight.none
            return
        }
        insight = .loading
        insightTask?.cancel()
        insightAsks += 1
        let ask = calls.insight
        insightTask = Task { [weak self] in
            let answer = try? await ask(title, story)
            guard !Task.isCancelled, let self else { return }
            let value = answer.flatMap { $0.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? nil : $0 }
            reflection = (key, value)
            insight = value.map(Insight.shown) ?? Insight.none
        }
    }

    /// Leaving the step drops the question on its way (an answer that never came is asked again).
    private func dropInsight() {
        insightTask?.cancel()
        insightTask = nil
        if insight == .loading { insight = nil }
    }

    // MARK: Step 2: the preview

    /// The card as a list will show it, from what is on screen: the viewer's byline, or 匿名.
    func preview(me: Components.Schemas.Me?) -> StoryCardContent {
        let anonymous = values.anonymous
        let title = values.title
        return StoryCardContent(
            id: draftId ?? "new",
            title: title,
            excerpt: StoryProse.excerpt(StoryProse.plainText(values.story), max: 96),
            authorName: anonymous ? L10n.Write.PublishPanel.anonymousName : me?.handle ?? "",
            authorInitials: anonymous ? "·" : me?.initials ?? "?",
            authorImageURL: anonymous ? nil : me?.avatarUrl.flatMap(URL.init(string:)),
            avatarSeed: anonymous ? 217 : Double(seedFromString(me?.id ?? "")),
            readTime: L10n.App.readMinutes(count: ReadTime.minutes(values.story)),
            tags: Array(values.tags.prefix(4)),
            imageURL: values.imageURL,
            // With no cover the picture is the cover editor's: its two ways to one, not a label under them.
            imageLabel: values.imageURL == nil ? "" : values.imageLabel ?? String(title.prefix(24)),
            accentHue: values.accentHue,
            reason: nil
        )
    }

    // MARK: Tags

    /// Add what is in the field as a tag (Done, or the field's Add): trimmed, and not twice.
    func addTag() {
        let word = tagDraft
        tagDraft = ""
        values.tags = TagInput.merge(values.tags, [word])
    }

    /// The field's text as typed or pasted: a comma ends a tag (see ``TagInput``), the rest stays to be typed on.
    func typedTag(_ text: String) {
        let (words, rest) = TagInput.split(text)
        guard !words.isEmpty else { return }
        tagDraft = rest
        values.tags = TagInput.merge(values.tags, words)
    }

    func removeTag(_ tag: String) {
        values.tags.removeAll { $0 == tag }
    }

    /// Two or three from the model, informed by the author's past tags; new ones only.
    func suggestTags() async {
        guard !suggestingTags else { return }
        tagError = nil
        suggestingTags = true
        defer { suggestingTags = false }
        do {
            let suggested = try await writing.suggestTags(title: values.title, story: values.story, tags: values.tags)
            values.tags += suggested.filter { !values.tags.contains($0) }
        } catch {
            tagError = L10n.Write.tagsSuggestError
        }
    }

    // MARK: Images

    /// A cover action begins (another picture is being picked): the last one's trouble goes with it.
    func clearCoverError() {
        mediaError = nil
    }

    /// The cover: compressed here, uploaded, and its hue read from the local pixels. A picture that
    /// can't be read (nil) or made a JPEG says so on the picture, as a failed upload does.
    func setCover(_ image: UIImage?, filename: String) async {
        guard !mediaBusy else { return }
        guard let image, let data = CoverImage.jpeg(image) else {
            mediaError = L10n.Write.Editor.imageUnsupported
            return
        }
        mediaError = nil
        uploadingCover = true
        defer { uploadingCover = false }
        do {
            let url = try await upload(data, filename)
            values.imageURL = url
            values.imageLabel = filename
            values.accentHue = CoverImage.accentHue(image)
        } catch {
            mediaError = L10n.Write.mediaUploadError
        }
    }

    /// An illustration drawn from the story (/api/generate-image): its previews
    /// show as they arrive; the stored picture becomes the cover, its hue read
    /// from that picture (or, failing that, the last preview).
    func generateCover() async {
        guard canGenerate else { return }
        mediaError = nil
        generating = true
        defer {
            generating = false
            partialPreview = nil
        }
        var stored: URL?
        do {
            for try await event in writing.illustrate(story: values.story) {
                switch event {
                case let .partial(png): partialPreview = UIImage(data: png) ?? partialPreview
                case let .done(url): stored = url
                case .failed:
                    mediaError = L10n.Write.mediaGenerateError
                    return
                }
            }
        } catch {
            mediaError = L10n.Write.mediaGenerateError
            return
        }
        guard let stored else {
            mediaError = L10n.Write.mediaGenerateError
            return
        }
        let preview = partialPreview
        let picture = try? await URLSession.shared.data(from: stored).0
        values.imageURL = stored
        values.imageLabel = L10n.Write.mediaGeneratedLabel
        values.accentHue = (picture.flatMap(UIImage.init(data:)) ?? preview).flatMap(CoverImage.accentHue)
    }

    func removeCover() {
        mediaError = nil
        values.imageURL = nil
        values.imageLabel = nil
        values.accentHue = nil
    }

    /// A photo inside the story (the format bar's 插入圖片). Its trouble is said in the writing step,
    /// in the app's toast (round 8 §3) — never in the cover's place: one that can't be read (nil) or
    /// made a JPEG is 讀不出這張圖片, one the upload refused 圖片上傳失敗.
    func insertImage(_ image: UIImage?, filename: String) async {
        guard !uploadingInline else { return }
        guard let image, let data = CoverImage.jpeg(image) else {
            tell(L10n.Write.Editor.imageUnsupported)
            return
        }
        uploadingInline = true
        defer { uploadingInline = false }
        if let url = try? await upload(data, filename) {
            editor.exec("insertImage", ["src": url.absoluteString, "alt": filename])
        } else {
            tell(L10n.Write.Editor.imageUploadError)
        }
    }

    /// Uploads a picture (/api/upload) and answers its address: the writing API's, or a test's stand-in.
    @ObservationIgnored var upload: (Data, String) async throws -> URL

    // MARK: Step 2: the one button, and 捨棄修改

    /// Where the writer goes once the step's button has done its work: the card's page while it is
    /// shared, or back where it came from once it is a 草稿.
    enum Finish: Equatable {
        case card(String)
        case leave
    }

    /// The step's one button (round 8 §2.3), by the card and the choice: a draft shared is published
    /// (發布 · 匿名發布 → its page); a draft kept a 草稿 is saved and left (儲存 — never the publish call);
    /// a published card's revision is applied — then to its page while it is shared (儲存修改, or a
    /// published 草稿's 發布 · 匿名發布), back where the writer came from once it is a 草稿 (轉為草稿 ·
    /// 儲存). Nil when it didn't go (`publishError` says why, or the card turned out to be in the trash).
    func submit() async -> Finish? {
        if isPublished {
            guard let key = await applyEdit() else { return nil }
            return keepsDraft ? .leave : .card(key)
        }
        if keepsDraft { return await keepDraft() ? .leave : nil }
        return await publish().map(Finish.card)
    }

    /// 儲存 for a draft kept a 草稿: what is on screen is written now (not left to the pause in the
    /// typing) — never published, a draft is its author's alone — and the writer may leave once the
    /// server has it, or once `keepWait` has passed (it is on the device from the moment it is
    /// written, and goes up when the network lets it). A write the server refused keeps the writer
    /// here, saying so; one the trash explains is the writer's trashed notice. True when it may leave.
    func keepDraft() async -> Bool {
        guard !pending else { return false }
        guard !values.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            titleError = true
            step = .write
            return false
        }
        busyVerb = .publish
        pending = true
        publishError = nil
        defer { pending = false }
        store()
        // Not answered yet (offline, a slow network): kept on the device all the same.
        guard await settled(within: Self.keepWait) else { return true }
        if trashed { return false }
        guard draftId != nil, values == lastSaved else {
            publishError = L10n.Write.PublishPanel.saveFailed
            return false
        }
        return true
    }

    /// 發布: the draft as it is (with the step's choices, already its own) is saved, then
    /// published; answers where the card lives — nil when it didn't go (`publishError` says why, or
    /// the card turned out to be in the trash).
    func publish() async -> String? {
        guard !pending else { return nil }
        // The server refuses a card without a title; say so in the writer's words, where the title is.
        guard !values.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            titleError = true
            step = .write
            return nil
        }
        settleAudience()
        busyVerb = .publish
        pending = true
        publishError = nil
        defer { pending = false }
        do {
            guard let id = await saveNow() else { throw APIFailure(code: "invalid_request", message: "Nothing to publish.", status: nil) }
            let key = try await calls.publish(id)
            wrote = true
            calls.reachedOut()
            return key
        } catch {
            if await confirmTrashed(error) { return nil }
            publishError = PublishFailure.message(error, publishing: true)
            return nil
        }
    }

    /// A published card's revision: the working copy goes into the buffer, then the server makes it
    /// the card — the moment an edit reaches readers (儲存修改; a published 草稿's 發布), or the card is
    /// kept to its author (轉為草稿; a published 草稿's 儲存). The publish date stays. Answers where the
    /// card lives, or nil. The buffer is written first even when nothing changed since the last save:
    /// another device may have applied or dropped it meanwhile, and the server applies only what is
    /// there — an answer that there was nothing (`applied` false) is a save that didn't happen, never
    /// a finish.
    func applyEdit() async -> String? {
        guard !pending, let id = draftId else { return nil }
        guard !values.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
            titleError = true
            step = .write
            return nil
        }
        busyVerb = .publish
        pending = true
        publishError = nil
        defer { pending = false }
        do {
            // Only the server's yes to this very write counts as the buffer holding what is on screen.
            lastSaved = nil
            store(force: true)
            await chain?.value
            if values != lastSaved { throw APIFailure(code: "internal", message: L10n.Native.saveError, status: nil) }
            let result = try await calls.applyEdit(id)
            guard result.applied else {
                // The buffer was gone by then (applied or dropped elsewhere): the words on screen may not be
                // live and are kept nowhere — owed a save again, so a retry or leaving writes them.
                lastSaved = nil
                lastStored = nil
                savedAt = nil
                hasPendingEdit = false
                publishError = PublishFailure.retry(publishing: publishes)
                return nil
            }
            wrote = true
            hasPendingEdit = false
            return result.slug ?? slug ?? id
        } catch {
            // The buffer's write was refused for the trash: the writer says so already.
            if trashed { return nil }
            if await confirmTrashed(error) { return nil }
            publishError = PublishFailure.message(error, publishing: publishes)
            return nil
        }
    }

    /// 捨棄修改: the buffer goes; the live card was never touched. Answers where the card lives, or nil.
    func discardEdit() async -> String? {
        guard !pending, let id = draftId, let drafts else { return nil }
        busyVerb = .leave
        pending = true
        publishError = nil
        defer { pending = false }
        saveTask?.cancel()
        // Behind any autosave in flight, so a straggling write can't re-create the buffer.
        await chain?.value
        do {
            try await drafts.discardEdit(id)
        } catch {
            publishError = L10n.Safety.actionError
            return nil
        }
        wrote = true
        hasPendingEdit = false
        lastSaved = values
        lastStored = values
        return slug ?? id
    }

    // MARK: The trash

    /// Whether a refusal is one the card being in the trash would explain: the rules' (a write) or the
    /// server's 409 'This card is in the trash.'.
    nonisolated static func mayBeTrashed(_ error: Error) -> Bool {
        isTrashRefusal(error) || FirestoreFailure.isRefused(error)
    }

    /// The server's answer for a card in the trash.
    nonisolated static func isTrashRefusal(_ error: Error) -> Bool {
        guard let failure = error as? APIFailure else { return false }
        return (failure.status == 409 || failure.code == "conflict") && failure.message.localizedCaseInsensitiveContains("trash")
    }

    /// A save, a publish or an apply was refused in a way the trash would explain: the card is read
    /// again, and if it is there the writer says so (with 還原), back on the writing step, keeping
    /// everything typed. True when it is.
    func confirmTrashed(_ error: Error) async -> Bool {
        guard let id = draftId, Self.mayBeTrashed(error) else { return false }
        if let drafts {
            do {
                guard try await drafts.isTrashed(id) else { return false }
            } catch {
                // Not read: a 409 from the server is answer enough.
                guard Self.isTrashRefusal(error) else { return false }
            }
        } else if !Self.isTrashRefusal(error) {
            return false
        }
        trashed = true
        restoreError = nil
        publishError = nil
        nextSaveError = nil
        step = .write
        return true
    }

    /// Out of the trash, as it was: what was typed meanwhile is written at once.
    func restore() async {
        guard let id = draftId, !restoring else { return }
        restoring = true
        restoreError = nil
        defer { restoring = false }
        do {
            restoredAlone = try await calls.restore(id)
        } catch {
            restoreError = L10n.Safety.actionError
            return
        }
        trashed = false
        wrote = true
        store()
    }
}

extension FirestoreFailure {
    /// The rules said no (a write into a card the writer may no longer change: one in the trash).
    nonisolated static func isRefused(_ error: Error) -> Bool {
        let e = error as NSError
        return e.domain == FirestoreErrorDomain && e.code == FirestoreErrorCode.permissionDenied.rawValue
    }
}

/// How long a story takes to read, in whole minutes (at least 1) — lib/readTime: CJK by the
/// character (320 a minute), the rest by the word (230 a minute), added up; marks standing alone
/// (……, ——, Markdown's ## and -) count as characters, as they always did.
nonisolated enum ReadTime {
    static let cjkPerMinute = 320.0
    static let wordsPerMinute = 230.0
    private static let cjk = #"\p{scx=Han}\p{scx=Hira}\p{scx=Kana}\p{scx=Hang}\p{scx=Bopo}\x{3000}-\x{303F}\x{FF00}-\x{FFEF}"#
    private static let run = try! NSRegularExpression(pattern: "([\(cjk)]+)|[^\\s\(cjk)]+")
    private static let wordlike = try! NSRegularExpression(pattern: #"[\p{L}\p{N}]"#)

    static func minutes(_ text: String) -> Int {
        let ns = text as NSString
        var chars = 0
        var words = 0
        for match in run.matches(in: text, range: NSRange(location: 0, length: ns.length)) {
            let piece = ns.substring(with: match.range)
            if match.range(at: 1).location != NSNotFound {
                chars += piece.utf16.count
            } else if wordlike.firstMatch(in: piece, range: NSRange(location: 0, length: (piece as NSString).length)) != nil {
                words += 1
            } else {
                chars += piece.utf16.count
            }
        }
        return max(1, Int((Double(chars) / cjkPerMinute + Double(words) / wordsPerMinute).rounded()))
    }
}

/// `work`'s answer if it comes within `limit`, else nil — `work` carries on unawaited either way
/// (a write the server hasn't answered, a read stuck on the network).
func firstAnswer<T: Sendable>(within limit: Duration, _ work: @escaping () async -> T) async -> T? {
    let once = AnswerOnce()
    return await withCheckedContinuation { (finish: CheckedContinuation<T?, Never>) in
        Task {
            let value = await work()
            guard !once.done else { return }
            once.done = true
            finish.resume(returning: value)
        }
        Task {
            try? await Task.sleep(for: limit)
            guard !once.done else { return }
            once.done = true
            finish.resume(returning: nil)
        }
    }
}

/// Whether ``firstAnswer(within:_:)`` has answered (both of its tasks run on the main actor).
private final class AnswerOnce { var done = false }
