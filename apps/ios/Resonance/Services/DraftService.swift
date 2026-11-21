import DesignSystem
import FirebaseFirestore
import Foundation
import ResonanceKit

/// A draft's editable fields — CardEditor's DraftValues.
struct DraftValues: Equatable {
    var title = ""
    var story = ""
    var tags: [String] = []
    var visibility = "public"
    var anonymous = false
    /// The cover: its public URL and label (media {type: image} on the web).
    var imageURL: URL?
    var imageLabel: String?
    /// Where the cover is looked at (`media.frame`, round 25 §G1): nil, its centre. It rides inside `media`, so a
    /// changed or removed picture takes it with it.
    var imageFrame: CoverFraming?
    /// The cover's hue snapped to the card palette; nil keeps the position colour.
    var accentHue: Double?

    /// Nothing written yet — autosave doesn't create a document for it (isEmptyDraft).
    var isEmpty: Bool { title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && story.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && tags.isEmpty && imageURL == nil }
}

/// A write Firestore has taken: in its local cache — kept on the device, and queued for the server
/// in the order it was made — from the moment it exists. `acknowledged()` waits for the server's
/// answer (as long as the network takes: a stuck connection never answers), and may be awaited
/// any number of times.
struct IssuedWrite {
    let answer: Task<Void, Error>

    func acknowledged() async throws { try await answer.value }
}

/// What the writer needs of the draft store (DraftService; a stand-in in tests): each write is
/// handed over at once and answered later, so leaving never waits on the network to keep a draft.
protocol DraftStore {
    /// The id a new draft will have (Firestore makes ids on the device).
    func newDraftId() -> String
    func create(_ v: DraftValues, id: String, locale: String, referenceCardId: String?) -> IssuedWrite
    func update(_ id: String, _ v: DraftValues) -> IssuedWrite
    func saveEdit(_ id: String, _ v: DraftValues) -> IssuedWrite
    func discardEdit(_ id: String) async throws
    /// Whether the card is in the trash now (read again when a save was refused).
    func isTrashed(_ id: String) async throws -> Bool
    /// Deletes a draft never published (the rules let its author delete a draft, never a published card):
    /// a card the writer began and left empty (round 9 §1).
    func deleteDraft(_ id: String) async throws
    /// Everything handed over goes now, past any pause after a failure (publishing, applying, discarding wait
    /// on it: the API path's outbox; Firestore sends on its own).
    func sendNow()
}

extension DraftStore {
    func isTrashed(_ id: String) async throws -> Bool { false }
    func deleteDraft(_ id: String) async throws {}
    func sendNow() {}
}

/// Drafts. With `features.apiDrafts` (Phase 2 of the middleware decouple) through `/api/v1`, as the web's
/// client/cards.ts and cardEdits.ts: a draft made under the id made here (POST /cards), its saves and a published
/// card's working copy through the account's `DraftOutbox` (PATCH …/draft, PUT …/edits/current, by `rev`, kept on
/// the device until the server has them), opened from GET /cards/{id} and …/edits/current with whatever the outbox
/// still holds laid over. Otherwise written straight to Firestore (createCardDraft, updateCardDraft) — the author's
/// own documents under the same rules — the older path kept one release. Publishing is the server's either way
/// (WritingAPI.publish), since it reaches other people; so are a card's visibility and deleting it from its ⋯
/// (WritingAPI.updateCard / deleteCard), which leave the site's cached pages stale unless the server refreshes them.
struct DraftService: DraftStore {
    let uid: String
    /// The `/api/v1` path; nil: Firestore.
    var outbox: DraftOutbox? = nil
    var api: DraftsAPI? = nil
    var reading: ReadingAPI? = nil
    var writing: WritingAPI? = nil
    private var db: Firestore { FirebaseBootstrap.db }

    init(uid: String) {
        self.uid = uid
    }

    /// The `/api/v1` path's service.
    init(uid: String, outbox: DraftOutbox, api: DraftsAPI, reading: ReadingAPI, writing: WritingAPI) {
        self.uid = uid
        self.outbox = outbox
        self.api = api
        self.reading = reading
        self.writing = writing
    }

    /// Which path this service takes.
    var usesAPI: Bool { outbox != nil && api != nil }

    private func fields(_ v: DraftValues) -> [String: Any] {
        [
            "thoughtCore": v.title,
            "story": v.story,
            "tags": v.tags,
            "visibility": v.visibility,
            "anonymous": v.anonymous,
        ]
    }

    private func media(_ v: DraftValues) -> [String: Any]? {
        Self.media(v)
    }

    /// `media` as the card or draft stores it: the picture, its label and — once it was framed — its frame.
    nonisolated static func media(_ v: DraftValues) -> [String: Any]? {
        guard let url = v.imageURL else { return nil }
        var media: [String: Any] = ["type": "image", "url": url.absoluteString, "label": v.imageLabel ?? ""]
        if let frame = v.imageFrame, frame.isValid { media["frame"] = CoverFrames.fields(frame) }
        return media
    }

    func newDraftId() -> String { usesAPI ? Self.newId() : db.collection("cards").document().documentID }

    /// An id made on the device as Firestore makes them (20 letters and digits, the contract's `CreateDraftRequest.id`).
    nonisolated static func newId() -> String {
        let alphabet = Array("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789")
        var random = SystemRandomNumberGenerator()
        return String((0..<20).map { _ in alphabet[Int(random.next(upperBound: UInt(alphabet.count)))] })
    }

    func sendNow() { outbox?.sendNow() }

    // MARK: The API path's bodies

    nonisolated static func wireMedia(_ v: DraftValues) -> DraftsAPI.Media? {
        guard let url = v.imageURL else { return nil }
        let frame = v.imageFrame.flatMap { $0.isValid ? $0 : nil }
            .map { DraftsAPI.Media.FramePayload(value1: .init(cx: $0.cx, cy: $0.cy, zoom: $0.zoom, ar: $0.ar)) }
        return DraftsAPI.Media(_type: .image, url: url.absoluteString, label: v.imageLabel ?? "", frame: frame)
    }

    /// POST /cards: the draft as it is now, under `id`.
    nonisolated static func createBody(_ v: DraftValues, id: String, locale: String, referenceCardId: String?) -> DraftsAPI.Create {
        DraftsAPI.Create(id: id, thoughtCore: v.title, story: v.story, tags: v.tags,
                         visibility: .init(rawValue: v.visibility) ?? ._private, originalLocale: locale,
                         media: wireMedia(v).map { .init(value1: $0) }, accentHue: v.accentHue,
                         referenceCardId: referenceCardId, anonymous: v.anonymous)
    }

    /// PATCH …/draft: every field as it is now — a removed cover and hue cleared (its `rev` is the outbox's).
    nonisolated static func patchBody(_ v: DraftValues) -> DraftsAPI.Patch {
        let media = wireMedia(v)
        var clear: [DraftsAPI.Patch.ClearPayloadPayload] = []
        if media == nil { clear.append(.media) }
        if v.accentHue == nil { clear.append(.accentHue) }
        return DraftsAPI.Patch(rev: 1, thoughtCore: v.title, story: v.story, tags: v.tags,
                               visibility: .init(rawValue: v.visibility) ?? ._private, anonymous: v.anonymous,
                               media: media.map { .init(value1: $0) }, accentHue: v.accentHue, clear: clear.isEmpty ? nil : clear)
    }

    /// PUT …/edits/current: the whole working copy (its `rev` is the outbox's).
    nonisolated static func editBody(_ v: DraftValues) -> DraftsAPI.Edit {
        DraftsAPI.Edit(rev: 1, thoughtCore: v.title, story: v.story, tags: v.tags,
                       visibility: .init(rawValue: v.visibility) ?? ._private, anonymous: v.anonymous,
                       media: wireMedia(v).map { .init(value1: $0) }, accentHue: v.accentHue)
    }

    /// What a write waiting in the outbox holds, as the writer's fields.
    nonisolated static func values(_ write: OutboxWrite) -> DraftValues? {
        func media(_ m: DraftsAPI.Media?) -> (URL?, String?, CoverFraming?) {
            guard let m else { return (nil, nil, nil) }
            return (URL(string: m.url), m.label, m.frame?.value1.framing)
        }
        if let c = write.create {
            let (url, label, frame) = media(c.media?.value1)
            return DraftValues(title: c.thoughtCore, story: c.story, tags: c.tags, visibility: c.visibility.rawValue,
                               anonymous: c.anonymous ?? false, imageURL: url, imageLabel: label, imageFrame: frame, accentHue: c.accentHue)
        }
        if let p = write.patch {
            let (url, label, frame) = media(p.media?.value1)
            return DraftValues(title: p.thoughtCore ?? "", story: p.story ?? "", tags: p.tags ?? [], visibility: p.visibility?.rawValue ?? "public",
                               anonymous: p.anonymous ?? false, imageURL: url, imageLabel: label, imageFrame: frame, accentHue: p.accentHue)
        }
        if let e = write.edit {
            let (url, label, frame) = media(e.media?.value1)
            return DraftValues(title: e.thoughtCore, story: e.story, tags: e.tags, visibility: e.visibility.rawValue,
                               anonymous: e.anonymous, imageURL: url, imageLabel: label, imageFrame: frame, accentHue: e.accentHue)
        }
        return nil
    }

    /// createCardDraft: a new, unpublished card with zeroed counters, under `id` (``newDraftId()``).
    func create(_ v: DraftValues, id: String, locale: String, referenceCardId: String?) -> IssuedWrite {
        if let outbox, usesAPI {
            return outbox.enqueue(OutboxWrite(uid: uid, cardId: id, kind: .create,
                                              create: Self.createBody(v, id: id, locale: locale, referenceCardId: referenceCardId)))
        }
        var data = fields(v)
        if let media = media(v) { data["media"] = media }
        if let hue = v.accentHue { data["accentHue"] = hue }
        if let referenceCardId { data["referenceCardId"] = referenceCardId }
        data["authorId"] = uid
        data["originalLocale"] = locale
        data["translations"] = [String: Any]()
        data["publishedAt"] = NSNull()
        data["readCount"] = 0
        data["resonanceCount"] = 0
        data["inviteCount"] = 0
        data["createdAt"] = FieldValue.serverTimestamp()
        data["updatedAt"] = FieldValue.serverTimestamp()
        return send(db.collection("cards").document(id), data, merge: false)
    }

    /// updateCardDraft: the fields as they are now (a removed cover clears media and its hue).
    func update(_ id: String, _ v: DraftValues) -> IssuedWrite {
        if let outbox, usesAPI {
            return outbox.enqueue(OutboxWrite(uid: uid, cardId: id, kind: .draft, patch: Self.patchBody(v)))
        }
        var data = fields(v)
        data["media"] = media(v) ?? FieldValue.delete()
        data["accentHue"] = v.accentHue ?? NSNull()
        data["updatedAt"] = FieldValue.serverTimestamp()
        return send(db.collection("cards").document(id), data, merge: true)
    }

    // MARK: Opening a card to edit

    /// A card of yours as the editor opens it (write/[id]/page.tsx): a draft
    /// with its own fields, or a published card with its pending edit when
    /// there is one — buffered edits win over the live fields.
    struct OpenedCard {
        let id: String
        var values: DraftValues
        let isPublished: Bool
        let slug: String?
        let referenceCardId: String?
        let hasPendingEdit: Bool
        /// When it went to the trash, if it is there: the writer says so and writes nothing into it
        /// until it is restored (trash.spec §5.5).
        var trashedAt: Date? = nil
        /// A live card's audience as readers have it now (the copy being edited may be a pending
        /// edit's): whether saving makes a resonance reach its original.
        var liveVisibility: String? = nil
        var liveAnonymous: Bool? = nil
        /// In the trash: the audience a restore gives it back (`trashedFrom.visibility`; the trash
        /// keeps it private meanwhile).
        var restoresTo: String? = nil
        /// The story's link previews the server keeps on a live card (`linkPreviews`): the writer's link cards
        /// show their titles and pictures (round 16 §6).
        var linkPreviews: [StoryEditorBridge.HostLinkPreview] = []
        /// Where it lives once published: the slug, or the id.
        var routeKey: String { slug ?? id }

        /// Readers have it (round 8 §1): published and not kept private — a published private card is
        /// a 草稿, as one never published is. One in the trash, as its restore would leave it.
        var readersSee: Bool {
            isPublished && (trashedAt == nil ? liveVisibility ?? "public" : restoresTo ?? "private") != "private"
        }
    }

    /// Your card by id, or nil when it is missing or someone else's (rules deny → nil) — or in the
    /// trash past its 30 days (gone to its owner too). The pending edit is asked for beside the card,
    /// not after it (a draft has none: that read finds nothing, and is left unused).
    func open(_ id: String) async throws -> OpenedCard? {
        if let reading, let api, usesAPI { return await openThroughAPI(id, reading: reading, api: api) }
        let ref = db.collection("cards").document(id)
        let edit = editRef(id)
        async let pending = try? edit.getDocument()
        guard let card = try? await ref.getDocument(), let data = card.data(), data["authorId"] as? String == uid else { return nil }
        let buffered = data["publishedAt"] is Timestamp ? await pending?.data() : nil
        return Self.opened(id: id, data: data, buffered: buffered)
    }

    /// The API path's `open`: the card as its owner reads it and its pending edit, asked for side by side, with the
    /// newest state the outbox still holds for it laid over (words saved here the server doesn't have yet — offline,
    /// or before a relaunch — are the ones the writer shows, as Firestore's cache showed them).
    private func openThroughAPI(_ id: String, reading: ReadingAPI, api: DraftsAPI) async -> OpenedCard? {
        async let pending = try? api.pendingEdit(id)
        guard let detail = try? await reading.card(id), detail.isOwner else { return nil }
        let buffered = detail.card.publishedAt != nil ? await pending ?? nil : nil
        return Self.opened(id: id, detail: detail, buffered: buffered, waiting: outbox?.newest(id))
    }

    /// A card as GET /cards/{id} answers its owner (and its pending edit, and what waits in the outbox) as the writer
    /// opens it; nil for one in the trash past its 30 days.
    static func opened(id: String, detail: CardDetail, buffered: DraftsAPI.PendingEdit?, waiting: OutboxWrite?,
                       now: Date = .now) -> OpenedCard? {
        let card = detail.card
        let isPublished = card.publishedAt != nil
        let trashedAt = card.trashedAt.flatMap(ISO8601.date)
        if let trashedAt, CardTrash.purgeAt(trashedAt: trashedAt) <= now { return nil }
        var values = DraftValues(title: card.title, story: detail.story, tags: card.tags, visibility: detail.visibility.rawValue,
                                 anonymous: detail.anonymous, imageURL: card.imageUrl.flatMap(URL.init(string:)),
                                 imageLabel: card.imageLabel, imageFrame: card.coverFraming, accentHue: card.accentHue)
        var hasPendingEdit = false
        if isPublished, let e = buffered {
            hasPendingEdit = true
            values = DraftValues(title: e.thoughtCore, story: e.story, tags: e.tags, visibility: e.visibility.rawValue,
                                 anonymous: e.anonymous, imageURL: (e.media?.value1.url).flatMap(URL.init(string:)),
                                 imageLabel: e.media?.value1.label, imageFrame: e.media?.value1.frame?.value1.framing,
                                 accentHue: e.accentHue)
        }
        // Waiting to be sent: a working copy only matters to a published card, a draft's state only to a draft.
        if let waiting, isPublished == (waiting.kind == .edit),
           let newer = Self.values(waiting) {
            values = newer
            if isPublished { hasPendingEdit = true }
        }
        return OpenedCard(id: id, values: values, isPublished: isPublished, slug: card.slug,
                          referenceCardId: card.referenceCardId, hasPendingEdit: hasPendingEdit, trashedAt: trashedAt,
                          liveVisibility: detail.visibility.rawValue, liveAnonymous: detail.anonymous,
                          restoresTo: card.restoresTo?.rawValue,
                          linkPreviews: (detail.linkPreviews ?? []).compactMap { p in
                              guard !p.url.isEmpty, !p.title.isEmpty else { return nil }
                              return StoryEditorBridge.HostLinkPreview(url: p.url, title: p.title, image: p.image)
                          })
    }

    /// A card's document (and its pending edit's) as the writer opens it; nil for one in the trash past its 30 days.
    static func opened(id: String, data: [String: Any], buffered: [String: Any]?, now: Date = .now) -> OpenedCard? {
        let isPublished = data["publishedAt"] is Timestamp
        let trashedAt = (data["trashedAt"] as? Timestamp)?.dateValue()
        if let trashedAt, CardTrash.purgeAt(trashedAt: trashedAt) <= now { return nil }
        let pending = isPublished ? buffered : nil
        return OpenedCard(id: id, values: values(pending ?? data), isPublished: isPublished, slug: data["slug"] as? String,
                          referenceCardId: data["referenceCardId"] as? String, hasPendingEdit: pending != nil,
                          trashedAt: trashedAt, liveVisibility: data["visibility"] as? String ?? "public",
                          liveAnonymous: data["anonymous"] as? Bool ?? false,
                          restoresTo: (data["trashedFrom"] as? [String: Any])?["visibility"] as? String,
                          linkPreviews: linkPreviews(data["linkPreviews"]))
    }

    /// A card's stored `linkPreviews` (`[{ url, title, image? }]`), each with an address and a title.
    static func linkPreviews(_ value: Any?) -> [StoryEditorBridge.HostLinkPreview] {
        (value as? [Any] ?? []).compactMap { item in
            guard let entry = item as? [String: Any], let url = entry["url"] as? String, let title = entry["title"] as? String, !url.isEmpty, !title.isEmpty else { return nil }
            return StoryEditorBridge.HostLinkPreview(url: url, title: title, image: entry["image"] as? String)
        }
    }

    /// Whether your card is in the trash now (`trashedAt`, written by the server alone).
    func isTrashed(_ id: String) async throws -> Bool {
        if let reading, usesAPI { return try await reading.card(id).card.trashedAt != nil }
        let snap = try await db.collection("cards").document(id).getDocument(source: .server)
        return snap.get("trashedAt") is Timestamp
    }

    private static func values(_ d: [String: Any]) -> DraftValues {
        let media = d["media"] as? [String: Any]
        return DraftValues(
            title: d["thoughtCore"] as? String ?? "",
            story: d["story"] as? String ?? "",
            tags: d["tags"] as? [String] ?? [],
            visibility: d["visibility"] as? String ?? "public",
            anonymous: d["anonymous"] as? Bool ?? false,
            imageURL: (media?["url"] as? String).flatMap(URL.init(string:)),
            imageLabel: media?["label"] as? String,
            imageFrame: CoverFrames.of(media: media),
            accentHue: (d["accentHue"] as? NSNumber)?.doubleValue
        )
    }

    // MARK: Pending edits (lib/db/firestore/client/cardEdits.ts)

    private func editRef(_ id: String) -> DocumentReference {
        db.collection("cards").document(id).collection("edits").document("current")
    }

    /// savePendingCardEdit: a published card autosaves its whole working copy
    /// here (owner-only), never onto the card readers are looking at.
    func saveEdit(_ id: String, _ v: DraftValues) -> IssuedWrite {
        if let outbox, usesAPI {
            return outbox.enqueue(OutboxWrite(uid: uid, cardId: id, kind: .edit, edit: Self.editBody(v)))
        }
        var data = fields(v)
        if let media = media(v) { data["media"] = media }
        data["accentHue"] = v.accentHue ?? NSNull()
        data["updatedAt"] = FieldValue.serverTimestamp()
        return send(editRef(id), data, merge: false)
    }

    /// discardPendingCardEdit: the live card is left exactly as it was.
    func discardEdit(_ id: String) async throws {
        if let outbox, let api, usesAPI {
            // What waits to be saved into the buffer goes first, and the save on its way lands: none re-makes it.
            await outbox.drop(id, kinds: [.edit])
            try await api.discardPendingEdit(id)
            return
        }
        try await editRef(id).delete()
    }

    func deleteDraft(_ id: String) async throws {
        if let outbox, let writing, usesAPI {
            await outbox.drop(id, kinds: [.create, .draft, .edit])
            try await writing.deleteCard(id)
            outbox.forget(id)
            return
        }
        try await db.collection("cards").document(id).delete()
    }

    // MARK: Reads of your own cards

    /// Your card answering another: a draft still being written, or published.
    struct Resonance: Equatable {
        let id: String
        let published: Bool
    }

    /// getMyResonanceCard: your card (draft or published) answering this one, if any.
    func myResonance(to cardId: String) async throws -> Resonance? {
        let snap = try await db.collection("cards").whereField("authorId", isEqualTo: uid)
            .whereField("referenceCardId", isEqualTo: cardId).limit(to: 1).getDocuments()
        return snap.documents.first.map { Resonance(id: $0.documentID, published: $0.get("publishedAt") is Timestamp) }
    }

    // The completion form: the payload never leaves the main actor. Firestore applies the write to
    // its local cache as it is called — the draft is kept from here — and the completion is the
    // server's answer.
    private func send(_ ref: DocumentReference, _ data: [String: Any], merge: Bool) -> IssuedWrite {
        let (answer, answered) = AsyncThrowingStream<Void, Error>.makeStream()
        ref.setData(data, merge: merge) { error in
            if let error { answered.finish(throwing: error) } else { answered.finish() }
        }
        return IssuedWrite(answer: Task { for try await _ in answer {} })
    }
}
