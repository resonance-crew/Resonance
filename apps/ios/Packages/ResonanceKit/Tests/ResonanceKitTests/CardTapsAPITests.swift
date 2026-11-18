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
        ReadingAPI(client: Client(serverURL: URL(string: "https://example.test/api/v1")!, transport: transport))
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
