import Foundation
import ResonanceAPI

/// The writer's side the apps wrote straight to Firestore before the middleware decouple (Phase 2,
/// `features.apiThoughtMap`): the thought map read whole (GET /me/thought-map) and changed in batches of ops
/// (POST /me/thought-map/ops — atomic, in order, an op on something gone skipped).
public struct ThoughtMapAPI: Sendable {
    public typealias Map = Components.Schemas.ThoughtMap
    public typealias Op = Components.Schemas.MapOp
    public typealias OpsResult = Components.Schemas.MapOpsResponse

    /// The most ops one batch takes.
    public static let opsPerBatch = 200

    let client: Client

    public init(client: Client) {
        self.client = client
    }

    public func map() async throws -> Map {
        switch try await client.getThoughtMap() {
        case let .ok(r): return try r.body.json
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// One batch (1…`opsPerBatch` ops), stored all together or not at all.
    public func apply(_ ops: [Op]) async throws -> OpsResult {
        switch try await client.applyThoughtMapOps(body: .json(.init(ops: ops))) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}

/// Drafts and pending edits through the server (Phase 2, `features.apiDrafts`): a draft made under the id the
/// client chose (POST /cards), its saves by `rev` (PATCH /cards/{id}/draft — applied only above the count the
/// server stores, else answered `applied: false` with that count), a published card's working copy
/// (GET/PUT/DELETE /cards/{id}/edits/current, the same `rev` rule).
public struct DraftsAPI: Sendable {
    public typealias Create = Components.Schemas.CreateDraftRequest
    public typealias Created = Components.Schemas.CreatedDraft
    public typealias Patch = Components.Schemas.UpdateDraftRequest
    public typealias Saved = Components.Schemas.DraftSaved
    public typealias Edit = Components.Schemas.PendingEditRequest
    public typealias PendingEdit = Components.Schemas.PendingEdit
    public typealias Media = Components.Schemas.DraftMedia

    let client: Client

    public init(client: Client) {
        self.client = client
    }

    /// Makes the draft (201), or answers the one already made under this id by this account (200: a resend).
    public func create(_ body: Create) async throws -> Created {
        switch try await client.createDraft(body: .json(body)) {
        case let .ok(r): return try r.body.json
        case let .created(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func save(_ id: String, _ body: Patch) async throws -> Saved {
        switch try await client.saveDraft(path: .init(key: id), body: .json(body)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// The card's pending edit, or nil when there is none.
    public func pendingEdit(_ id: String) async throws -> PendingEdit? {
        switch try await client.getPendingEdit(path: .init(key: id)) {
        case let .ok(r): return try r.body.json.edit?.value1
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public func savePendingEdit(_ id: String, _ body: Edit) async throws -> Saved {
        switch try await client.savePendingEdit(path: .init(key: id), body: .json(body)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Whether there was one to throw away.
    @discardableResult
    public func discardPendingEdit(_ id: String) async throws -> Bool {
        switch try await client.discardPendingEdit(path: .init(key: id)) {
        case let .ok(r): return try r.body.json.deleted
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}

extension APIFailure {
    /// Worth sending again: the network (anything that isn't the server's answer), the server's own trouble
    /// (5xx), or a pause it asked for (429). Any other answer is a refusal that sending again won't change.
    public static func isRetryable(_ error: Error) -> Bool {
        guard let failure = error as? APIFailure else { return true }
        guard let status = failure.status else { return false }
        return status >= 500 || status == 429 || status == 0
    }
}
