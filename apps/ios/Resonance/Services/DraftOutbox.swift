import Foundation
import ResonanceAPI
import ResonanceKit

/// One write of the writer's waiting for the server (`features.apiDrafts`): a draft made (POST /cards), a draft's
/// save (PATCH /cards/{id}/draft) or a published card's working copy (PUT /cards/{id}/edits/current). Each save
/// holds the whole state the writer had (every field, the cover whole or cleared), so a later one replaces an
/// earlier one still waiting. Its `rev` is given when it is sent.
nonisolated struct OutboxWrite: Codable, Equatable, Sendable {
    enum Kind: String, Codable, Sendable { case create, draft, edit }

    /// This entry (who waits on it).
    var id = UUID()
    let uid: String
    let cardId: String
    let kind: Kind
    var create: DraftsAPI.Create?
    var patch: DraftsAPI.Patch?
    var edit: DraftsAPI.Edit?
}

/// The writer's outbox (Phase 2 of the middleware decouple): what Firestore's offline queue promised the writer
/// before — a write is kept on the device from the moment it is made (in a file, so a relaunch, a crash or a
/// night offline keeps it), sent in the order it was made, and answered when the server has it.
///
/// - One request in flight per card; what is saved meanwhile waits, the newest replacing an older one of its kind
///   (`create` → its draft's saves → …, in order), and goes next.
/// - Each save carries `rev`, this device's count of the card's saves (kept with the writes): the server applies it
///   only above the count it stores, so a save that arrives late never puts older words back. A save answered
///   `applied: false` was beaten by a count from elsewhere (another device, an install before this one) — these
///   are the words on screen, so they go again above the server's count (`staleResends` times at most).
/// - The network failing (or a 5xx, a 429) keeps the write, tried again after a pause that grows, at once on
///   `sendNow()` (a new save, the app back in front, publishing): its writer is answered only when it goes, as
///   Firestore answered. A refusal (any other 4xx) drops it, and its writer is told.
/// - Only the signed-in account's writes are sent and kept (`start(uid:)`; signed out, none — as Firestore's
///   cache was cleared).
@MainActor final class DraftOutbox {
    /// The requests, apart for tests.
    nonisolated struct Send: Sendable {
        var create: @Sendable (DraftsAPI.Create) async throws -> DraftsAPI.Created
        var save: @Sendable (String, DraftsAPI.Patch) async throws -> DraftsAPI.Saved
        var edit: @Sendable (String, DraftsAPI.Edit) async throws -> DraftsAPI.Saved

        init(create: @escaping @Sendable (DraftsAPI.Create) async throws -> DraftsAPI.Created,
             save: @escaping @Sendable (String, DraftsAPI.Patch) async throws -> DraftsAPI.Saved,
             edit: @escaping @Sendable (String, DraftsAPI.Edit) async throws -> DraftsAPI.Saved) {
            self.create = create
            self.save = save
            self.edit = edit
        }

        init(_ api: DraftsAPI) {
            self.init(create: { try await api.create($0) }, save: { try await api.save($0, $1) },
                      edit: { try await api.savePendingEdit($0, $1) })
        }
    }

    /// What the file keeps: the counts, and the writes not yet taken.
    struct Kept: Codable, Equatable {
        var revs: [String: Int] = [:]
        var writes: [OutboxWrite] = []
    }

    /// A save answered stale goes again at most this many times (each one above the server's count).
    static let staleResends = 3
    static let retryBase: Duration = .seconds(1)
    static let retryMax: Duration = .seconds(30)

    private let send: Send
    private let file: URL?
    private let pause: @Sendable (Duration) async -> Void
    private var kept: Kept
    /// Whose writes are sent.
    private(set) var uid: String?
    /// Cards with a request on its way (the card's first write).
    private var sending: Set<String> = []
    private var failures: [String: Int] = [:]
    private var retries: [String: Task<Void, Never>] = [:]
    /// Who waits on each write (its writer; those merged into it).
    private var waiters: [UUID: [AsyncThrowingStream<Void, Error>.Continuation]] = [:]
    /// Who waits for a card's request on its way to end.
    private var landing: [String: [CheckedContinuation<Void, Never>]] = [:]

    init(send: Send, file: URL?, pause: @escaping @Sendable (Duration) async -> Void = { try? await Task.sleep(for: $0) }) {
        self.send = send
        self.file = file
        self.pause = pause
        kept = file.flatMap { try? Data(contentsOf: $0) }.flatMap { try? JSONDecoder().decode(Kept.self, from: $0) } ?? Kept()
    }

    /// The app's: Application Support, kept across launches.
    static func standardFile() -> URL {
        FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appending(path: "draft-outbox.json")
    }

    // MARK: State

    /// The writes waiting, oldest first (all accounts').
    var writes: [OutboxWrite] { kept.writes }

    /// Whether anything of the card's waits or is on its way.
    func busy(_ cardId: String) -> Bool { kept.writes.contains { $0.cardId == cardId } }

    /// The highest `rev` known for the card's draft (`.draft`) or working copy (`.edit`): 0 when none.
    func knownRev(_ kind: OutboxWrite.Kind, _ cardId: String) -> Int { kept.revs[Self.revKey(kind, cardId)] ?? 0 }

    /// The newest state waiting for the card (what the server doesn't have yet): opening it again shows these words.
    func newest(_ cardId: String) -> OutboxWrite? { kept.writes.last { $0.cardId == cardId && $0.uid == uid } }

    // MARK: The account

    /// Signed in as `uid` (nil: signed out): only its writes are kept, and what it left unsent goes now.
    func start(uid: String?) {
        self.uid = uid
        let dropped = kept.writes.filter { $0.uid != uid }
        guard !dropped.isEmpty || uid != nil else { return }
        if !dropped.isEmpty {
            kept.writes.removeAll { $0.uid != uid }
            for write in dropped { finish(write.id, with: nil) }
            save()
        }
        sendNow()
    }

    // MARK: Writing

    /// Keeps `write` (in place of one of its kind still waiting) and sends it when its card's turn comes. The
    /// answer comes when it — or a later save that replaced it — is stored, or refused.
    func enqueue(_ write: OutboxWrite) -> IssuedWrite {
        let (answer, answered) = AsyncThrowingStream<Void, Error>.makeStream()
        var target = write
        let mine = kept.writes.indices.filter { kept.writes[$0].cardId == write.cardId }
        if let last = mine.last, write.kind != .create, kept.writes[last].kind == write.kind,
           !(sending.contains(write.cardId) && last == mine.first) {
            // Still waiting: the newer state takes its place (its writer waits on the merged one).
            target.id = kept.writes[last].id
            kept.writes[last] = target
        } else {
            kept.writes.append(target)
        }
        waiters[target.id, default: []].append(answered)
        save()
        retryNow(write.cardId)
        return IssuedWrite(answer: Task { for try await _ in answer {} })
    }

    /// Everything waiting goes now (past any pause after a failure): a new save, the app back in front, publishing.
    func sendNow() {
        for card in Set(kept.writes.map(\.cardId)) { retryNow(card) }
    }

    /// Forgets the card's writes of `kinds` still waiting (their writers are answered as if stored: a working copy
    /// thrown away, a draft deleted), then waits out the one on its way, so nothing lands after this returns.
    func drop(_ cardId: String, kinds: Set<OutboxWrite.Kind>) async {
        let head = sending.contains(cardId) ? kept.writes.first { $0.cardId == cardId }?.id : nil
        removeWaiting(cardId, kinds: kinds, except: head)
        while sending.contains(cardId) {
            await withCheckedContinuation { landing[cardId, default: []].append($0) }
        }
        // The one on its way may have failed and been kept: it goes too.
        removeWaiting(cardId, kinds: kinds, except: nil)
    }

    /// The card is gone for good: its counts too.
    func forget(_ cardId: String) {
        kept.revs[Self.revKey(.draft, cardId)] = nil
        kept.revs[Self.revKey(.edit, cardId)] = nil
        save()
    }

    // MARK: Sending

    private func removeWaiting(_ cardId: String, kinds: Set<OutboxWrite.Kind>, except: UUID?) {
        let gone = kept.writes.filter { $0.cardId == cardId && kinds.contains($0.kind) && $0.id != except }
        guard !gone.isEmpty else { return }
        kept.writes.removeAll { w in gone.contains { $0.id == w.id } }
        retries[cardId]?.cancel()
        retries[cardId] = nil
        for write in gone { finish(write.id, with: nil) }
        save()
    }

    private func retryNow(_ cardId: String) {
        if let retry = retries[cardId] {
            retry.cancel()
            retries[cardId] = nil
        }
        pump(cardId)
    }

    private func pump(_ cardId: String) {
        guard let uid, !sending.contains(cardId), retries[cardId] == nil,
              let write = kept.writes.first(where: { $0.cardId == cardId }), write.uid == uid else { return }
        sending.insert(cardId)
        Task { [weak self] in
            guard let self else { return }
            let result: Result<Void, Error>
            do {
                try await deliver(write)
                result = .success(())
            } catch {
                result = .failure(error)
            }
            landed(write, result)
        }
    }

    /// One write sent, counted, and sent again above the server's count when it holds a later one.
    private func deliver(_ write: OutboxWrite) async throws {
        let send = send
        switch write.kind {
        case .create:
            guard let body = write.create else { return }
            let created = try await send.create(body)
            note(.draft, write.cardId, created.rev)
        case .draft, .edit:
            var rev = knownRev(write.kind, write.cardId) + 1
            note(write.kind, write.cardId, rev)
            var saved = try await sendSave(write, rev: rev, send: send)
            for _ in 0..<Self.staleResends where !saved.applied {
                rev = max(saved.rev, rev) + 1
                note(write.kind, write.cardId, rev)
                saved = try await sendSave(write, rev: rev, send: send)
            }
            note(write.kind, write.cardId, saved.rev)
            if !saved.applied { throw APIFailure(code: "conflict", message: "A newer save is kept.", status: 409) }
        }
    }

    private func sendSave(_ write: OutboxWrite, rev: Int, send: Send) async throws -> DraftsAPI.Saved {
        if write.kind == .draft, var patch = write.patch {
            patch.rev = rev
            return try await send.save(write.cardId, patch)
        }
        guard var edit = write.edit else { return DraftsAPI.Saved(applied: true, rev: rev, updatedAt: nil) }
        edit.rev = rev
        return try await send.edit(write.cardId, edit)
    }

    private func landed(_ write: OutboxWrite, _ result: Result<Void, Error>) {
        sending.remove(write.cardId)
        defer {
            for waiting in landing.removeValue(forKey: write.cardId) ?? [] { waiting.resume() }
        }
        switch result {
        case .success:
            failures[write.cardId] = nil
            remove(write.id)
            finish(write.id, with: nil)
            pump(write.cardId)
        case let .failure(error) where APIFailure.isRetryable(error):
            // Kept, under anything saved since, for the next try.
            guard kept.writes.contains(where: { $0.id == write.id }) else { return pump(write.cardId) }
            let count = (failures[write.cardId] ?? 0) + 1
            failures[write.cardId] = count
            let wait = min(Self.retryBase * (1 << min(count - 1, 5)), Self.retryMax)
            let pause = pause
            retries[write.cardId] = Task { [weak self] in
                await pause(wait)
                guard !Task.isCancelled, let self else { return }
                retries[write.cardId] = nil
                pump(write.cardId)
            }
        case let .failure(error):
            failures[write.cardId] = nil
            remove(write.id)
            finish(write.id, with: error)
            pump(write.cardId)
        }
    }

    private func remove(_ id: UUID) {
        kept.writes.removeAll { $0.id == id }
        save()
    }

    private func finish(_ id: UUID, with error: Error?) {
        for answered in waiters.removeValue(forKey: id) ?? [] {
            if let error { answered.finish(throwing: error) } else { answered.finish() }
        }
    }

    private func note(_ kind: OutboxWrite.Kind, _ cardId: String, _ rev: Int) {
        let key = Self.revKey(kind == .create ? .draft : kind, cardId)
        guard rev > (kept.revs[key] ?? 0) else { return }
        kept.revs[key] = rev
        save()
    }

    private static func revKey(_ kind: OutboxWrite.Kind, _ cardId: String) -> String { "\(kind.rawValue):\(cardId)" }

    private func save() {
        guard let file else { return }
        guard let data = try? JSONEncoder().encode(kept) else { return }
        try? FileManager.default.createDirectory(at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
}
