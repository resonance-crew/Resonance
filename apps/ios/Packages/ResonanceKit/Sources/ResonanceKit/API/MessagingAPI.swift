import Foundation
import OpenAPIRuntime
import ResonanceAPI

/// Notes and messages — the writes that reach another person, so they go
/// through the server (POST /api/v1/notes, /api/v1/messages), which re-checks
/// connections and blocks and rings the right bell — reacting to a message and unsending one
/// (round 16: PUT/DELETE …/messages/{id}/reaction, POST …/messages/{id}/unsend), no longer sharing a 私人卡
/// (DELETE …/shared-cards/{cardId}), deleting a conversation
/// (DELETE /api/v1/conversations/{pair}, both people's at once) and the pictures sent in a
/// conversation (POST /api/v1/chat-images, read back with GET
/// /api/v1/chat-images/{id}: for the two people of the conversation only, so
/// never through a plain image loader). Reading conversations is the
/// participants' own data and stays a live Firestore listener.
public struct MessagingAPI: Sendable {
    let client: Client

    public init(client: Client) {
        self.client = client
    }

    /// A note to a card's author (the server finds the author); returns its id. Notes still waiting for the
    /// author's answer, three of them, throw `conflict` (wait for their reply). `clientId` is the writer's
    /// own id for it (see `NoteAttempt`), which the server makes the note's id — sending the same one again
    /// after an answer was lost is answered with the note already left, instead of leaving it twice.
    public func sendNote(cardId: String, text: String, clientId: String? = nil) async throws -> String {
        switch try await client.sendNote(body: .json(.init(cardId: cardId, text: text, clientId: clientId))) {
        case let .created(r): return try r.body.json.id
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// The note a message answers.
    public struct NoteRef: Sendable, Equatable, Hashable {
        public let cardId: String
        public let noteId: String
        public init(cardId: String, noteId: String) {
            self.cardId = cardId
            self.noteId = noteId
        }
    }

    /// What the server answered to a message: the conversation it is in and its document's id.
    public struct Sent: Sendable, Equatable {
        public let conversationId: String
        public let id: String
    }

    /// A message to someone you're connected with. `replyTo` names the message of the conversation it
    /// answers (the server keeps a snapshot of it on the reply); `clientId` (16–64 of `[A-Za-z0-9_-]`)
    /// becomes the message's document id, so sending the same message again after a lost answer
    /// finds it instead of writing it twice. `image` is a picture uploaded for this conversation
    /// (`uploadChatImage`), sent with the words — `text` may then be empty; never beside a card.
    @discardableResult
    public func sendMessage(to userId: String, text: String, cardRef: String? = nil, noteRef: NoteRef? = nil,
                            replyTo: String? = nil, clientId: String? = nil, image: String? = nil) async throws -> Sent {
        let body = Components.Schemas.SendMessageRequest(
            to: userId, text: text, cardRef: cardRef, image: image,
            noteRef: noteRef.map { .init(value1: .init(cardId: $0.cardId, noteId: $0.noteId)) },
            replyTo: replyTo, clientId: clientId)
        switch try await client.sendMessage(body: .json(body)) {
        case let .created(r):
            let sent = try r.body.json
            return Sent(conversationId: sent.conversationId, id: sent.id)
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Keeps a picture to send to `userId` (POST /api/v1/chat-images): the bytes (JPEG, PNG, WebP or
    /// GIF, at most 4 MB), and `clientId` — the message's own, which the server makes the picture's
    /// id, so uploading it again after a lost answer finds the one already kept. Answers its id and
    /// its size as kept. Refused as a message would be (403 `forbidden` / `blocked`), 400 for a file
    /// that isn't a picture it takes, 429 past the day's budget.
    public func uploadChatImage(_ data: Data, contentType: String, filename: String, to userId: String,
                                clientId: String) async throws -> ChatImage {
        let file = MultipartPart(payload: Operations.UploadChatImage.Input.Body.MultipartFormPayload.FilePayload(body: HTTPBody(data)),
                                 filename: filename)
        let parts: [Operations.UploadChatImage.Input.Body.MultipartFormPayload] = [
            .file(file),
            .to(.init(payload: .init(body: HTTPBody(userId)))),
            .clientId(.init(payload: .init(body: HTTPBody(clientId)))),
        ]
        switch try await client.uploadChatImage(body: .multipartForm(MultipartBody(parts))) {
        case let .created(r):
            let kept = try r.body.json
            return ChatImage(id: kept.id, width: kept.width, height: kept.height)
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Deletes a conversation for both of its people (DELETE /api/v1/conversations/{pair}): its messages, then the
    /// conversation, on the server. One already gone is nothing; one the viewer isn't in is `not_found`.
    public func deleteConversation(_ pairId: String) async throws {
        switch try await client.deleteConversation(path: .init(pair: pairId)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Answers a message of the conversation `pairId` with a reaction (PUT …/messages/{id}/reaction): one per
    /// person per message, a second replacing the first. `reaction` is the stored id (`heart`, `moved`,
    /// `laugh`, `hug`, `thumbs`); one the contract doesn't know is `invalid_request` without asking.
    /// Quiet on the server's side: no bell, no push, no unread. 403 `forbidden` / `blocked` for a letter
    /// not yet answered, no pen name or a block; 404 for a message gone or unsent; 429 past the day's budget.
    public func setReaction(_ reaction: String, pairId: String, messageId: String) async throws {
        guard let value = Components.Schemas.Reaction(rawValue: reaction) else {
            throw APIFailure(code: "invalid_request", message: "Not a reaction.", status: 400)
        }
        switch try await client.setReaction(path: .init(pair: pairId, messageId: messageId), body: .json(.init(reaction: value))) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .forbidden(r): throw APIFailure(try r.body.json, status: 403)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Takes the viewer's reaction to a message back (DELETE …/reaction); one already gone is nothing.
    public func removeReaction(pairId: String, messageId: String) async throws {
        switch try await client.removeReaction(path: .init(pair: pairId, messageId: messageId)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Unsends one of the viewer's messages (POST …/messages/{id}/unsend): it becomes a line saying it was
    /// unsent, for both people, and the quotes of it with it. Already unsent is nothing. A note copied from a
    /// card is 400; past 24 hours 409 `conflict` (too late); someone else's message 404; 429 past the budget.
    public func unsendMessage(pairId: String, messageId: String) async throws {
        switch try await client.unsendMessage(path: .init(pair: pairId, messageId: messageId)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .conflict(r): throw APIFailure(try r.body.json, status: 409)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// Stops sharing the viewer's 私人卡 `cardId` in the conversation `pairId` (停止分享, DELETE
    /// …/conversations/{pair}/shared-cards/{cardId}): every message of theirs there that shares it stops being
    /// the other person's pass to read it — at any time. The messages stay; nothing left to stop is nothing.
    /// A conversation not theirs is 404; 429 past the budget.
    public func stopSharingCard(pairId: String, cardId: String) async throws {
        switch try await client.stopSharingCard(path: .init(pair: pairId, cardId: cardId)) {
        case .noContent: return
        case let .badRequest(r): throw APIFailure(try r.body.json, status: 400)
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .tooManyRequests(r): throw APIFailure(try r.body.json, status: 429)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }

    /// The largest picture read back (the full size is at most 2048 px as WebP, well under this).
    public static let maxPictureBytes = 16 * 1024 * 1024

    /// A picture sent in one of the viewer's conversations (GET /api/v1/chat-images/{id}): `thumb` the
    /// thread's size (at most 960 px), else as kept. Its bytes never change, so the account's HTTP
    /// cache keeps them. `not_found` for anything the viewer may not read — never saying why.
    public func chatImage(_ id: String, thumb: Bool) async throws -> Data {
        switch try await client.getChatImage(path: .init(id: id), query: .init(size: thumb ? .thumb : .full)) {
        case let .ok(r):
            switch r.body {
            case let .imageWebp(body): return try await Data(collecting: body, upTo: Self.maxPictureBytes)
            }
        case let .unauthorized(r): throw APIFailure(try r.body.json, status: 401)
        case let .notFound(r): throw APIFailure(try r.body.json, status: 404)
        case let .undocumented(status, _): throw APIFailure.unexpected(status: status)
        }
    }
}
