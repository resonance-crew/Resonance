import Foundation
import ResonanceAPI

/// The reads that were Firestore listeners before the middleware decouple (Phase 2, `features.apiInbox` and
/// `features.apiBell`): the conversations list, one conversation, a thread's messages by neutral cursors, reading a
/// thread, the bell and reading its rows. Each GET answers with an ETag, so asked again (a signal moved, the 60 s
/// pull) through the account's HTTP cache it costs a 304 when nothing changed (`APIHTTPCache`).
public struct InboxAPI: Sendable {
    public typealias Conversation = Components.Schemas.Conversation
    public typealias ThreadMessage = Components.Schemas.ThreadMessage
    public typealias BellItem = Components.Schemas.BellItem
    public typealias Author = Components.Schemas.Author

    /// A page of a thread, newest first, with where to go on from it.
    public struct MessagePage: Sendable {
        public let messages: [ThreadMessage]
        /// The page before the oldest of them; nil at the beginning of the conversation.
        public let olderCursor: String?
        public let newerCursor: String?
        /// An `after` page was full: more came after it.
        public let hasNewer: Bool
    }

    /// The bell's newest rows and the people they name.
    public struct BellPage: Sendable {
        public let items: [BellItem]
        public let people: [Author]
    }

    /// How many conversation pages the list reads at most (50 each).
    public static let conversationPages = 4

    let client: Client

    public init(client: Client) {
        self.client = client
    }

    /// The account's conversations, the most recently active first (up to `conversationPages` pages).
    public func conversations() async throws -> [Conversation] {
        var all: [Conversation] = []
        var token: String?
        for _ in 0..<Self.conversationPages {
            switch try await client.listConversations(query: .init(pageToken: token)) {
            case let .ok(r):
                let page = try r.body.json
                all += page.conversations
                token = page.nextPageToken
            case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
            case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
            case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
            }
            if token == nil { break }
        }
        return all
    }

    /// One conversation, or nil when there is none for this reader (never made, deleted, or not theirs: the
    /// server's one 404 for all three).
    public func conversation(_ pair: String) async throws -> Conversation? {
        switch try await client.getConversation(path: .init(pair: pair)) {
        case let .ok(r): return try r.body.json
        case .notFound: return nil
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// A page of messages: the newest `limit` with no cursor, the page older than `before`, or what came `after`.
    /// Nil when there is no conversation for this reader.
    public func messages(_ pair: String, before: String? = nil, after: String? = nil, limit: Int) async throws -> MessagePage? {
        switch try await client.listMessages(path: .init(pair: pair), query: .init(before: before, after: after, limit: limit)) {
        case let .ok(r):
            let page = try r.body.json
            return MessagePage(messages: page.messages, olderCursor: page.olderCursor, newerCursor: page.newerCursor,
                               hasNewer: page.hasNewer)
        case .notFound: return nil
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// The viewer read the thread: their unread count in it goes to 0.
    public func markRead(_ pair: String) async throws {
        switch try await client.markConversationRead(path: .init(pair: pair)) {
        case .noContent, .notFound: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// The bell's newest `limit` rows (the listener read 50).
    public func bell(limit: Int = 50) async throws -> BellPage {
        switch try await client.getBell(query: .init(limit: limit)) {
        case let .ok(r):
            let page = try r.body.json
            return BellPage(items: page.items, people: page.people)
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Bell rows read, by id (at most 50 at once).
    public func markBellRead(_ ids: [String]) async throws {
        guard !ids.isEmpty else { return }
        for start in stride(from: 0, to: ids.count, by: 50) {
            let chunk = Array(ids[start..<min(start + 50, ids.count)])
            switch try await client.markNotificationsRead(body: .json(.init(ids: chunk))) {
            case .noContent: continue
            case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
            case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
            case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
            case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
            }
        }
    }
}

extension ChatMessage {
    /// A message as GET …/messages answers it, drawn as its document was: the answer carries the document's fields
    /// under the same names, so it is read by the same rules (`from(id:fields:sentAt:origin:)`).
    public static func from(api message: Components.Schemas.ThreadMessage, origin: URL) -> ChatMessage {
        let fields = (try? JSONEncoder().encode(message)).flatMap { try? JSONSerialization.jsonObject(with: $0) as? [String: Any] } ?? [:]
        return from(id: message.id, fields: fields, sentAt: ISO8601.date(message.sentAt) ?? Date(), origin: origin)
    }
}
