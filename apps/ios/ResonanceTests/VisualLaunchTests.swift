import Foundation
import Testing
import UIKit
@testable import Resonance

/// The debug launch switch the Maestro flows lean on (maestro/flows): `-openLink` hands a link to the app as it
/// launches, as a tapped universal link would (a debug build on the simulator claims no domain).
@MainActor @Suite struct VisualLaunchTests {
    @Test func aLaunchLinkIsAURLOrNothing() {
        #expect(LinkInbox.launchLink(nil) == nil)
        #expect(LinkInbox.launchLink("   ") == nil)
        #expect(LinkInbox.launchLink(" http://127.0.0.1:3150/card/rain-walk ") == URL(string: "http://127.0.0.1:3150/card/rain-walk"))
        // A crafted link still reaches the inbox, as a tapped one would: IncomingLink decides what it opens (never a crash).
        let crafted = LinkInbox.launchLink("http://127.0.0.1:3150/messages/bob?note=a%2Fb&card=c1")
        #expect(crafted != nil)
    }

    @Test func aLaunchLinkWaitsInTheInboxLikeATappedOne() throws {
        let inbox = LinkInbox()
        let link = try #require(LinkInbox.launchLink("http://127.0.0.1:3150/u/bob"))
        inbox.receive(link) { _ in false }
        #expect(inbox.take() == link)
        #expect(IncomingLink.of(link, origin: URL(string: "http://127.0.0.1:3150")!) == .route(.author("bob")))
    }
}
