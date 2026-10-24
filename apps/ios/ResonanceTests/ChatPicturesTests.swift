import Foundation
import HTTPTypes
import ImageIO
import OpenAPIRuntime
import ResonanceAPI
import ResonanceKit
import Testing
import UIKit
import UniformTypeIdentifiers
@testable import Resonance

/// Pictures in chat (round 7 §4): what a picture from the library is made into before it is sent,
/// the size a bubble gives it before it arrives, how pictures are read with the account's credentials
/// and kept, the outbox's two calls for a picture message, and the conversation list's line.
@MainActor @Suite struct ChatPicturesTests {
    // MARK: Readying a picture

    private func png(_ width: Int, _ height: Int) -> Data {
        let format = UIGraphicsImageRendererFormat()
        format.scale = 1
        return UIGraphicsImageRenderer(size: CGSize(width: width, height: height), format: format).pngData { context in
            UIColor.orange.setFill()
            context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        }
    }

    /// Bytes written by ImageIO: a JPEG with an EXIF orientation, or an animated GIF.
    private func encoded(_ type: UTType, frames: Int = 1, width: Int, height: Int, orientation: Int? = nil) throws -> Data {
        let data = NSMutableData()
        let destination = try #require(CGImageDestinationCreateWithData(data, type.identifier as CFString, frames, nil))
        let image = try #require(UIImage(data: png(width, height))?.cgImage)
        for _ in 0..<frames {
            let properties = orientation.map { [kCGImagePropertyOrientation: $0] as CFDictionary }
            CGImageDestinationAddImage(destination, image, properties)
        }
        #expect(CGImageDestinationFinalize(destination))
        return data as Data
    }

    @Test func aLargePictureGoesAsAJPEGOfTheServersSize() throws {
        let picked = try #require(ChatPictures.prepare(png(3000, 1500)))
        #expect(picked.upload.contentType == "image/jpeg")
        #expect(picked.upload.width == 2048 && picked.upload.height == 1024)
        #expect(picked.upload.data.starts(with: [0xFF, 0xD8]))
        #expect(picked.upload.data.count <= ChatPictures.maxBytes)
        #expect(picked.preview.cgImage?.width == 2048)
    }

    @Test func aSmallPictureKeepsItsSize() throws {
        let picked = try #require(ChatPictures.prepare(png(800, 600)))
        #expect(picked.upload.width == 800 && picked.upload.height == 600)
        #expect(picked.upload.contentType == "image/jpeg")
    }

    /// A photo taken turned (its EXIF orientation) goes upright: what the thread shows is how it was seen.
    @Test func aTurnedPhotoGoesUpright() throws {
        let turned = try encoded(.jpeg, width: 400, height: 300, orientation: 6)
        let picked = try #require(ChatPictures.prepare(turned))
        #expect(picked.upload.width == 300 && picked.upload.height == 400)
    }

    /// A GIF that fits goes as it is, so it stays animated; its size is its own.
    @Test func aGIFThatFitsGoesAsItIs() throws {
        let gif = try encoded(.gif, frames: 3, width: 120, height: 90)
        #expect(ChatPictures.isGIF(gif))
        let picked = try #require(ChatPictures.prepare(gif))
        #expect(picked.upload.contentType == "image/gif")
        #expect(picked.upload.data == gif)
        #expect(picked.upload.width == 120 && picked.upload.height == 90)
        #expect(picked.upload.filename == "picture.gif")
    }

    @Test func bytesThatAreNoPictureAreRefused() {
        #expect(ChatPictures.prepare(Data("not a picture".utf8)) == nil)
        #expect(ChatPictures.prepare(Data()) == nil)
    }

    // MARK: The bubble's shape

    /// As wide as a bubble may be, at most 320 tall, the shown shape held between 1:2 and 2:1.
    @Test func aPictureTakesItsShapeBeforeItArrives() {
        #expect(MessagePictureSize.of(width: 1000, height: 1000, maxWidth: 240) == CGSize(width: 240, height: 240))
        // A wide panorama: 2:1 at most, cover-cropped past it.
        #expect(MessagePictureSize.of(width: 4000, height: 1000, maxWidth: 240) == CGSize(width: 240, height: 120))
        // A tall screenshot: 1:2 at most, and never taller than 320.
        #expect(MessagePictureSize.of(width: 1000, height: 4000, maxWidth: 240) == CGSize(width: 160, height: 320))
        // A portrait photo (3:4) on a phone.
        #expect(MessagePictureSize.of(width: 1536, height: 2048, maxWidth: 240) == CGSize(width: 240, height: 320))
        // A tablet's wider bubble: the height is the limit.
        #expect(MessagePictureSize.of(width: 1000, height: 1000, maxWidth: 520) == CGSize(width: 320, height: 320))
        #expect(MessagePictureSize.of(width: 3000, height: 2000, maxWidth: 520) == CGSize(width: 480, height: 320))
        // A size the message doesn't say: square.
        #expect(MessagePictureSize.of(width: 0, height: 0, maxWidth: 240) == CGSize(width: 240, height: 240))
    }

    // MARK: Reading pictures

    /// One read per picture and size however many bubbles ask at once; a picture sent from here is at
    /// hand without asking; one that couldn't be read is asked for again next time; another account
    /// keeps nothing of this one's.
    @Test func picturesAreReadOnceKeptAndAskedAgainOnlyWhenTheyCouldntBe() async throws {
        let bytes = png(40, 30)
        let failing = Flag()
        let asked = Calls<String>()
        let store = ChatImageStore { id, size in
            await asked.record("\(id)|\(size.rawValue)")
            try await Task.sleep(for: .milliseconds(30))
            if failing.on { throw APIFailure(code: "not_found", message: "No such picture.", status: 404) }
            return bytes
        }
        async let first = store.image("p1", .thumb)
        async let second = store.image("p1", .thumb)
        let (a, b) = await (first, second)
        #expect(a != nil && b != nil)
        #expect(await asked.all == ["p1|thumb"])
        #expect(store.cached("p1", .thumb) != nil)
        // The full size is its own read.
        #expect(store.cached("p1", .full) == nil)
        _ = await store.image("p1", .full)
        #expect(await asked.all == ["p1|thumb", "p1|full"])

        // Sent from here: drawn from the device at either size, nothing asked.
        let local = try #require(UIImage(data: bytes))
        store.keep(local, for: "AbCdEfGhIjKlMnOpQrSt")
        #expect(store.cached("AbCdEfGhIjKlMnOpQrSt", .thumb) === local)
        #expect(await store.image("AbCdEfGhIjKlMnOpQrSt", .full) === local)
        #expect(await asked.all.count == 2)

        failing.on = true
        #expect(await store.image("p2", .thumb) == nil)
        #expect(await store.image("p2", .thumb) == nil)
        #expect(await asked.all.filter { $0 == "p2|thumb" }.count == 2)

        store.clear()
        #expect(store.cached("p1", .thumb) == nil)
        #expect(store.cached("AbCdEfGhIjKlMnOpQrSt", .full) == nil)
    }

    // MARK: Sending

    /// A picture message is two calls in its turn: the picture under the message's client id, then the
    /// message naming it — and a retry after the message's own call failed doesn't upload it again.
    @Test func aPictureIsUploadedThenTheMessageNamesIt() async throws {
        let server = ChatServer()
        let outboxes = ChatOutboxes(messaging: { MessagingAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!,
                                                                              transport: server)) }, sent: {})
        let box = outboxes.of("alice_bob", to: "bob")
        let picture = Outbox.Picture(data: Data([0xFF, 0xD8, 0xFF]), contentType: "image/jpeg", width: 1200, height: 900)
        server.failSend.on = true
        box.enqueue(Outbox.Outgoing(clientId: "AbCdEfGhIjKlMnOpQrSt", senderId: "alice", text: "看", picture: picture))
        #expect(await eventually { box.entries.first?.status == .failed })
        #expect(server.calls == ["uploadChatImage", "sendMessage"])

        server.failSend.on = false
        box.retry("AbCdEfGhIjKlMnOpQrSt")
        #expect(await eventually { box.entries.first?.status == .sent })
        // Kept by the server already: not uploaded again.
        #expect(server.calls == ["uploadChatImage", "sendMessage", "sendMessage"])
        #expect(server.sentImage == "AbCdEfGhIjKlMnOpQrSt")
        #expect(server.sentText == "看")
        #expect(server.uploadedFor == "bob")

        // A message of words alone uploads nothing.
        box.enqueue(Outbox.Outgoing(clientId: "ZyXwVuTsRqPoNmLkJiHg", senderId: "alice", text: "hi"))
        #expect(await eventually { box.entries.last?.status == .sent })
        #expect(server.calls.filter { $0 == "uploadChatImage" }.count == 1)
        #expect(server.sentImage == nil)
        outboxes.clear()
    }

    /// The server's refusal of the picture (not a picture it takes) fails that message alone.
    @Test func aRefusedPictureFailsItsMessageAlone() async throws {
        let server = ChatServer()
        server.refuseUpload.on = true
        let outboxes = ChatOutboxes(messaging: { MessagingAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!,
                                                                              transport: server)) }, sent: {})
        let box = outboxes.of("alice_bob", to: "bob")
        let picture = Outbox.Picture(data: Data([1, 2, 3]), contentType: "image/jpeg", width: 10, height: 10)
        box.enqueue(Outbox.Outgoing(clientId: "AbCdEfGhIjKlMnOpQrSt", senderId: "alice", text: "", picture: picture))
        box.enqueue(Outbox.Outgoing(clientId: "ZyXwVuTsRqPoNmLkJiHg", senderId: "alice", text: "and this"))
        #expect(await eventually { box.entries.count == 2 && box.entries[1].status == .sent })
        #expect(box.entries[0].status == .failed && box.entries[0].refused)
        // Only the words went: the refused picture's message was never sent.
        #expect(server.calls == ["uploadChatImage", "sendMessage"])
        #expect(server.sentText == "and this")
        outboxes.clear()
    }

    // MARK: The conversation list

    @Test func aPictureWithoutWordsSaysItWasSent() {
        #expect(ConversationsScreen.preview(text: "", image: true, fromMe: false) == L10n.Messages.imageShared)
        #expect(ConversationsScreen.preview(text: "", image: true, fromMe: true) == L10n.Messages.youPrefix + L10n.Messages.imageShared)
        #expect(ConversationsScreen.preview(text: "看這張", image: true, fromMe: false) == "看這張")
        #expect(ConversationsScreen.preview(text: "hi", image: false, fromMe: true) == L10n.Messages.youPrefix + "hi")
        #expect(ConversationsScreen.preview(text: nil, image: false, fromMe: false) == L10n.Messages.noMessagesYet)
    }
}

/// The two chat calls as the server answers them: the picture kept under its client id, the message
/// sent (or failing on its way, or the picture refused).
final class ChatServer: ClientTransport, @unchecked Sendable {
    let failSend = Flag()
    let refuseUpload = Flag()
    private let lock = NSLock()
    private var _calls: [String] = []
    private var _sentImage: String?
    private var _sentText: String?
    private var _uploadedFor: String?
    var calls: [String] { lock.withLock { _calls } }
    var sentImage: String? { lock.withLock { _sentImage } }
    var sentText: String? { lock.withLock { _sentText } }
    var uploadedFor: String? { lock.withLock { _uploadedFor } }

    func send(_ request: HTTPRequest, body: HTTPBody?, baseURL: URL, operationID: String) async throws -> (HTTPResponse, HTTPBody?) {
        var sent = Data()
        if let body { sent = try await Data(collecting: body, upTo: 1 << 20) }
        lock.withLock { _calls.append(operationID) }
        switch operationID {
        case "uploadChatImage":
            if refuseUpload.on {
                return answer(.badRequest, #"{"error":{"code":"invalid_request","message":"Not a picture that can be sent."}}"#)
            }
            let form = String(decoding: sent, as: UTF8.self)
            lock.withLock { _uploadedFor = form.components(separatedBy: "name=\"to\"").last?.components(separatedBy: "\r\n\r\n").dropFirst().first?
                .components(separatedBy: "\r\n").first }
            let id = form.components(separatedBy: "name=\"clientId\"").last?.components(separatedBy: "\r\n\r\n").dropFirst().first?
                .components(separatedBy: "\r\n").first ?? "p1"
            return answer(.created, #"{"id":"\#(id)","width":1200,"height":900}"#)
        case "sendMessage":
            if failSend.on { throw URLError(.notConnectedToInternet) }
            let json = (try? JSONSerialization.jsonObject(with: sent)) as? [String: Any]
            lock.withLock {
                _sentImage = json?["image"] as? String
                _sentText = json?["text"] as? String
            }
            return answer(.created, #"{"conversationId":"alice_bob","id":"\#(json?["clientId"] as? String ?? "m1")"}"#)
        default:
            return answer(.notFound, #"{"error":{"code":"not_found","message":"No."}}"#)
        }
    }

    private func answer(_ status: HTTPResponse.Status, _ json: String) -> (HTTPResponse, HTTPBody?) {
        var response = HTTPResponse(status: status)
        response.headerFields[.contentType] = "application/json"
        return (response, HTTPBody(json))
    }
}
