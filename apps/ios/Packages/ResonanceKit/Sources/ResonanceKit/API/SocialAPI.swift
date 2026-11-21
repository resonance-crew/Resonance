import Foundation
import ResonanceAPI

/// The social reads and writes the apps made straight to Firestore before the middleware decouple (Phase 2,
/// `features.apiSocial`): people by id (GET /users?ids=), bookmarks (PUT/DELETE /me/bookmarks/{cardId}), blocks
/// (GET /me/blocks, PUT/DELETE /me/blocks/{uid} — a block is one server transaction: the block, the connection
/// ended, every pending invite between the two withdrawn), connections (GET /me/connections), and the profile
/// fields the apps wrote themselves (PATCH /me `avatarUrl`, `hintsSeen`).
public struct SocialAPI: Sendable {
    public typealias Person = Components.Schemas.Person
    public typealias BlockedPerson = Components.Schemas.BlockedPerson
    public typealias Connection = Components.Schemas.Connection

    /// GET /users takes at most this many ids at once.
    public static let usersPerRequest = 30

    let client: Client

    public init(client: Client) {
        self.client = client
    }

    /// Profiles by id, in the order asked, each once — as many requests as 30 at a time take. An account that is
    /// gone comes back `gone` (never stale words).
    public func users(_ ids: [String]) async throws -> [Person] {
        var seen = Set<String>()
        let unique = ids.filter { !$0.isEmpty && seen.insert($0).inserted }
        var people: [Person] = []
        for start in stride(from: 0, to: unique.count, by: Self.usersPerRequest) {
            let chunk = unique[start..<min(start + Self.usersPerRequest, unique.count)]
            switch try await client.getUsers(query: .init(ids: chunk.joined(separator: ","))) {
            case let .ok(r): people += try r.body.json.users
            case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
            case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
            case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
            case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
            }
        }
        return people
    }

    public func bookmark(_ cardId: String) async throws {
        switch try await client.putBookmark(path: .init(cardId: cardId)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func removeBookmark(_ cardId: String) async throws {
        switch try await client.deleteBookmark(path: .init(cardId: cardId)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Everyone this account blocked, the latest first.
    public func blocks() async throws -> [BlockedPerson] {
        switch try await client.getBlocks() {
        case let .ok(r): return try r.body.json.blocks
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func block(_ uid: String) async throws {
        switch try await client.blockUser(path: .init(uid: uid)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func unblock(_ uid: String) async throws {
        switch try await client.unblockUser(path: .init(uid: uid)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// The people this account is connected with, the latest first.
    public func connections() async throws -> [Connection] {
        switch try await client.getConnections() {
        case let .ok(r): return try r.body.json.connections
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// PATCH /me with only the fields the apps once wrote to the profile document themselves: a new avatar's URL
    /// (one the upload route returned: the server takes only its own media hosts) and hint counts (merged as the
    /// larger per key).
    @discardableResult
    public func updateMe(avatarUrl: String? = nil, hintsSeen: [String: Int]? = nil) async throws -> Components.Schemas.Me {
        let body = Components.Schemas.UpdateProfileRequest(
            avatarUrl: avatarUrl, hintsSeen: hintsSeen.map { .init(additionalProperties: $0) })
        switch try await client.updateProfile(body: .json(body)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}
