import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Site links open in the app from the site's host — the origin's, or the one
/// the site had before its own domain, whose links are in older stories — and
/// from no look-alike of either.
@MainActor @Suite struct RouteTests {
    let origin = AppConfig.production.origin
    func route(_ link: String) -> Route? { Route(url: URL(string: link)!, origin: origin) }

    @Test func pagesOnTheSitesHostsOpenInTheApp() {
        #expect(route("https://resonance.channel/card/a-walk") == .card("a-walk"))
        #expect(route("https://Resonance.Channel/zh-TW/u/bob") == .author("bob"))
        #expect(route("https://resonance.channel/en/me/thought-map") == .thoughtMap)
        #expect(route("https://resonance-world.vercel.app/card/a-walk") == .card("a-walk"))
        #expect(route("https://resonance-world.vercel.app/en/u/bob") == .author("bob"))
        // A path alone (a push's route) is the site's.
        #expect(route("/card/a-walk") == .card("a-walk"))
    }

    @Test func otherHostsAndOtherPagesDoNot() {
        #expect(route("https://resonance.channel.example.com/card/a-walk") == nil)
        #expect(route("https://resonance.channel@example.com/card/a-walk") == nil)
        #expect(route("https://resonance-world.vercel.app.example.com/card/a-walk") == nil)
        #expect(route("https://img.resonance.channel/card/a-walk") == nil)
        #expect(route("https://example.com/card/a-walk") == nil)
        // The policy pages stay with the in-app browser.
        #expect(route("https://resonance.channel/zh-TW/privacy") == nil)
    }

    @Test func aLinksIdsAreIdsOrTheyAreLeftOut() {
        let plain = Route.thread(handle: "bob", note: nil)
        let answering = Route.thread(handle: "bob", note: MessagingAPI.NoteRef(cardId: "c1", noteId: "n1"))
        #expect(route("https://resonance.channel/messages/bob?note=n1&card=c1") == answering)
        #expect(route("https://resonance.channel/messages/bob?note=Ab-9_z&card=AbC123xyz") == .thread(handle: "bob",
            note: MessagingAPI.NoteRef(cardId: "AbC123xyz", noteId: "Ab-9_z")))
        // A note id with a "/" (raw or %2F), empty, or no value — the thread would read it as a document and Firestore
        // would end the app: the conversation opens without it. The card's id alike.
        for query in ["note=a/b&card=c1", "note=a%2Fb&card=c1", "note=&card=c1", "note&card=c1", "card=c1",
                      "note=n1&card=a/b", "note=n1&card=a%2Fb", "note=n1&card=", "note=n1",
                      "note=..&card=c1", "note=n%201&card=c1", "note=%E7%AD%86&card=c1",
                      "note=\(String(repeating: "a", count: 129))&card=c1"] {
            #expect(route("https://resonance.channel/zh-TW/messages/bob?\(query)") == plain, "\(query)")
        }
        // The longest id a link may name.
        let long = String(repeating: "a", count: 128)
        #expect(route("https://resonance.channel/messages/bob?note=\(long)&card=c1")
            == .thread(handle: "bob", note: MessagingAPI.NoteRef(cardId: "c1", noteId: long)))
        #expect(Route.linkId(nil) == nil && Route.linkId("") == nil && Route.linkId("a/b") == nil && Route.linkId("n1") == "n1")
        // A key or a pen name holding a "/" (a "%2F" in the link) names no page here.
        #expect(route("https://resonance.channel/card/a%2Fb") == nil)
        #expect(route("https://resonance.channel/u/a%2Fb") == nil)
        #expect(route("https://resonance.channel/messages/a%2Fb") == nil)
        #expect(route("https://resonance.channel/card/%2F") == nil)
    }

    @Test func theLocalStackRoutesItsOwnPages() {
        let local = AppConfig.emulator.origin
        #expect(Route(url: URL(string: "http://127.0.0.1:3100/card/a-walk")!, origin: local) == .card("a-walk"))
        #expect(Route(url: URL(string: "https://example.com/card/a-walk")!, origin: local) == nil)
    }
}
