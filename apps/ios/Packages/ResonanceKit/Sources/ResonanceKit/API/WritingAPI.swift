import Foundation
import ResonanceAPI

public typealias PublishResult = Components.Schemas.PublishResponse
public typealias ApplyEditResult = Components.Schemas.ApplyEditResponse
public typealias ResonateResult = Components.Schemas.ResonateResponse
public typealias TrashedCard = Components.Schemas.TrashedCard
public typealias RestoredCard = Components.Schemas.RestoredCard

/// What the writing screen asks of the server: publishing, a card's
/// visibility, byline, trash and deletion from its ⋯, and resonating with a card by
/// one already written (the v1 contract); and the web
/// editor's helpers it shares as they are — AI tag suggestions, the publish
/// panel's insight echo, and photo uploads. Drafts themselves are the
/// author's own documents and go straight to Firestore, as on the web.
public struct WritingAPI: Sendable {
    let client: Client
    let configuration: APIConfiguration
    let session: URLSession
    /// The client for the calls that may answer slowly (emptying the trash): the app's, through
    /// `AppHTTP.slowSession`; `client` when none is given.
    let slowClient: Client

    public init(client: Client, configuration: APIConfiguration, session: URLSession = AppHTTP.session, slowClient: Client? = nil) {
        self.client = client
        self.configuration = configuration
        self.session = session
        self.slowClient = slowClient ?? client
    }

    /// Publishes one of your cards: stamps it once, gives it its slug, and
    /// connects a resonance to its original (POST /api/v1/cards/{id}/publish).
    public func publish(_ cardId: String) async throws -> PublishResult {
        switch try await client.publishCard(path: .init(key: cardId)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        // A card in the trash: 409 'This card is in the trash.' until it is restored.
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Applies your pending edit to your published card and clears it; its
    /// date and slug stay (POST /api/v1/cards/{id}/edits/apply).
    public func applyEdit(_ cardId: String) async throws -> ApplyEditResult {
        switch try await client.applyCardEdit(path: .init(key: cardId)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        // A card in the trash: 409 'This card is in the trash.' until it is restored.
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    public typealias Visibility = Components.Schemas.UpdateCardRequest.VisibilityPayload

    /// Changes your card's visibility and/or byline — only what's passed
    /// (PATCH /api/v1/cards/{id}). Answers the card as your card box shows it;
    /// the server refreshes the site's cached pages. `not_found` when it isn't yours.
    @discardableResult
    public func updateCard(_ cardId: String, visibility: Visibility? = nil, anonymous: Bool? = nil) async throws -> FeedCard {
        let body = Components.Schemas.UpdateCardRequest(visibility: visibility, anonymous: anonymous)
        switch try await client.updateCard(path: .init(key: cardId), body: .json(body)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        // A card in the trash: 409 'This card is in the trash.' until it is restored.
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Deletes your card for good, draft or published, with its pending edit, the notes left on it
    /// and its place in the recommender (DELETE /api/v1/cards/{id}); the server refreshes the
    /// site's cached pages. A build with the trash moves a card there first (`trashCard`) and
    /// deletes for good only from it, with `onlyIfTrashed`: a card restored meanwhile (on another
    /// device) is then `conflict` (409, "This card is not in the trash.") and stays.
    public func deleteCard(_ cardId: String, onlyIfTrashed: Bool = false) async throws {
        let query = Operations.DeleteCard.Input.Query(onlyIfTrashed: onlyIfTrashed ? ._true : nil)
        switch try await client.deleteCard(path: .init(key: cardId), query: query) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Moves your card to the trash (POST /api/v1/cards/{id}/trash) — what 刪除 does: private to
    /// everyone but you until you restore it, deleted for good after 30 days (`CardTrash`). A
    /// resonance is taken back at once; the notes on an anonymous card are deleted. Answers the
    /// card as the trash shelf shows it (`trashedAt`, `purgeAt`, `restoresTo`), and whether it
    /// changed (`false`: it was there already, its 30 days running from then). `not_found` when it
    /// isn't yours or is past its 30 days; `rate_limited` past the day's budget.
    @discardableResult
    public func trashCard(_ cardId: String) async throws -> TrashedCard {
        switch try await client.trashCard(path: .init(key: cardId)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Brings your card back from the trash as it was — its visibility, slug and place
    /// (POST /api/v1/cards/{id}/restore). `droppedResonance`: a resonance that came back on its own,
    /// no longer answering the card it answered (another of yours answers it now, or it answers
    /// this one). A card not in the trash is `changed: false`; one past its 30 days `not_found`.
    @discardableResult
    public func restoreCard(_ cardId: String) async throws -> RestoredCard {
        switch try await client.restoreCard(path: .init(key: cardId)) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// How many calls one emptying makes at most (each deletes a page of up to 50 cards), as the web's.
    public static let emptyTrashCalls = 20

    /// What emptying the trash did: how many cards went, and how many of those in it before it
    /// began are left (a page that failed, or more than `emptyTrashCalls` pages).
    public struct EmptiedTrash: Equatable, Sendable {
        public var deleted: Int
        public var remaining: Int

        public init(deleted: Int, remaining: Int) {
            self.deleted = deleted
            self.remaining = remaining
        }
    }

    /// Empties your trash for good (DELETE /api/v1/me/trash), a page at a time: the first call fixes
    /// the cut-off (now) and the next ones send it back, so a card moved to the trash meanwhile is
    /// never taken; it stops once nothing is left, or once a call deleted nothing (a card that keeps
    /// failing must not keep it going) — the web's `emptyTrash`, call for call. Each call through the
    /// slow client (`slowClient`: a page of deletes may take longer than the app's 30 s).
    public func emptyTrash() async throws -> EmptiedTrash {
        var before: Date?
        var result = EmptiedTrash(deleted: 0, remaining: 0)
        for _ in 0..<Self.emptyTrashCalls {
            let page: Components.Schemas.EmptiedTrash
            switch try await slowClient.emptyTrash(query: .init(before: before)) {
            case let .ok(r): page = try r.body.json
            case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
            case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
            case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
            case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
            }
            result.deleted += page.deleted
            result.remaining = page.remaining
            // The server's own cut-off, sent back as it gave it (to the millisecond; one it didn't write
            // as a time can't be sent back, and what was deleted stays said).
            guard page.remaining > 0, page.deleted > 0, let cutoff = ISO8601.date(page.before) else { break }
            before = cutoff
        }
        return result
    }

    /// Makes your published public card `cardId` a resonance of the card `targetId` — instead of
    /// writing a new one (POST /api/v1/cards/{targetId}/resonances). Answers your card as your card
    /// box shows it, and whether anything changed (`false`: it already answered this card). Throws
    /// `conflict` when it answers another card, or another of yours answers this one;
    /// `forbidden` without a pen name or across a block; `rate_limited` past the day's budget.
    @discardableResult
    public func resonate(with targetId: String, cardId: String) async throws -> ResonateResult {
        switch try await client.resonateWithCard(path: .init(key: targetId), body: .json(.init(cardId: cardId))) {
        case let .ok(r): return try r.body.json
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Your card `cardId` no longer answers `targetId`; the card itself stays
    /// (DELETE /api/v1/cards/{targetId}/resonances/{cardId}). Nothing to undo is no error.
    public func unresonate(from targetId: String, cardId: String) async throws {
        switch try await client.unresonateCard(path: .init(key: targetId, cardId: cardId)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Two or three tags for the draft, informed by your tag history (/api/cards/tags).
    public func suggestTags(title: String, story: String, tags: [String]) async throws -> [String] {
        struct Body: Encodable { let thoughtCore: String; let story: String; let tags: [String] }
        struct Reply: Decodable { let tags: [String] }
        let data = try await send("api/cards/tags", json: Body(thoughtCore: title, story: story, tags: tags))
        return try JSONDecoder().decode(Reply.self, from: data).tags
    }

    /// The publish panel's mirror moment: the draft's core insight, or nil (/api/cards/insight).
    public func insight(title: String, story: String) async throws -> String? {
        struct Body: Encodable { let thoughtCore: String; let story: String }
        struct Reply: Decodable { let coreInsight: String? }
        let data = try await send("api/cards/insight", json: Body(thoughtCore: title, story: story))
        return try JSONDecoder().decode(Reply.self, from: data).coreInsight
    }

    /// Uploads a (already compressed) photo through /api/upload and returns its public URL.
    /// `purpose` adds the form's `purpose` part: `"avatar"` has the server fit a profile photo
    /// (256, WebP) rather than a cover (round 5 B7); nil sends the file alone, as before.
    public func upload(_ image: Data, filename: String, contentType: String = "image/jpeg",
                       purpose: String? = nil) async throws -> URL {
        struct Reply: Decodable { let publicUrl: String }
        let boundary = "resonance-\(UUID().uuidString)"
        var body = Data()
        body.append(Data("--\(boundary)\r\nContent-Disposition: form-data; name=\"file\"; filename=\"\(filename)\"\r\nContent-Type: \(contentType)\r\n\r\n".utf8))
        body.append(image)
        if let purpose {
            body.append(Data("\r\n--\(boundary)\r\nContent-Disposition: form-data; name=\"purpose\"\r\n\r\n\(purpose)".utf8))
        }
        body.append(Data("\r\n--\(boundary)--\r\n".utf8))
        let data = try await send("api/upload", body: body, contentType: "multipart/form-data; boundary=\(boundary)")
        guard let url = URL(string: try JSONDecoder().decode(Reply.self, from: data).publicUrl) else {
            throw APIFailure.unexpected(status: 200)
        }
        return url
    }

    /// One line of /api/generate-image's progress stream (GenerateImageEvent).
    public enum IllustrationEvent: Sendable, Equatable {
        /// The model's in-progress pass, a PNG.
        case partial(Data)
        /// The stored picture.
        case done(URL)
        /// The server gave up after the stream began (the status is already 200 by then).
        case failed
    }

    /// A doodle-style illustration from the story (/api/generate-image): the
    /// model's previews while it renders, then the stored picture — NDJSON,
    /// read line by line as it arrives.
    public func illustrate(story: String) -> AsyncThrowingStream<IllustrationEvent, Error> {
        struct Body: Encodable { let story: String }
        struct Line: Decodable { let type: String; let b64: String?; let publicUrl: String? }
        let body = try? JSONEncoder().encode(Body(story: story))
        return AsyncThrowingStream { continuation in
            let task = Task {
                do {
                    let bytes = try await open("api/generate-image", body: body ?? Data(), contentType: "application/json")
                    for try await text in bytes.lines {
                        guard let line = try? JSONDecoder().decode(Line.self, from: Data(text.utf8)) else { continue }
                        switch line.type {
                        case "partial":
                            if let png = line.b64.flatMap({ Data(base64Encoded: $0) }) { continuation.yield(.partial(png)) }
                        case "done":
                            if let url = line.publicUrl.flatMap(URL.init(string:)) { continuation.yield(.done(url)) } else { continuation.yield(.failed) }
                        default:
                            continuation.yield(.failed)
                        }
                    }
                    continuation.finish()
                } catch {
                    continuation.finish(throwing: error)
                }
            }
            continuation.onTermination = { _ in task.cancel() }
        }
    }

    /// POSTs and hands back the body as it streams in, with the same token refresh as `send`.
    private func open(_ path: String, body: Data, contentType: String) async throws -> URLSession.AsyncBytes {
        var request = URLRequest(url: configuration.origin.appending(path: path))
        // Rendering can go quiet for a while between previews; the route allows two minutes.
        request.timeoutInterval = 150
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        var token = try await configuration.idToken(false)
        for attempt in 0..<2 {
            if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (bytes, response) = try await session.bytes(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401, attempt == 0, let fresh = try await configuration.idToken(true), fresh != token {
                token = fresh
                continue
            }
            if status == 401 { throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401) }
            guard (200..<300).contains(status) else { throw APIFailure.unexpected(status: status) }
            return bytes
        }
        throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401)
    }

    private func send<T: Encodable>(_ path: String, json: T) async throws -> Data {
        try await send(path, body: try JSONEncoder().encode(json), contentType: "application/json")
    }

    /// POSTs with the ID token; a rejected token is refreshed once, like the v1 middleware.
    private func send(_ path: String, body: Data, contentType: String) async throws -> Data {
        var request = URLRequest(url: configuration.origin.appending(path: path))
        request.httpMethod = "POST"
        request.setValue(contentType, forHTTPHeaderField: "Content-Type")
        request.httpBody = body
        var token = try await configuration.idToken(false)
        for attempt in 0..<2 {
            if let token { request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization") }
            let (data, response) = try await session.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            if status == 401, attempt == 0, let fresh = try await configuration.idToken(true), fresh != token {
                token = fresh
                continue
            }
            if status == 401 { throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401) }
            guard (200..<300).contains(status) else { throw APIFailure.unexpected(status: status) }
            return data
        }
        throw APIFailure(code: "unauthenticated", message: "Sign in again.", status: 401)
    }
}
