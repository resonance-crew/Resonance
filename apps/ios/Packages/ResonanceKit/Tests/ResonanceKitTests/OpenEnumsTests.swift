import Foundation
import HTTPTypes
import OpenAPIRuntime
import Testing
@testable import ResonanceAPI
@testable import ResonanceKit

/// A value the contract adds to one of its enums later reaches installed apps
/// before they know it: the answer it is in still reads, through the clients
/// the app makes (`ResonanceClient.make`), with only that field approximated.
@Suite struct OpenEnumsTests {
    func reading(_ transport: StubTransport) -> ReadingAPI {
        ReadingAPI(client: ResonanceClient.make(APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in "t" }),
                                                transport: transport, middlewares: []))
    }

    func profiles(_ transport: StubTransport) -> ProfileAPI {
        ProfileAPI(client: ResonanceClient.make(APIConfiguration(origin: URL(string: "https://example.test")!, idToken: { _ in "t" }),
                                                transport: transport, middlewares: []))
    }

    static func card(_ id: String, visibility: String = "public") -> String {
        ReadingAPITests.card(id).replacingOccurrences(of: #""visibility":"public""#, with: #""visibility":"\#(visibility)""#)
    }

    @Test func aFeedWithAVisibilityFromTheFutureStillReads() async throws {
        let transport = StubTransport(body: #"{"cards":[\#(Self.card("c1", visibility: "followers")),\#(Self.card("c2"))],"nextCursor":null}"#)
        let page = try await reading(transport).feed()
        #expect(page.cards.map(\.id) == ["c1", "c2"])
        // Taken for the narrowest audience this build knows; the others are as sent.
        #expect(page.cards.map(\.visibility) == [._private, ._public])
        #expect(page.cards.first?.title == "一場雨後的散步")
    }

    @Test func aCardPageWithAnUnknownVisibilityStillReads() async throws {
        let detail = ReadingAPITests.detail(lists: "").replacingOccurrences(of: #""visibility":"public","anonymous""#,
                                                                            with: #""visibility":"followers","anonymous""#)
        let transport = StubTransport(body: detail)
        let card = try await reading(transport).card("a-walk")
        #expect(card.visibility == ._private)
        #expect(card.story == "[一場雨](/card/rain)\n\n")
    }

    @Test func aProfileWritingInALanguageTheAppDoesntKnowStillReads() async throws {
        let transport = StubTransport(body: """
        {"id":"u1","handle":"bob","initials":"BO","accentColor":"oklch(90% 0.05 60)","bio":"你好","avatarUrl":null,
         "region":"JP","primaryLocale":"ja","handleChangedAt":null}
        """)
        let me = try await profiles(transport).me()
        #expect(me?.handle == "bob")
        #expect(me?.bio == "你好")
        #expect(me?.primaryLocale == .en)
    }

    @Test func picksWithAStatusFromTheFutureStillRead() async throws {
        let transport = StubTransport(body: #"{"cards":[\#(Self.card("c1"))],"status":"warming"}"#)
        #expect(try await reading(transport).recommended().map(\.id) == ["c1"])
    }

    @Test func anErrorCodeFromTheFutureIsStillAnError() async throws {
        let transport = StubTransport(status: .notFound, body: #"{"error":{"code":"suspended","message":"This account is paused."}}"#)
        await #expect(throws: APIFailure(code: "internal", message: "This account is paused.", status: 404)) {
            try await reading(transport).card("a-walk")
        }
    }

    @Test func anAnswerWithNothingUnknownPassesUntouched() {
        let data = Data(#"{"cards":[\#(Self.card("c1"))],"status":"fresh"}"#.utf8)
        #expect(OpenEnums.normalize(data) == data)
        #expect(OpenEnums.normalize(Data("<html>".utf8)) == Data("<html>".utf8))
    }

    /// The look through an answer finds an unknown value wherever `normalize` would change one — deep in
    /// a list, in an object in a list, under a field of the table's name that holds an object — and
    /// nothing else: a known value, a field outside the table, a table field holding no string.
    @Test func anUnknownValueIsFoundWhereverItIsAndOnlyThen() throws {
        func holds(_ json: String) throws -> Bool {
            try OpenEnums.holdsUnknown(JSONSerialization.jsonObject(with: Data(json.utf8), options: [.fragmentsAllowed]))
        }
        #expect(try holds(#"{"a":{"b":[1,{"visibility":"followers"}]}}"#))
        #expect(try holds(#"[[{"code":"suspended"}]]"#))
        #expect(try holds(#"{"status":{"primaryLocale":"ja"}}"#))
        #expect(try !holds(#"{"a":{"b":[1,{"visibility":"public"}]},"status":"fresh"}"#))
        #expect(try !holds(#"{"kind":"followers","visibility":null,"code":7,"status":["warming"]}"#))
        #expect(try !holds(#""followers""#))
        // What it finds is exactly what normalizing changes.
        let unknown = Data(#"{"cards":[{"visibility":"followers","title":"t"}],"status":"fresh"}"#.utf8)
        let fixed = try #require(JSONSerialization.jsonObject(with: OpenEnums.normalize(unknown)) as? [String: Any])
        #expect((fixed["cards"] as? [[String: Any]])?.first?["visibility"] as? String == "private")
        #expect(fixed["status"] as? String == "fresh")
    }

    /// The look at the bytes lets an answer through unparsed only when every table field it holds is a known
    /// string or no string at all; a name inside a story's words, or as a value, is not a key (audit I9).
    @Test func theByteLookPassesOnlyWhatHoldsNothingUnknown() {
        func maybe(_ json: String) -> Bool { OpenEnums.mayHoldUnknown(Data(json.utf8)) }
        #expect(!maybe(#"{"cards":[\#(Self.card("c1"))],"status":"fresh"}"#))
        #expect(!maybe(#"{"kind":"followers","visibility":null,"code":7,"status":["warming"]}"#))
        #expect(!maybe(#"{"story":"she wrote \"visibility\": \"followers\"","field":"visibility"}"#))
        #expect(!maybe(#"{ "visibility" :  "public" }"#))
        #expect(maybe(#"{"a":{"b":[1,{"visibility":"followers"}]}}"#))
        #expect(maybe(#"[[{"code":"suspended"}]]"#))
        #expect(maybe(#"{"primaryLocale" : "ja"}"#))
        // An escape in the value: told apart only by parsing.
        let backslash = "\\"
        #expect(maybe(#"{"visibility":"pub"# + backslash + #"u006cic"}"#))
        #expect(maybe(#"{"visibility":"publ"#))
        // An unknown value the bytes flag is still normalized as before.
        let unknown = Data(#"{"cards":[{"visibility":"followers","title":"t"}]}"#.utf8)
        #expect(OpenEnums.normalize(unknown) != unknown)
    }

    /// `type` is an enum in a cover (`DraftMedia`, beside its `url`) and any string in a bell row: a cover kind
    /// from the future reads as a picture, a bell row's kind is never touched.
    @Test func aCoversTypeIsReadAsAnEnumAndABellRowsNever() throws {
        let edit = Data(#"{"edit":{"thoughtCore":"t","media":{"type":"gif","url":"https://img.example/a.gif"}}}"#.utf8)
        let fixed = try #require(JSONSerialization.jsonObject(with: OpenEnums.normalize(edit)) as? [String: Any])
        #expect(((fixed["edit"] as? [String: Any])?["media"] as? [String: Any])?["type"] as? String == "image")
        let bell = Data(#"{"items":[{"id":"n1","type":"note","payload":{"cardId":"c1"}}],"people":[],"nextPageToken":null}"#.utf8)
        #expect(OpenEnums.normalize(bell) == bell)
        let known = Data(#"{"media":{"type":"video","url":"https://img.example/a.mp4"}}"#.utf8)
        #expect(OpenEnums.normalize(known) == known)
    }

    /// Every enum the contract's answers carry is in the table, with the values
    /// this build knows, and no rule reads a field of its name where that name
    /// is a plain field (`within`) — so a new enum in an answer fails here
    /// until it is covered.
    @Test func theTableCoversEveryEnumInTheContractsAnswers() throws {
        let url = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
            .appendingPathComponent("../../../../../../openapi/v1/openapi.json").standardized
        let spec = try #require(try JSONSerialization.jsonObject(with: Data(contentsOf: url)) as? [String: Any])
        let schemas = try #require((spec["components"] as? [String: Any])?["schemas"] as? [String: Any])

        // The schemas reachable from any response.
        var reachable = Set<String>()
        func refs(_ node: Any) -> [String] {
            if let object = node as? [String: Any] {
                let own = (object["$ref"] as? String).map { [String($0.split(separator: "/").last!)] } ?? []
                return own + object.values.flatMap(refs)
            }
            if let array = node as? [Any] { return array.flatMap(refs) }
            return []
        }
        var queue = ((spec["paths"] as? [String: Any]) ?? [:]).values
            .flatMap { ($0 as? [String: Any])?.values.map { ($0 as? [String: Any])?["responses"] ?? [:] } ?? [] }
            .flatMap(refs)
        while let name = queue.popLast() {
            guard reachable.insert(name).inserted, let schema = schemas[name] else { continue }
            queue += refs(schema)
        }

        // Each property name in those schemas: the enum values it carries (nil: not an enum), and the keys the
        // object it is in requires and may hold.
        struct Use {
            let values: Set<String>?
            let required: Set<String>
            let keys: Set<String>
        }
        var properties: [String: [Use]] = [:]
        func collect(_ node: Any) {
            guard let object = node as? [String: Any] else {
                (node as? [Any])?.forEach(collect)
                return
            }
            let props = (object["properties"] as? [String: Any]) ?? [:]
            let required = Set(object["required"] as? [String] ?? [])
            for (name, property) in props {
                let p = property as? [String: Any] ?? [:]
                var values = (p["enum"] as? [String]).map(Set.init)
                if let ref = p["$ref"] as? String, let target = schemas[String(ref.split(separator: "/").last!)] as? [String: Any],
                   let e = target["enum"] as? [String] { values = Set(e) }
                properties[name, default: []].append(Use(values: values, required: required, keys: Set(props.keys)))
            }
            object.values.forEach(collect)
        }
        for name in reachable { collect(schemas[name] as Any) }

        let enums = properties.filter { $0.value.contains { $0.values != nil } }
        #expect(Set(enums.keys) == Set(OpenEnums.fields.keys))
        for (name, uses) in enums {
            let field = try #require(OpenEnums.fields[name])
            for use in uses {
                if let values = use.values {
                    // The rule reads it wherever it is an enum (its object always has the keys the rule looks for)…
                    #expect(field.within.isSubset(of: use.required), "\(name) is an enum where the rule's keys aren't required")
                    #expect(values == field.known, "\(name)")
                } else {
                    // …and never where it is a plain field (its object can't hold them all).
                    #expect(!field.within.isEmpty && !field.within.isSubset(of: use.keys), "\(name) is also a plain field the rule would read")
                }
            }
            #expect(field.known.contains(field.fallback))
        }
    }
}
