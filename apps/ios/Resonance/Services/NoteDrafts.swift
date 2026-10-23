import CryptoKit
import Foundation

/// A note's unsent words (小紙條), kept on the device for each signed-in account and card, so that
/// closing the composer — a tap beside it, 取消, the app going away — never loses what was typed:
/// opened again on the same card, the composer starts from them. A draft goes once its note is sent
/// (the server's 201), when its words are emptied, and with the account's other local data on
/// sign-out or a switch of account (`retainOnly`). At most `limit` drafts are kept (the oldest
/// dropped) and none older than `maxAge`. The web keeps the same in localStorage.
///
/// One small JSON file per account (named by a digest of its uid, never the uid) in Application
/// Support — not Caches, which the system may empty — left out of backups, as everything an account
/// keeps on the device is. Written at once, so a draft outlives the app being killed.
@MainActor final class NoteDrafts {
    struct Draft: Codable, Equatable {
        var text: String
        var savedAt: Date
    }

    /// How many drafts an account keeps (the oldest goes first).
    static let limit = 50
    /// How long a draft is kept unsent.
    static let maxAge: TimeInterval = 30 * 24 * 60 * 60

    let root: URL
    private let now: () -> Date
    /// The account whose drafts were read last, and those drafts (by card id).
    private var cached: (uid: String, drafts: [String: Draft])?

    init(root: URL, now: @escaping () -> Date = { Date() }) {
        self.root = root
        self.now = now
    }

    /// The app's: Application Support/NoteDrafts.
    static func standard() -> NoteDrafts {
        let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        return NoteDrafts(root: support.appending(path: "NoteDrafts", directoryHint: .isDirectory))
    }

    /// The words left unsent on `cardId` by `uid`, if any are kept.
    func text(uid: String, cardId: String) -> String? {
        drafts(uid)[cardId]?.text
    }

    /// Keeps `text` as `uid`'s unsent note on `cardId` — or, with nothing but spaces in it, lets the
    /// draft go. The newest `limit` drafts stay, none past `maxAge`.
    func keep(_ text: String, uid: String, cardId: String) {
        guard !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else { return clear(uid: uid, cardId: cardId) }
        var drafts = drafts(uid)
        guard drafts[cardId]?.text != text else { return }
        drafts[cardId] = Draft(text: text, savedAt: now())
        save(Self.pruned(drafts, now: now()), uid: uid)
    }

    /// The note went (or its words were emptied): nothing is kept for it.
    func clear(uid: String, cardId: String) {
        var drafts = drafts(uid)
        guard drafts.removeValue(forKey: cardId) != nil else { return }
        save(drafts, uid: uid)
    }

    /// Only `uid`'s drafts are kept from now on; every other account's are deleted (nil: everyone's) —
    /// with the rest of what the device holds of an account that signed out or was switched from.
    func retainOnly(_ uid: String?) {
        let keep = uid.map(Self.fileName)
        let files = (try? FileManager.default.contentsOfDirectory(atPath: root.path)) ?? []
        for file in files where file != keep {
            try? FileManager.default.removeItem(at: root.appending(path: file))
        }
        if cached?.uid != uid { cached = nil }
    }

    /// The newest `limit` of `drafts`, none older than `maxAge` at `now`.
    static func pruned(_ drafts: [String: Draft], now: Date) -> [String: Draft] {
        let fresh = drafts.filter { now.timeIntervalSince($0.value.savedAt) < maxAge }
        guard fresh.count > limit else { return fresh }
        let newest = fresh.sorted { $0.value.savedAt > $1.value.savedAt }.prefix(limit)
        return Dictionary(uniqueKeysWithValues: newest.map { ($0.key, $0.value) })
    }

    // MARK: - Internals

    private func drafts(_ uid: String) -> [String: Draft] {
        if let cached, cached.uid == uid { return Self.pruned(cached.drafts, now: now()) }
        let read = (try? Data(contentsOf: file(uid))).flatMap { try? JSONDecoder().decode([String: Draft].self, from: $0) } ?? [:]
        let drafts = Self.pruned(read, now: now())
        cached = (uid, drafts)
        // Past their time on the disk too.
        if drafts.count != read.count { save(drafts, uid: uid) }
        return drafts
    }

    private func save(_ drafts: [String: Draft], uid: String) {
        cached = (uid, drafts)
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
        root.appending(path: Self.fileName(uid))
    }

    /// An account's file: a digest of its uid, so no uid is ever a path.
    nonisolated static func fileName(_ uid: String) -> String {
        SHA256.hash(data: Data(uid.utf8)).prefix(16).map { String(format: "%02x", $0) }.joined() + ".json"
    }
}
