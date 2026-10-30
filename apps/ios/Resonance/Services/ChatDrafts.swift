import Foundation
import Observation
import ResonanceKit

/// A message's unsent words in each conversation (round 22 §4.4), kept on the device for each signed-in
/// account, so leaving a thread — another conversation, the app going away — never loses what was being
/// written: opened again, the composer starts from it, with the reply it was answering, the note it quoted
/// and the card riding with it (never pictures). Saved half a second after typing stops and on leaving;
/// cleared when the message is sent, when everything in it is emptied, when the conversation is deleted, and
/// with the account's other local data on sign-out or a switch of account (`retainOnly`). At most `limit`
/// drafts are kept (the oldest dropped), none older than `maxAge` — as ``NoteDrafts``, whose file layout it
/// shares: one small JSON file per account, named by a digest of its uid, in Application Support, out of backups.
/// Observable: the conversation list shows a row's draft (after a pen glyph, in terracotta) until it is sent.
@MainActor @Observable
final class ChatDrafts {
    struct Draft: Codable, Equatable {
        var text: String
        var replyTo: ReplyQuote?
        var noteCardId: String?
        var noteId: String?
        var cardId: String?
        var savedAt: Date

        var noteRef: MessagingAPI.NoteRef? {
            guard let noteCardId, let noteId else { return nil }
            return MessagingAPI.NoteRef(cardId: noteCardId, noteId: noteId)
        }

        /// Nothing worth keeping: no words, no reply, no note, no card.
        var isEmpty: Bool {
            text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && replyTo == nil && noteRef == nil && cardId == nil
        }
    }

    static let limit = 50
    static let maxAge: TimeInterval = 30 * 24 * 60 * 60

    let root: URL
    @ObservationIgnored private let now: () -> Date
    @ObservationIgnored private var cached: (uid: String, drafts: [String: Draft])?
    /// Bumped with every change, so the conversation list reads its rows again.
    private(set) var revision = 0

    init(root: URL, now: @escaping () -> Date = { Date() }) {
        self.root = root
        self.now = now
    }

    /// The app's: Application Support/ChatDrafts.
    static func standard() -> ChatDrafts {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return ChatDrafts(root: support.appending(path: "ChatDrafts", directoryHint: .isDirectory))
    }

    /// `uid`'s draft in the conversation `pair`, if one is kept.
    func draft(uid: String, pair: String) -> Draft? {
        _ = revision
        return drafts(uid)[pair]
    }

    /// The words to show on the conversation's row (one line), if it has a draft with words.
    func preview(uid: String, pair: String) -> String? {
        guard let text = draft(uid: uid, pair: pair)?.text.trimmingCharacters(in: .whitespacesAndNewlines), !text.isEmpty else { return nil }
        return text.replacingOccurrences(of: "\n", with: " ")
    }

    /// Keeps what the composer holds as `uid`'s draft in `pair` — or, with nothing in it, lets it go.
    func keep(text: String, replyTo: ReplyQuote?, noteRef: MessagingAPI.NoteRef?, cardId: String?, uid: String, pair: String) {
        let draft = Draft(text: text, replyTo: replyTo, noteCardId: noteRef?.cardId, noteId: noteRef?.noteId, cardId: cardId,
                          savedAt: now())
        guard !draft.isEmpty else { return clear(uid: uid, pair: pair) }
        var drafts = drafts(uid)
        if let kept = drafts[pair], Self.same(kept, draft) { return }
        drafts[pair] = draft
        save(Self.pruned(drafts, now: now()), uid: uid)
    }

    /// Sent, emptied, or the conversation deleted: nothing is kept for it.
    func clear(uid: String, pair: String) {
        var drafts = drafts(uid)
        guard drafts.removeValue(forKey: pair) != nil else { return }
        save(drafts, uid: uid)
    }

    /// Only `uid`'s drafts are kept from now on (nil: no one's).
    func retainOnly(_ uid: String?) {
        let keep = uid.map(NoteDrafts.fileName)
        let files = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        for file in files where file != keep {
            try? FileManager.default.removeItem(at: root.appending(path: file))
        }
        if cached?.uid != uid {
            cached = nil
            revision += 1
        }
    }

    /// The newest `limit` of `drafts`, none older than `maxAge` at `now`.
    static func pruned(_ drafts: [String: Draft], now: Date) -> [String: Draft] {
        let fresh = drafts.filter { now.timeIntervalSince($0.value.savedAt) < maxAge }
        guard fresh.count > limit else { return fresh }
        let newest = fresh.sorted { $0.value.savedAt > $1.value.savedAt }.prefix(limit)
        return Dictionary(uniqueKeysWithValues: newest.map { ($0.key, $0.value) })
    }

    /// The same draft, whenever it was saved.
    private static func same(_ a: Draft, _ b: Draft) -> Bool {
        a.text == b.text && a.replyTo == b.replyTo && a.noteRef == b.noteRef && a.cardId == b.cardId
    }

    // MARK: - Internals

    private func drafts(_ uid: String) -> [String: Draft] {
        if let cached, cached.uid == uid { return Self.pruned(cached.drafts, now: now()) }
        let read = (try? Data(contentsOf: file(uid))).flatMap { try? JSONDecoder().decode([String: Draft].self, from: $0) } ?? [:]
        let drafts = Self.pruned(read, now: now())
        cached = (uid, drafts)
        if drafts.count != read.count { write(drafts, uid: uid) }
        return drafts
    }

    private func save(_ drafts: [String: Draft], uid: String) {
        cached = (uid, drafts)
        revision += 1
        write(drafts, uid: uid)
    }

    private func write(_ drafts: [String: Draft], uid: String) {
        let file = file(uid)
        if drafts.isEmpty {
            try? FileManager.default.removeItem(at: file)
            return
        }
        guard let data = try? JSONEncoder().encode(drafts) else { return }
        if !FileManager.default.fileExists(atPath: root.path) {
            try? FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
            var folder = root
            var values = URLResourceValues()
            values.isExcludedFromBackup = true
            try? folder.setResourceValues(values)
        }
        try? data.write(to: file, options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }

    private func file(_ uid: String) -> URL {
        root.appending(path: NoteDrafts.fileName(uid))
    }
}
