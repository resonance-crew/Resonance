import Foundation
import HTTPTypes
import OpenAPIRuntime
import ResonanceAPI
import Testing
@testable import ResonanceKit

/// Notes and messages go through the contract; the server's refusals surface as APIFailure.
struct MessagingAPITests {
    func api(_ transport: any ClientTransport) -> MessagingAPI {
        MessagingAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport))
    }

    @Test func sendsANoteToTheCard() async throws {
        let transport = StubTransport(status: .created, body: #"{"id":"n1"}"#)
        #expect(try await api(transport).sendNote(cardId: "walk", text: "thank you") == "n1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path?.hasSuffix("/notes") == true)
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["cardId"] as? String == "walk")
        #expect(json["text"] as? String == "thank you")
        // No id given: the server makes one (an older build's send).
        #expect(json["clientId"] == nil)
    }

    @Test func aNoteGoesUnderTheWritersOwnId() async throws {
        // A resend is answered with the note already left, and says so: unknown fields are tolerated.
        let transport = StubTransport(status: .created, body: #"{"id":"AbCdEfGhIjKlMnOpQrSt","duplicate":true}"#)
        #expect(try await api(transport).sendNote(cardId: "walk", text: "thank you", clientId: "AbCdEfGhIjKlMnOpQrSt") == "AbCdEfGhIjKlMnOpQrSt")
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["clientId"] as? String == "AbCdEfGhIjKlMnOpQrSt")
    }

    @Test func sendsAMessageAndAnswersItsConversationAndId() async throws {
        let transport = StubTransport(status: .created, body: #"{"conversationId":"alice_bob","id":"m1"}"#)
        let sent = try await api(transport).sendMessage(to: "bob", text: "hi", noteRef: .init(cardId: "walk", noteId: "n1"))
        #expect(sent == MessagingAPI.Sent(conversationId: "alice_bob", id: "m1"))
        #expect(transport.requests.first?.path?.hasSuffix("/messages") == true)
        // Nothing to answer and no id of its own: neither field is sent.
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["replyTo"] == nil && json["clientId"] == nil)
        #expect((json["noteRef"] as? [String: String]) == ["cardId": "walk", "noteId": "n1"])
    }

    @Test func aReplyCarriesWhatItAnswersAndTheClientsId() async throws {
        let transport = StubTransport(status: .created, body: #"{"conversationId":"alice_bob","id":"Ab3dEf6hIj9lMn0pQr2t"}"#)
        let sent = try await api(transport).sendMessage(to: "bob", text: "agreed", replyTo: "m0", clientId: "Ab3dEf6hIj9lMn0pQr2t")
        #expect(sent.id == "Ab3dEf6hIj9lMn0pQr2t")
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["to"] as? String == "bob")
        #expect(json["text"] as? String == "agreed")
        #expect(json["replyTo"] as? String == "m0")
        #expect(json["clientId"] as? String == "Ab3dEf6hIj9lMn0pQr2t")
    }

    @Test func notesWaitingForAnAnswerAreAConflict() async throws {
        let transport = StubTransport(status: .conflict, body: #"{"error":{"code":"conflict","message":"Wait for them to reply."}}"#)
        let failure = await #expect(throws: APIFailure.self) { try await api(transport).sendNote(cardId: "walk", text: "a fourth note") }
        #expect(failure?.isConflict == true)
        #expect(failure?.status == 409)
    }

    @Test func aBlockIsAFailureWithItsMessage() async throws {
        let transport = StubTransport(status: .forbidden, body: #"{"error":{"code":"blocked","message":"You cannot message this person."}}"#)
        await #expect(throws: APIFailure(code: "blocked", message: "You cannot message this person.", status: 403)) {
            try await api(transport).sendMessage(to: "bob", text: "hi")
        }
    }

    /// A picture is uploaded as the contract's form — the file, whom it is for, the message's own
    /// client id — and answered with its id and size as kept.
    @Test func aPictureIsUploadedWithWhomItIsForAndTheMessagesId() async throws {
        let transport = RawTransport(status: .created, body: Data(#"{"id":"AbCdEfGhIjKlMnOpQrSt","width":1536,"height":2048}"#.utf8))
        let jpeg = Data([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10])
        let kept = try await api(transport).uploadChatImage(jpeg, contentType: "image/jpeg", filename: "picture.jpg", to: "bob",
                                                            clientId: "AbCdEfGhIjKlMnOpQrSt")
        #expect(kept == ChatImage(id: "AbCdEfGhIjKlMnOpQrSt", width: 1536, height: 2048))
        let request = try #require(transport.requests.first)
        #expect(request.method == .post)
        #expect(request.path?.hasSuffix("/chat-images") == true)
        #expect(request.headerFields[.contentType]?.hasPrefix("multipart/form-data; boundary=") == true)
        let body = try #require(transport.bodies.first)
        let form = String(decoding: body, as: UTF8.self)
        #expect(form.contains(#"name="file""#) && form.contains(#"filename="picture.jpg""#))
        #expect(form.contains(#"name="to""#) && form.contains("\r\n\r\nbob\r\n"))
        #expect(form.contains(#"name="clientId""#) && form.contains("\r\n\r\nAbCdEfGhIjKlMnOpQrSt\r\n"))
        // The bytes as they were picked.
        #expect(body.range(of: jpeg) != nil)
    }

    @Test func aPictureRefusedIsAFailureWithItsStatus() async throws {
        let refused = RawTransport(status: .badRequest, body: Data(#"{"error":{"code":"invalid_request","message":"Not a picture that can be sent."}}"#.utf8))
        let failure = await #expect(throws: APIFailure.self) {
            try await api(refused).uploadChatImage(Data([1]), contentType: "image/jpeg", filename: "picture.jpg", to: "bob",
                                                   clientId: "AbCdEfGhIjKlMnOpQrSt")
        }
        #expect(failure?.status == 400)
        // Past the day's budget: a failure that will pass (the outbox stops its line rather than dropping the message).
        let spent = RawTransport(status: .tooManyRequests, body: Data(#"{"error":{"code":"rate_limited","message":"Too many."}}"#.utf8))
        let limit = await #expect(throws: APIFailure.self) {
            try await api(spent).uploadChatImage(Data([1]), contentType: "image/jpeg", filename: "picture.jpg", to: "bob",
                                                 clientId: "AbCdEfGhIjKlMnOpQrSt")
        }
        #expect(limit?.status == 429)
        #expect(!Outbox.refusedByServer(limit!))
        #expect(Outbox.refusedByServer(failure!))
    }

    @Test func aMessageNamesItsPicture() async throws {
        let transport = StubTransport(status: .created, body: #"{"conversationId":"alice_bob","id":"AbCdEfGhIjKlMnOpQrSt"}"#)
        _ = try await api(transport).sendMessage(to: "bob", text: "", clientId: "AbCdEfGhIjKlMnOpQrSt", image: "AbCdEfGhIjKlMnOpQrSt")
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["image"] as? String == "AbCdEfGhIjKlMnOpQrSt")
        #expect(json["text"] as? String == "")
        #expect(json["cardRef"] == nil)
    }

    /// A picture is read back with the viewer's credentials: the thread's size or as kept, its bytes as they came.
    @Test func aPictureIsReadBackAtTheSizeAsked() async throws {
        let webp = Data("RIFF....WEBPVP8 ".utf8)
        let transport = RawTransport(status: .ok, body: webp, contentType: "image/webp")
        #expect(try await api(transport).chatImage("p1", thumb: true) == webp)
        #expect(try await api(transport).chatImage("p1", thumb: false) == webp)
        #expect(transport.requests.map(\.bare) == ["/chat-images/p1", "/chat-images/p1"])
        #expect(transport.requests.allSatisfy { $0.method == .get })
        #expect(transport.requests.first?.query("size") == "thumb")
        #expect(transport.requests.last?.query("size") == "full")
        let missing = RawTransport(status: .notFound, body: Data(#"{"error":{"code":"not_found","message":"No such picture."}}"#.utf8))
        let failure = await #expect(throws: APIFailure.self) { try await api(missing).chatImage("p9", thumb: true) }
        #expect(failure?.isNotFound == true)
    }

    @Test func deletesAConversationOnTheServer() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).deleteConversation("alice_bob")
        #expect(transport.requests.first?.method == .delete)
        #expect(transport.requests.first?.path?.hasSuffix("/conversations/alice_bob") == true)
    }

    @Test func aConversationTheViewerIsntInIsNotFound() async throws {
        let transport = StubTransport(status: .notFound, body: #"{"error":{"code":"not_found","message":"No such conversation."}}"#)
        await #expect(throws: APIFailure.self) { try await api(transport).deleteConversation("bob_carol") }
    }

    /// Round 16 §4: a reaction is the stored id, put on the message under its conversation.
    @Test func aReactionIsPutOnTheMessage() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).setReaction("moved", pairId: "alice_bob", messageId: "m1")
        let request = try #require(transport.requests.first)
        #expect(request.method == .put)
        #expect(request.path?.hasSuffix("/conversations/alice_bob/messages/m1/reaction") == true)
        let json = try #require(transport.sentJSON.first ?? nil)
        #expect(json["reaction"] as? String == "moved")
    }

    @Test func aReactionTheContractDoesntKnowIsNeverSent() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        let failure = await #expect(throws: APIFailure.self) { try await api(transport).setReaction("wave", pairId: "alice_bob", messageId: "m1") }
        #expect(failure?.code == "invalid_request")
        #expect(transport.requests.isEmpty)
    }

    @Test func aLetterNotYetAnsweredTakesNoReaction() async throws {
        let transport = StubTransport(status: .forbidden, body: #"{"error":{"code":"forbidden","message":"You can react once you are connected."}}"#)
        let failure = await #expect(throws: APIFailure.self) { try await api(transport).setReaction("heart", pairId: "alice_bob", messageId: "m1") }
        #expect(failure?.status == 403)
    }

    @Test func aReactionIsTakenBack() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).removeReaction(pairId: "alice_bob", messageId: "m1")
        #expect(transport.requests.first?.method == .delete)
        #expect(transport.requests.first?.path?.hasSuffix("/conversations/alice_bob/messages/m1/reaction") == true)
    }

    /// Round 16 §3: unsending posts to the message; past the day it is a conflict the thread says is too late.
    @Test func aMessageIsUnsent() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).unsendMessage(pairId: "alice_bob", messageId: "m1")
        #expect(transport.requests.first?.method == .post)
        #expect(transport.requests.first?.path?.hasSuffix("/conversations/alice_bob/messages/m1/unsend") == true)
    }

    @Test func tooLateToUnsendIsAConflict() async throws {
        let transport = StubTransport(status: .conflict, body: #"{"error":{"code":"conflict","message":"This message can no longer be unsent."}}"#)
        let failure = await #expect(throws: APIFailure.self) { try await api(transport).unsendMessage(pairId: "alice_bob", messageId: "m1") }
        #expect(failure?.isConflict == true)
    }
}

/// A transport that keeps each request's raw body and answers with the bytes it is given.
final class RawTransport: ClientTransport, @unchecked Sendable {
    let status: HTTPResponse.Status
    let body: Data
    let contentType: String
    private let lock = NSLock()
    private var _requests: [HTTPRequest] = []
    private var _bodies: [Data] = []
    var requests: [HTTPRequest] { lock.withLock { _requests } }
    var bodies: [Data] { lock.withLock { _bodies } }

    init(status: HTTPResponse.Status, body: Data, contentType: String = "application/json") {
        self.status = status
        self.body = body
        self.contentType = contentType
    }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var sent = Data()
        if let body { sent = try await Data(collecting: body, upTo: 8 << 20) }
        lock.withLock {
            _requests.append(request)
            _bodies.append(sent)
        }
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = contentType
        return (response, HTTPBody(self.body))
    }
}
