import Foundation
import ResonanceAPI

public typealias CardTap = Components.Schemas.CardTap
public typealias TapList = Components.Schemas.TapList
public typealias TapPerson = Components.Schemas.TapPerson
public typealias TapPassage = Components.Schemas.TapPassage
public typealias ReadingReportBody = Components.Schemas.ReadingReportRequest

/// The resonance tap (共振, round 26 §R1) and the reading report (§R3) as plain async calls — the reading
/// side's, like the card they are about. Each returns the contract's answer or throws an `APIFailure` with
/// the status, so the page can tell a refusal (403 no pen name, 403 `blocked`) from a failure to retry.
extension ReadingAPI {
    /// Resonates with card `id` (PUT /cards/{id}/tap): `on` as the server has it now, `changed` false when
    /// it already was. The author is told once, ever; a tap connects no one.
    public func tap(_ id: String) async throws -> Bool {
        switch try await client.tapCard(path: .init(key: id)) {
        case let .ok(r): return try r.body.json.on
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Takes the tap back (DELETE /cards/{id}/tap): no one is told. Answers `on` as the server has it (false).
    public func untap(_ id: String) async throws -> Bool {
        switch try await client.untapCard(path: .init(key: id)) {
        case let .ok(r): return try r.body.json.on
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Says which part of card `id` stayed with the reader (PUT /cards/{id}/tap/passage, round 27 §P4): one of
    /// `CardTap.passages`' ids, or nil to clear the pick. Only the author learns it; nothing rings. Answers the pick
    /// as the server holds it now. A 409 (the tap is off) or a 400 (not one of the card's passages now) tells the
    /// page to read the card again.
    public func setTapPassage(_ id: String, passage: String?) async throws -> String? {
        switch try await client.setTapPassage(path: .init(key: id), body: .json(.init(passage: passage))) {
        case let .ok(r): return try r.body.json.passage
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Who resonated with card `id`, as the viewer may see them (GET /cards/{id}/taps): the author pages of 30
    /// with each person's latest note on a named card; a reader one page of their connections.
    public func taps(_ id: String, pageToken: String? = nil) async throws -> TapList {
        switch try await client.getCardTaps(path: .init(key: id), query: .init(pageToken: pageToken)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// One page view's reading of card `id` so far, as running totals (POST /cards/{id}/reading): always 204
    /// for a well-formed report, whatever the server keeps of it.
    public func reportReading(_ id: String, _ report: ReadingReportBody) async throws {
        switch try await client.reportCardReading(path: .init(key: id), body: .json(report)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}
