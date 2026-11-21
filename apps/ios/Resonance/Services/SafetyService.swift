import FirebaseFirestore
import Foundation
import ResonanceKit

/// Report and block. Reports go through the API, which fills in a card's
/// author (anonymous cards included) and keeps what was reported as
/// evidence; blocks are written straight to Firestore under the same rules
/// the web's client uses (lib/db/firestore/client/blocks.ts): the block list
/// is owner-only, and blocking also ends the connection and withdraws the
/// blocker's pending invites.
struct SafetyService {
    enum Reason: String, CaseIterable, Identifiable {
        case spam, harassment, hate, sexual, selfHarm = "self_harm", violence, other
        var id: String { rawValue }
    }

    enum Target {
        /// `authorId` is nil for an anonymous card: the app never learns who wrote it.
        case card(id: String, authorId: String?)
        case user(id: String)
        /// A message — or, with the conversation's own id as `id`, the conversation as a whole.
        case message(id: String, senderId: String, conversationId: String)

        /// The person behind it, when the app knows them (someone to block).
        var userId: String? {
            switch self {
            case let .card(_, author): author
            case let .user(id): id
            case let .message(_, sender, _): sender
            }
        }

        /// What POST /api/v1/reports is told it is (nil for a card, reported through its own route).
        var reportTarget: SafetyAPI.ReportTarget? {
            switch self {
            case .card: nil
            case let .user(id): .person(id)
            case let .message(id, _, conversation):
                id == conversation ? .conversation(id) : .message(id, conversationId: conversation)
            }
        }
    }

    /// The contract's REPORT_DETAIL_MAX.
    static let detailMax = 1000

    let uid: String
    let api: SafetyAPI
    /// Told after a block or an unblock: what the API answered before may show the wrong people now.
    var onWrite: @Sendable () -> Void = {}
    /// The `/api/v1` path (`features.apiSocial`, Phase 2 of the middleware decouple): a block is one server call —
    /// the block, the connection ended and every pending invite between the two withdrawn in one transaction — and
    /// the list is GET /me/blocks. Nil: the older path, straight to Firestore (kept one release).
    var social: SocialAPI? = nil
    /// Told the moment a block or an unblock is asked for through the API (`true`: blocked), and again with the
    /// opposite if the server refused: the lists drop or bring back the person at once, before any signal.
    var onBlockChange: @MainActor (String, Bool) -> Void = { _, _ in }
    private var db: Firestore { FirebaseBootstrap.db }

    func report(_ target: Target, reason: Reason, detail: String) async throws {
        let trimmed = detail.trimmingCharacters(in: .whitespacesAndNewlines).prefix(utf16Units: Self.detailMax)
        let (reason, detail) = (SafetyAPI.ReportReason(rawValue: reason.rawValue) ?? .other, trimmed.isEmpty ? nil : trimmed)
        // The server knows a card's author and a message's sender, and checks the
        // reporter can see the card or is in the conversation.
        if case let .card(id, _) = target {
            try await api.reportCard(id, reason: reason, detail: detail)
        } else if let filed = target.reportTarget {
            try await api.report(filed, reason: reason, detail: detail)
        }
    }

    func block(_ other: String) async throws {
        guard other != uid else { return }
        defer { onWrite() }
        if let social {
            onBlockChange(other, true)
            do { try await social.block(other) } catch {
                onBlockChange(other, false)
                throw error
            }
            return
        }
        // The block goes first: once it exists the rules refuse any new contact,
        // so the cleanup below can't race a fresh connection.
        try await db.collection("users").document(uid).collection("blocks").document(other)
            .setData(["blockedUid": other, "createdAt": FieldValue.serverTimestamp()])
        let pair = uid < other ? "\(uid)_\(other)" : "\(other)_\(uid)"
        let connection = db.collection("connections").document(pair)
        if try await connection.getDocument().exists { try await connection.delete() }
        let pending = try await db.collection("invites")
            .whereField("fromUserId", isEqualTo: uid)
            .whereField("toUserId", isEqualTo: other)
            .whereField("status", isEqualTo: "pending")
            .getDocuments()
        for invite in pending.documents { try await invite.reference.updateData(["status": "withdrawn"]) }
    }

    func unblock(_ other: String) async throws {
        defer { onWrite() }
        if let social {
            onBlockChange(other, false)
            do { try await social.unblock(other) } catch {
                onBlockChange(other, true)
                throw error
            }
            return
        }
        try await db.collection("users").document(uid).collection("blocks").document(other).delete()
    }

    nonisolated struct BlockedPerson: Identifiable, Hashable, Sendable {
        let id: String
        let handle: String?
        let initials: String
        let avatarUrl: String?
        let accentColor: String?
        let avatarSeed: Double?
        let since: Date?
    }

    /// The block list, newest first, with each person's current name (a
    /// deleted account shows as such) — everyone's profile read at once.
    func blocked() async throws -> [BlockedPerson] {
        if let social { return try await social.blocks().map(Self.person) }
        let snap = try await db.collection("users").document(uid).collection("blocks")
            .order(by: "createdAt", descending: true).getDocuments()
        let blocks = snap.documents.map { (id: $0.documentID, since: ($0.get("createdAt") as? Timestamp)?.dateValue()) }
        return await withTaskGroup(of: (Int, BlockedPerson).self) { group in
            for (index, block) in blocks.enumerated() {
                group.addTask { (index, await Self.person(block.id, since: block.since)) }
            }
            // The list keeps its order, whichever profile arrives first.
            var people = [BlockedPerson?](repeating: nil, count: blocks.count)
            for await (index, person) in group { people[index] = person }
            return people.compactMap { $0 }
        }
    }

    /// A block as GET /me/blocks answers it (a deleted account has no pen name, as before).
    nonisolated static func person(_ block: SocialAPI.BlockedPerson) -> BlockedPerson {
        let author = block.person.gone ? nil : block.person.author?.value1
        return BlockedPerson(id: block.userId, handle: author?.handle, initials: author?.initials ?? "··",
                             avatarUrl: author?.avatarUrl, accentColor: author?.accentColor,
                             avatarSeed: author?.avatarSeed.flatMap(Double.init).flatMap { $0 == 0 ? nil : $0 },
                             since: block.blockedAt)
    }

    nonisolated private static func person(_ id: String, since: Date?) async -> BlockedPerson {
        let user = try? await FirebaseBootstrap.db.collection("users").document(id).getDocument()
        return BlockedPerson(
            id: id,
            handle: user?.get("handle") as? String,
            initials: (user?.get("initials") as? String) ?? "··",
            avatarUrl: user?.get("avatarUrl") as? String,
            accentColor: user?.get("accentColor") as? String,
            // Stored as a string, like the web's `Number(avatarSeed)`.
            avatarSeed: ((user?.get("avatarSeed") as? String).flatMap(Double.init) ?? (user?.get("avatarSeed") as? Double))
                .flatMap { $0 == 0 ? nil : $0 },
            since: since
        )
    }
}
