import Foundation
import ResonanceKit
import Testing
@testable import Resonance

/// Round 23 §7: links to the site tapped in another app open the app (Universal Links), and the Smart App Banner's
/// 打開 does too — every one through the app's root `onOpenURL`, into the session's inbox, which the tabs empty once
/// they show: a cold launch's link waits through the restore, a sign-in or onboarding, and opens once.
@MainActor @Suite struct UniversalLinkTests {
    let origin = AppConfig.production.origin
    func link(_ string: String) -> IncomingLink { IncomingLink.of(URL(string: string)!, origin: origin) }

    // MARK: The inbox

    @Test func aLinkWaitsForTheTabsAndOpensOnce() {
        let inbox = LinkInbox()
        let card = URL(string: "https://resonance.channel/zh-TW/card/a-walk")!
        // Nobody to open it yet (the launch cover, a sign-in): it waits.
        inbox.receive(card) { _ in false }
        #expect(inbox.pending == card)
        // The tabs take it, once.
        #expect(inbox.take() == card)
        #expect(inbox.pending == nil)
        #expect(inbox.take() == nil)
    }

    @Test func googlesSignInCallbackIsGooglesAlone() {
        let inbox = LinkInbox()
        let callback = URL(string: "com.googleusercontent.apps.1090298219401-pgd3sh80h9ukvf4l564dpvegebi2s8o7:/oauth2redirect?code=x")!
        inbox.receive(callback) { $0 == callback }
        #expect(inbox.pending == nil)
    }

    @Test func oneLinkHandedOverTwiceInAMomentOpensOnceAndTheLatestWaits() {
        let inbox = LinkInbox()
        let now = Date(timeIntervalSince1970: 1_000)
        let card = URL(string: "https://resonance.channel/card/a-walk")!
        inbox.receive(card, now: now) { _ in false }
        #expect(inbox.take() == card)
        // The same tap delivered again a moment later (onOpenURL and a browsing activity both): nothing more.
        inbox.receive(card, now: now.addingTimeInterval(0.3)) { _ in false }
        #expect(inbox.pending == nil)
        // The same link tapped again later opens again.
        inbox.receive(card, now: now.addingTimeInterval(5)) { _ in false }
        #expect(inbox.take() == card)
        // Two links before the tabs show: the latest is the one that opens.
        let profile = URL(string: "https://resonance.channel/u/bob")!
        inbox.receive(card, now: now.addingTimeInterval(10)) { _ in false }
        inbox.receive(profile, now: now.addingTimeInterval(10.1)) { _ in false }
        #expect(inbox.take() == profile)
    }

    // MARK: What a link opens

    @Test func everyShapeTheAssociationClaimsOpensOnBothHosts() {
        for host in ["resonance.channel", "resonance-world.vercel.app"] {
            for prefix in ["", "/en", "/zh-TW"] {
                let base = "https://\(host)\(prefix)"
                #expect(link("\(base)/card/a-walk") == .route(.card("a-walk")))
                #expect(link("\(base)/u/bob") == .route(.author("bob")))
                #expect(link("\(base)/me/thought-map") == .route(.thoughtMap))
                #expect(link("\(base)/me/thought-map/") == .route(.thoughtMap))
                #expect(link("\(base)/messages/bob") == .route(.thread(handle: "bob", note: nil)))
                // A note's reply link keeps the note it answers.
                #expect(link("\(base)/messages/bob?note=n1&card=c1")
                    == .route(.thread(handle: "bob", note: MessagingAPI.NoteRef(cardId: "c1", noteId: "n1"))))
            }
        }
        // A card's id (an anonymous card's link is its id) and a percent-encoded pen name.
        #expect(link("https://resonance.channel/card/AbC123xyz") == .route(.card("AbC123xyz")))
        #expect(link("https://resonance.channel/u/%E6%B5%B7%E9%B9%BD") == .route(.author("海鹽")))
    }

    @Test func aClaimedPageTheAppCantShowOpensInTheInAppBrowser() {
        // /card/?* claims more than one segment: the page opens in the app's browser, never nowhere.
        let deep = "https://resonance.channel/zh-TW/card/a-walk/extra"
        #expect(link(deep) == .browser(URL(string: deep)!))
        #expect(link("https://resonance-world.vercel.app/u/bob/cards") == .browser(URL(string: "https://resonance-world.vercel.app/u/bob/cards")!))
    }

    @Test func theBannersOtherPagesOnlyBringTheAppForward() {
        // The landing page's banner (its app-argument is the landing page), /about, /paper-pals, the policies: the
        // app comes to the front, no page of the site opens over it.
        #expect(link("https://resonance.channel/zh-TW") == .none)
        #expect(link("https://resonance.channel/") == .none)
        #expect(link("https://resonance.channel/en/about") == .none)
        #expect(link("https://resonance.channel/zh-TW/paper-pals") == .none)
        #expect(link("https://resonance.channel/zh-TW/privacy") == .none)
        #expect(link("https://resonance.channel/card/") == .none)
        // Another host, or a look-alike of ours: nothing.
        #expect(link("https://example.com/card/a-walk") == .none)
        #expect(link("https://resonance.channel.example.com/card/a-walk") == .none)
        #expect(link("https://img.resonance.channel/card/a-walk/x") == .none)
    }

    @Test func onlyTheSitesOwnPagesOpenAnything() {
        // Another scheme — Google's own callback should its sign-in decline it, an app's, a file — or no host at all
        // opens nothing, though a route would take the path (the app registers no scheme of its own).
        for other in ["com.googleusercontent.apps.1090298219401-pgd3sh80h9ukvf4l564dpvegebi2s8o7:/card/a-walk",
                      "com.googleusercontent.apps.1090298219401-pgd3sh80h9ukvf4l564dpvegebi2s8o7://resonance.channel/u/bob",
                      "resonance:/messages/bob?note=a/b&card=c1", "resonance://resonance.channel/card/a-walk",
                      "ftp://resonance.channel/card/a-walk", "file:///card/a-walk", "/card/a-walk", "card/a-walk",
                      "https:/card/a-walk"] {
            #expect(link(other) == .none, "\(other)")
        }
        // http on the site's hosts still opens (the old links), and the local stack's own origin for its build.
        #expect(link("http://resonance.channel/card/a-walk") == .route(.card("a-walk")))
        #expect(IncomingLink.of(URL(string: "http://127.0.0.1:3100/u/bob")!, origin: AppConfig.emulator.origin) == .route(.author("bob")))
    }

    @Test func aCraftedLinkOpensTheThreadWithoutWhatItCantName() {
        // One tap from any app: a note id Firestore can't take as a document opens the conversation alone, never ends it.
        for query in ["note=a/b&card=c1", "note=&card=c1", "note=n1&card=a%2Fb", "note=n1&card="] {
            #expect(link("https://resonance.channel/messages/bob?\(query)") == .route(.thread(handle: "bob", note: nil)), "\(query)")
        }
        // A pen name or a card key decoded with a "/" in it: the site's page, in the in-app browser.
        let slashed = "https://resonance.channel/card/a%2Fb"
        #expect(link(slashed) == .browser(URL(string: slashed)!))
        let named = "https://resonance.channel/messages/a%2Fb?note=n1&card=c1"
        #expect(link(named) == .browser(URL(string: named)!))
    }

    @Test func theClaimedPathsAreTheAssociationsOwn() {
        for path in ["/card/x", "/u/x", "/messages/x", "/me/thought-map", "/en/card/x", "/zh-TW/me/thought-map/", "/card/x/y"] {
            #expect(IncomingLink.claims(path), "\(path)")
        }
        for path in ["/", "/card", "/card/", "/me", "/me/cards", "/home", "/api/v1/me", "/en", "/zh-TW/about", "/notifications"] {
            #expect(!IncomingLink.claims(path), "\(path)")
        }
    }
}
