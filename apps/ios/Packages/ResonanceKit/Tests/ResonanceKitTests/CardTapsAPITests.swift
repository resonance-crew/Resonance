import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import ResonanceAPI
@testable import ResonanceKit

/// Round 26: the tap (PUT / DELETE /cards/{id}/tap), who tapped (GET /cards/{id}/taps) and the reading report
/// (POST /cards/{id}/reading) speak the contract, and a refusal carries its status for the page to act on.
@Suite struct CardTapsAPITests {
    func api(_ transport: StubTransport) -> ReadingAPI {
        ReadingAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport,
                                  middlewares: [RequiredNullsMiddleware()]))
    }

    @Test func tappingPutsAndTakingBackDeletes() async throws {
        let transport = StubTransport(body: #"{"on":true,"changed":true}"#)
        #expect(try await api(transport).tap("c1") == true)
        #expect(transport.requests.first?.method == .put)
        #expect(transport.requests.first?.bare.hasSuffix("/cards/c1/tap") == true)
        transport.body = #"{"on":false,"changed":true}"#
        #expect(try await api(transport).untap("c1") == false)
        #expect(transport.requests.last?.method == .delete)
    }

    @Test func aBlockedTapIsAFailureWithItsStatus() async throws {
        let transport = StubTransport(status: .forbidden, body: #"{"error":{"code":"blocked","message":"Blocked."}}"#)
        let failure = await #expect(throws: APIFailure.self) { try await api(transport).tap("c1") }
        #expect(failure?.status == 403)
    }

    @Test func theListReadsItsPeopleAndPasses() async throws {
        let transport = StubTransport(body: """
        {"people":[{"author":{"id":"dora","handle":"dora","initials":"DO","accentColor":"oklch(90% 0.05 60)",
          "avatarUrl":null,"avatarSeed":"3","verified":false,"region":null},"note":{"excerpt":"謝謝你"}}],
         "nextPageToken":"p2"}
        """)
        let list = try await api(transport).taps("c1", pageToken: "p1")
        #expect(list.people.first?.author.handle == "dora")
        #expect(list.people.first?.note?.value1.excerpt == "謝謝你")
        #expect(list.nextPageToken == "p2")
        #expect(transport.requests.first?.query("pageToken") == "p1")
    }

    /// Round 27 §P4: the pick is a PUT to …/tap/passage with the passage's id (or null to clear it), and a refusal
    /// (409: the tap went; 400: not one of the card's passages now) carries its status for the page to read again.
    @Test func aPickPutsItsPassageAndAClearSendsNull() async throws {
        let transport = StubTransport(body: #"{"passage":"8b3a1c4d"}"#)
        #expect(try await api(transport).setTapPassage("c1", passage: "8b3a1c4d") == "8b3a1c4d")
        #expect(transport.requests.first?.method == .put)
        #expect(transport.requests.first?.bare.hasSuffix("/cards/c1/tap/passage") == true)
        #expect(transport.sentJSON.first??["passage"] as? String == "8b3a1c4d")
        transport.body = #"{"passage":null}"#
        #expect(try await api(transport).setTapPassage("c1", passage: nil) == nil)
        let cleared = try #require(transport.sentJSON.last ?? nil)
        #expect(cleared.keys.contains("passage") && cleared["passage"] is NSNull)
    }

    /// The generated encoder drops a nil optional; the contract's required `passage` must still reach the server as
    /// null, and a body with every field already there is sent as it was.
    @Test func aRequiredNullIsWrittenBack() throws {
        let filled = RequiredNulls.fill(Data("{}".utf8), keys: ["passage"])
        let object = try #require(try JSONSerialization.jsonObject(with: filled) as? [String: Any])
        #expect(object["passage"] is NSNull)
        let kept = Data(#"{"passage":"14fecaaf"}"#.utf8)
        #expect(RequiredNulls.fill(kept, keys: ["passage"]) == kept)
        #expect(RequiredNulls.fields["setTapPassage"] == ["passage"])
    }

    @Test func aPickRefusedCarriesItsStatus() async throws {
        let transport = StubTransport(status: .conflict, body: #"{"error":{"code":"conflict","message":"Resonate first."}}"#)
        let failure = await #expect(throws: APIFailure.self) { try await api(transport).setTapPassage("c1", passage: "14fecaaf") }
        #expect(failure?.status == 409)
    }

    @Test func theCardsPassagesAndTheReadersPickAreRead() throws {
        let json = #"{"mine":true,"faces":[],"more":false,"mayNote":true,"passages":[{"id":"14fecaaf","text":"一"},{"id":"8b3a1c4d","text":"二"}],"passage":"8b3a1c4d"}"#
        let tap = try JSONDecoder().decode(CardTap.self, from: Data(json.utf8))
        #expect(tap.passages?.map(\.id) == ["14fecaaf", "8b3a1c4d"])
        #expect(tap.passage == "8b3a1c4d")
        // A short card answers as in round 26: no passages, no pick.
        let short = try JSONDecoder().decode(CardTap.self, from: Data(#"{"mine":false,"faces":[],"more":false,"mayNote":true}"#.utf8))
        #expect(short.passages == nil && short.passage == nil)
    }

    @Test func aReadingReportSendsRunningTotals() async throws {
        let transport = StubTransport(status: .noContent, body: "")
        try await api(transport).reportReading("c1", .init(session: "abcd-1234", activeSeconds: 42, progress: 0.5, reachedEnd: false,
                                                          shared: true))
        let sent = try #require(transport.sentJSON.first ?? nil)
        #expect(transport.requests.first?.method == .post)
        #expect(transport.requests.first?.bare.hasSuffix("/cards/c1/reading") == true)
        #expect(sent["session"] as? String == "abcd-1234")
        #expect(sent["activeSeconds"] as? Double == 42)
        #expect(sent["progress"] as? Double == 0.5)
        #expect(sent["reachedEnd"] as? Bool == false)
        #expect(sent["shared"] as? Bool == true)
    }
}
